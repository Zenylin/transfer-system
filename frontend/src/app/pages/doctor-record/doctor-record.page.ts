import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActiveCaseService } from '../../services/active-case.service';
import { persistFormSection } from '../../services/case-form.util';
import { Time24hComponent } from '../../components/time-24h/time-24h.component';
import { PrintReportComponent } from '../../components/print-report/print-report.component';
import { NUM } from '../_shared/number-limits';
import { NumericOnlyDirective } from '../_shared/numeric-only.directive';
import { nowHm, todayYmd } from '../_shared/date-time.util';
import {
  addPrintRow,
  emptyPrintFallback,
  isPrintFilled,
  pushPrintSection,
  runPreviewPrint,
  type PrintSection,
} from '../_shared/print-report.util';
import { DOCTOR_NUM_SPECS, LEN, findOutOfRange } from '../_shared/form-validation.util';

type EvalDef = { key: string; label: string; c0: string; c1: string; c2: string };

const EVAL_DEFS: EvalDef[] = [
  { key: 'skin', label: '膚色', c0: '全身發紺', c1: '末梢發紺', c2: '全身發紅' },
  { key: 'activity', label: '活動力', c0: '無反應', c1: '刺激有反應', c2: '活動自如' },
  { key: 'tone', label: '肌肉張力', c0: '無張力', c1: '尚可', c2: '強而有力' },
  { key: 'hr', label: '心跳', c0: '< 100', c1: '不規則', c2: '正常速率' },
  { key: 'rr', label: '呼吸速率', c0: '> 80', c1: '61~80', c2: '40~60' },
  { key: 'assist', label: '輔助呼吸情況', c0: '使用呼吸器', c1: '使用 O2', c2: 'Room Air' },
  { key: 'spo2', label: '血氧飽合度', c0: '< 80 %', c1: '81~90 %', c2: '91~100 %' },
];

const TIME_SLOTS = 6;

@Component({
  selector: 'app-doctor-record-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    Time24hComponent,
    PrintReportComponent,
    NumericOnlyDirective,
  ],
  templateUrl: './doctor-record.page.html',
  styleUrls: ['../_shared/case-form.css'],
})
export class DoctorRecordPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private casesApi = inject(ActiveCaseService);

  readonly NUM = NUM;
  readonly LEN = LEN;
  readonly evalDefs = EVAL_DEFS;
  readonly slotIndexes = Array.from({ length: TIME_SLOTS }, (_, i) => i);
  readonly scoreOpts = [0, 1, 2];

  caseId = '';
  serial = '';
  hospital = '';
  savedMsg = '';
  printing = false;
  printAt = '';
  printSections: PrintSection[] = [];
  /** 病史表呼吸系統有填時已帶入（可改、不回寫） */
  respFromHistory = false;

  private readonly respImportKeys = [
    'noRespProblem',
    'respSymptoms',
    'o2HoodLpm',
    'o2CannulaLpm',
    'ncpapFio2',
    'ncpapPeep',
    'nimvRate',
    'nimvFio2',
    'imvRate',
    'imvFio2',
    'ettSize',
    'ettFixCm',
  ] as const;

  form = this.fb.group({
    noRespProblem: [false],
    respSymptoms: this.fb.nonNullable.control<string[]>([]),
    o2HoodLpm: [null as number | null],
    o2CannulaLpm: [null as number | null],
    ncpapFio2: [null as number | null],
    ncpapPeep: [null as number | null],
    nimvRate: [null as number | null],
    nimvFio2: [null as number | null],
    imvRate: [null as number | null],
    imvFio2: [null as number | null],
    ettSize: [''],
    ettFixCm: [null as number | null],
    respNote: [''], // 現場處置
    evalTimes: this.fb.array(Array.from({ length: TIME_SLOTS }, () => this.fb.control(''))),
    evalScores: this.fb.array(EVAL_DEFS.map((d) => this.makeScoreRow(d.key))),
    ventRateFio2: this.fb.array(Array.from({ length: TIME_SLOTS }, () => this.fb.control(''))),
    ventPipPeep: this.fb.array(Array.from({ length: TIME_SLOTS }, () => this.fb.control(''))),
    ventIeRatio: this.fb.array(Array.from({ length: TIME_SLOTS }, () => this.fb.control(''))),
    specialNone: [false],
    specialEvents: this.fb.nonNullable.control<string[]>([]),
    specialOther: [''],
    enRouteManagement: [''],
    ambulancePeople: [null as number | null],
    doctorSignature: [''],
  });

  private makeScoreRow(key: string): FormGroup {
    const g: Record<string, unknown> = { key: [key] };
    for (let i = 0; i < TIME_SLOTS; i++) g[`s${i}`] = [null as number | null];
    return this.fb.group(g);
  }

  get evalTimes(): FormArray {
    return this.form.get('evalTimes') as FormArray;
  }
  get evalScores(): FormArray {
    return this.form.get('evalScores') as FormArray;
  }
  get ventRateFio2(): FormArray {
    return this.form.get('ventRateFio2') as FormArray;
  }
  get ventPipPeep(): FormArray {
    return this.form.get('ventPipPeep') as FormArray;
  }
  get ventIeRatio(): FormArray {
    return this.form.get('ventIeRatio') as FormArray;
  }

  scoreGroup(i: number): FormGroup {
    return this.evalScores.at(i) as FormGroup;
  }

  totalAt(slot: number): number | '' {
    let sum = 0;
    let any = false;
    for (let r = 0; r < this.evalScores.length; r++) {
      const v = this.scoreGroup(r).get(`s${slot}`)?.value;
      if (v === 0 || v === 1 || v === 2) {
        sum += Number(v);
        any = true;
      }
    }
    return any ? sum : '';
  }

  async ngOnInit(): Promise<void> {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    this.casesApi.select(this.caseId);
    const detail = await this.casesApi.ensureCase(this.caseId);
    if (!detail) {
      void this.router.navigate(['/']);
      return;
    }
    this.serial = detail.serial;
    this.hospital = detail.hospitalName;
    const data = this.casesApi.formData(this.caseId, 'doctor-record');
    if (Object.keys(data).length) {
      // 新格式
      if (Array.isArray(data['evalScores']) && (data['evalScores'] as unknown[]).length) {
        this.patchArray('evalTimes', data['evalTimes']);
        this.patchScoreArray(data['evalScores'] as any[]);
        this.patchArray('ventRateFio2', data['ventRateFio2']);
        this.patchArray('ventPipPeep', data['ventPipPeep']);
        this.patchArray('ventIeRatio', data['ventIeRatio']);
        const {
          evalTimes: _t,
          evalScores: _s,
          ventRateFio2: _v1,
          ventPipPeep: _v2,
          ventIeRatio: _v3,
          evalRows: _old,
          ...rest
        } = data;
        this.form.patchValue(rest);
      } else {
        // 舊 evalRows 僅帶入一般欄位
        const { evalRows: _e, ...rest } = data;
        this.form.patchValue(rest);
      }
    }
    this.applyHistoryResp();
  }

  /** 病史表呼吸系統有填 → 帶入相同欄位（可改、不回寫病史） */
  private applyHistoryResp(): void {
    const hist = this.casesApi.formData(this.caseId, 'history');
    const hasData = this.respImportKeys.some((k) => this.hasFilled(hist[k]));
    if (!hasData) {
      this.respFromHistory = false;
      return;
    }

    const patch: Record<string, unknown> = {};
    for (const k of this.respImportKeys) {
      if (!(k in hist)) continue;
      if (k === 'respSymptoms') {
        patch[k] = Array.isArray(hist[k]) ? hist[k] : [];
      } else {
        patch[k] = hist[k];
      }
    }
    // 現場處置：病史備註僅在醫師欄空白時帶入
    const doctorNote = String(this.form.controls.respNote.value || '').trim();
    const histNote = String(hist['respNote'] || '').trim();
    if (!doctorNote && histNote) patch['respNote'] = histNote;

    this.form.patchValue(patch);
    this.respFromHistory = true;
  }

  private hasFilled(v: unknown): boolean {
    if (typeof v === 'boolean') return v === true;
    if (Array.isArray(v)) return v.length > 0;
    if (v == null) return false;
    return String(v).trim() !== '';
  }

  private patchArray(name: 'evalTimes' | 'ventRateFio2' | 'ventPipPeep' | 'ventIeRatio', raw: unknown): void {
    if (!Array.isArray(raw)) return;
    const arr = this.form.get(name) as FormArray;
    for (let i = 0; i < TIME_SLOTS; i++) {
      if (raw[i] != null) arr.at(i).setValue(String(raw[i] ?? ''));
    }
  }

  private patchScoreArray(rows: any[]): void {
    for (const def of EVAL_DEFS) {
      const src = rows.find((r) => r?.key === def.key) || rows.find((r) => r?.label === def.label);
      if (!src) continue;
      const idx = EVAL_DEFS.findIndex((d) => d.key === def.key);
      const g = this.scoreGroup(idx);
      for (let i = 0; i < TIME_SLOTS; i++) {
        const v = src[`s${i}`];
        if (v === 0 || v === 1 || v === 2 || v === '0' || v === '1' || v === '2') {
          g.get(`s${i}`)?.setValue(Number(v));
        }
      }
    }
  }

  toggle(control: 'respSymptoms' | 'specialEvents', value: string, on: boolean): void {
    const ctrl = this.form.controls[control];
    const set = new Set(ctrl.value);
    if (on) set.add(value);
    else set.delete(value);
    ctrl.setValue([...set]);
  }

  has(control: 'respSymptoms' | 'specialEvents', value: string): boolean {
    return this.form.controls[control].value.includes(value);
  }

  async save(): Promise<void> {
    try {
      this.savedMsg = await persistFormSection(
        this.casesApi,
        this.caseId,
        'doctor-record',
        this.form,
        {
          validate: (raw) => {
            const bad = findOutOfRange(raw, DOCTOR_NUM_SPECS);
            return bad.length ? `數值超出範圍：${bad.join('、')}` : null;
          },
        },
      );
    } catch (e: any) {
      this.savedMsg = e?.message || '存檔失敗';
    }
  }

  previewPrint(): void {
    this.printAt = `${todayYmd()} ${nowHm()}`;
    this.printSections = this.buildPrintReport();
    runPreviewPrint((on) => (this.printing = on));
  }

  private buildPrintReport(): PrintSection[] {
    const v = this.form.getRawValue() as any;
    const out: PrintSection[] = [];
    const add = addPrintRow;

    const s1: { label: string; value: string }[] = [];
    add(s1, '無呼吸問題', v.noRespProblem);
    add(s1, '症狀', v.respSymptoms);
    add(s1, 'O2 Hood L/min', v.o2HoodLpm);
    add(s1, 'O2 Cannula L/min', v.o2CannulaLpm);
    add(s1, 'N-CPAP FiO2 %', v.ncpapFio2);
    add(s1, 'N-CPAP PEEP', v.ncpapPeep);
    add(s1, 'NIMV Rate', v.nimvRate);
    add(s1, 'NIMV FiO2 %', v.nimvFio2);
    add(s1, 'IMV Rate', v.imvRate);
    add(s1, 'IMV FiO2 %', v.imvFio2);
    add(s1, '氣管內管號', v.ettSize);
    add(s1, '固定公分', v.ettFixCm);
    add(s1, '現場處置', v.respNote);
    pushPrintSection(out, '三、（三）主要處置｜1.呼吸系統', s1);

    const s2: { label: string; value: string }[] = [];
    for (let i = 0; i < TIME_SLOTS; i++) {
      const t = v.evalTimes?.[i];
      if (!isPrintFilled(t) && !EVAL_DEFS.some((_, ri) => isPrintFilled(v.evalScores?.[ri]?.[`s${i}`]))) {
        continue;
      }
      const parts: string[] = [];
      if (isPrintFilled(t)) parts.push(`時間 ${t}`);
      EVAL_DEFS.forEach((d, ri) => {
        const sc = v.evalScores?.[ri]?.[`s${i}`];
        if (isPrintFilled(sc) || sc === 0) parts.push(`${d.label}=${sc}`);
      });
      const tot = this.totalAt(i);
      if (tot !== '') parts.push(`總分=${tot}`);
      if (isPrintFilled(v.ventRateFio2?.[i])) parts.push(`Rate/FiO2=${v.ventRateFio2[i]}`);
      if (isPrintFilled(v.ventPipPeep?.[i])) parts.push(`PIP/PEEP=${v.ventPipPeep[i]}`);
      if (isPrintFilled(v.ventIeRatio?.[i])) parts.push(`I/E=${v.ventIeRatio[i]}`);
      if (parts.length) add(s2, `紀錄欄 ${i + 1}`, parts.join('；'));
    }
    pushPrintSection(out, '轉接過程患嬰狀況評估', s2);

    const s3: { label: string; value: string }[] = [];
    add(s3, '回程搭乘救護車人數', v.ambulancePeople);
    add(s3, '轉接途中之處置', v.enRouteManagement);
    add(s3, '無特殊狀況', v.specialNone);
    add(s3, '其他特殊狀況', v.specialEvents);
    add(s3, '其他說明', v.specialOther);
    add(s3, '醫師簽名', v.doctorSignature);
    pushPrintSection(out, '轉接途中處置／特殊狀況／簽名', s3);

    return emptyPrintFallback(out);
  }
}
