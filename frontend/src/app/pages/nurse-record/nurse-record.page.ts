import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActiveCaseService } from '../../services/active-case.service';
import { initCaseFormPage, persistFormSection } from '../../services/case-form.util';
import { Time24hComponent } from '../../components/time-24h/time-24h.component';
import { Datetime24hComponent } from '../../components/time-24h/datetime-24h.component';
import { PrintReportComponent } from '../../components/print-report/print-report.component';
import { NUM } from '../_shared/number-limits';
import { NumericOnlyDirective } from '../_shared/numeric-only.directive';
import {
  defaultEmptyDates,
  defaultEmptyDateTimes,
  defaultEmptyTimes,
  nowDateTimeLocal,
  nowHm,
  todayYmd,
} from '../_shared/date-time.util';
import {
  addPrintRow,
  emptyPrintFallback,
  mapGiven,
  mapGlucoseMode,
  mapYesNo,
  pushPrintSection,
  runPreviewPrint,
  type PrintSection,
} from '../_shared/print-report.util';
import {
  LEN,
  NURSE_NUM_SPECS,
  applyGlucoseMode,
  applyNpoLock,
  findOutOfRange,
  isValidBp,
  isValidTwId,
  shouldPrintBtType,
  validateGlucose,
} from '../_shared/form-validation.util';

@Component({
  selector: 'app-nurse-record-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    Time24hComponent,
    Datetime24hComponent,
    PrintReportComponent,
    NumericOnlyDirective,
  ],
  templateUrl: './nurse-record.page.html',
  styleUrls: ['../_shared/case-form.css'],
})
export class NurseRecordPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private casesApi = inject(ActiveCaseService);

  readonly NUM = NUM;
  readonly todayMax = todayYmd();
  readonly nowMax = nowDateTimeLocal();
  readonly LEN = LEN;
  /** 病史表已填腸胃資料時鎖定（僅備註可改） */
  giLockedFromHistory = false;
  /** 病史表已填抽血／用藥時鎖定 */
  labsLockedFromHistory = false;
  caseId = '';
  serial = '';
  hospital = '';
  savedMsg = '';
  printing = false;
  printAt = '';
  printSections: PrintSection[] = [];

  private readonly giImportKeys = [
    'npo',
    'feedMl',
    'feedEveryHr',
    'glucoseMode',
    'glucoseValue',
    'ogTube',
    'ogSize',
    'ogCm',
  ] as const;

  private readonly labsImportKeys = [
    'labs',
    'labsValue',
    'vitK',
    'eyeDrop',
    'otherDrugs',
    'otherDrugsType',
    'antibiotics',
  ] as const;

  private readonly handoverKeys = [
    'returnDepartAt',
    'returnArriveWardAt',
    'admitBtType',
    'admitBt',
    'admitHr',
    'admitRr',
    'admitSpo2',
    'admitBp',
  ] as const;

  form = this.fb.group({
    otherNote: [''],
    departDate: [''],
    departTime: [''],
    arriveOutsideTime: [''],
    arriveBtType: [''],
    arriveBt: [null as number | null],
    arriveHr: [null as number | null],
    arriveRr: [null as number | null],
    arriveSpo2: [null as number | null],
    arriveBp: [''],
    npo: [false],
    feedMl: [null as number | null],
    feedEveryHr: [null as number | null],
    glucoseMode: [''],
    glucoseValue: [null as number | null],
    ogTube: [false],
    ogSize: [''],
    ogCm: [null as number | null],
    giNote: [''],
    labs: [''],
    labsValue: [''],
    vitK: [''],
    eyeDrop: [''],
    antibiotics: this.fb.nonNullable.control<string[]>([]),
    otherDrugs: [''],
    otherDrugsType: [''],
    noAbnormal: [false],
    appearance: this.fb.nonNullable.control<string[]>([]),
    appearanceOther: [''],
    treatmentOther: [''],
    momIdNo: [''],
    momBirthday: [''],
    chkReferralForm: [false],
    chkConsent: [false],
    chkChildBook: [false],
    hbvStatus: [''],
    hbigStatus: [''],
    nbsStatus: [''],
    hearingStatus: [''],
    chkAmbulanceReceipt: [false],
    skinSensorTemp: [null as number | null],
    therapeuticHypothermia: [false],
    evalNote: [''],
    // 原交班單欄位（併入簽名前）
    returnDepartAt: [''],
    returnArriveWardAt: [''],
    admitBtType: [''],
    admitBt: [null as number | null],
    admitHr: [null as number | null],
    admitRr: [null as number | null],
    admitSpo2: [null as number | null],
    admitBp: [''],
    escortNurseSignature: [''],
    handoverNurseSignature: [''],
  });

  async ngOnInit(): Promise<void> {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    const ok = await initCaseFormPage(this.casesApi, this.caseId, 'nurse-record', this.form, {
      onLoaded: (d) => {
        this.serial = d.serial;
        this.hospital = d.hospitalName;
        if (!this.form.controls.departDate.value) {
          this.form.patchValue({ departDate: d.callDate || todayYmd() });
        }
      },
    });
    if (!ok) {
      void this.router.navigate(['/']);
      return;
    }
    this.mergeHandoverSection();
    this.migrateScreeningStatus();
    defaultEmptyDates(this.form, ['departDate']);
    defaultEmptyTimes(this.form, ['departTime', 'arriveOutsideTime', 'returnArriveWardAt']);
    defaultEmptyDateTimes(this.form, ['returnDepartAt']);
    this.applyHistoryGi();
    this.applyHistoryLabs();
    this.bindGiLocks();
    this.syncGiLocks();
  }

  private bindGiLocks(): void {
    this.form.controls.npo.valueChanges.subscribe(() => this.syncGiLocks());
    this.form.controls.glucoseMode.valueChanges.subscribe(() => this.syncGiLocks());
  }

  private syncGiLocks(): void {
    applyNpoLock(this.form, this.giLockedFromHistory);
    applyGlucoseMode(this.form, this.giLockedFromHistory);
  }

  /** 舊交班單資料併入（護理單尚未有值時） */
  private mergeHandoverSection(): void {
    const ho = this.casesApi.formData(this.caseId, 'handover');
    if (!Object.keys(ho).length) return;
    const patch: Record<string, unknown> = {};
    for (const k of this.handoverKeys) {
      const cur = this.form.get(k)?.value;
      const empty = cur == null || String(cur).trim() === '';
      if (empty && k in ho) patch[k] = ho[k];
    }
    if (Object.keys(patch).length) this.form.patchValue(patch);
  }

  /** 舊篩檢選項對應到 HBV 同款文案 */
  private migrateScreeningStatus(): void {
    for (const key of ['hbvStatus', 'hbigStatus', 'nbsStatus', 'hearingStatus'] as const) {
      const v = String(this.form.controls[key].value || '');
      if (v === '已完成' || v === '已蓋章' || v === '不需要施打') {
        this.form.controls[key].setValue('已完成加以蓋章');
      }
    }
  }

  /** 病史表腸胃有填 → 帶入並鎖定（備註除外） */
  private applyHistoryGi(): void {
    const hist = this.casesApi.formData(this.caseId, 'history');
    const hasData = this.giImportKeys.some((k) => this.hasFilled(hist[k]));
    if (!hasData) {
      this.giLockedFromHistory = false;
      return;
    }

    const patch: Record<string, unknown> = {};
    for (const k of this.giImportKeys) {
      if (k in hist) patch[k] = hist[k];
    }
    const nurseNote = String(this.form.controls.giNote.value || '').trim();
    const histNote = String(hist['giNote'] || '').trim();
    if (!nurseNote && histNote) patch['giNote'] = histNote;

    this.form.patchValue(patch);
    for (const k of this.giImportKeys) {
      this.form.controls[k].disable({ emitEvent: false });
    }
    this.giLockedFromHistory = true;
    this.syncGiLocks();
  }

  /** 病史表抽血／用藥有填 → 帶入並鎖定 */
  private applyHistoryLabs(): void {
    const hist = this.casesApi.formData(this.caseId, 'history');
    const hasData = this.labsImportKeys.some((k) => this.hasFilled(hist[k]));
    if (!hasData) {
      this.labsLockedFromHistory = false;
      return;
    }

    const patch: Record<string, unknown> = {};
    for (const k of this.labsImportKeys) {
      if (!(k in hist)) continue;
      if (k === 'antibiotics') {
        patch[k] = Array.isArray(hist[k]) ? hist[k] : [];
      } else {
        patch[k] = hist[k];
      }
    }
    this.form.patchValue(patch);
    for (const k of this.labsImportKeys) {
      this.form.controls[k].disable({ emitEvent: false });
    }
    this.labsLockedFromHistory = true;
  }

  private hasFilled(v: unknown): boolean {
    if (typeof v === 'boolean') return v === true;
    if (Array.isArray(v)) return v.length > 0;
    if (v == null) return false;
    return String(v).trim() !== '';
  }

  toggle(control: 'antibiotics' | 'appearance', value: string, on: boolean): void {
    const ctrl = this.form.controls[control];
    const set = new Set(ctrl.value);
    if (on) set.add(value);
    else set.delete(value);
    ctrl.setValue([...set]);
  }

  has(control: 'antibiotics' | 'appearance', value: string): boolean {
    return this.form.controls[control].value.includes(value);
  }

  onSkinTemp(): void {
    if (this.form.controls.therapeuticHypothermia.value) return;
    const t = this.form.controls.skinSensorTemp.value;
    if (t != null && t < 36.5) {
      alert('提醒：保溫箱溫度設定 +0.5℃');
    }
  }

  async save(): Promise<void> {
    try {
      this.savedMsg = await persistFormSection(
        this.casesApi,
        this.caseId,
        'nurse-record',
        this.form,
        { validate: (raw) => this.validateNurse(raw) },
      );
      const raw = this.form.getRawValue() as Record<string, unknown>;
      const ho: Record<string, unknown> = {};
      for (const k of this.handoverKeys) ho[k] = raw[k];
      await this.casesApi.saveFormSection(this.caseId, 'handover', ho);
    } catch (e: any) {
      this.savedMsg = e?.message || '存檔失敗';
    }
  }

  /** 僅格式／範圍檢查，不擋必填 */
  private validateNurse(raw: Record<string, unknown>): string | null {
    const rangeBad = findOutOfRange(raw, NURSE_NUM_SPECS);
    if (rangeBad.length) return `數值超出範圍：${rangeBad.join('、')}`;

    const gErr = validateGlucose(raw);
    if (gErr) return gErr;

    if (raw['arriveBp'] && !isValidBp(raw['arriveBp'])) {
      return '抵達後血壓格式須為「收縮壓/舒張壓」，例如 60/40';
    }
    if (raw['admitBp'] && !isValidBp(raw['admitBp'])) {
      return '入院血壓格式須為「收縮壓/舒張壓」，例如 65/40';
    }

    const momId = String(raw['momIdNo'] || '').trim();
    if (momId && !isValidTwId(momId)) return '母親身分證字號格式不正確';

    return null;
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

    const s0: { label: string; value: string }[] = [];
    add(s0, '其他', v.otherNote);
    pushPrintSection(out, '二、（五）其他', s0);

    const s1: { label: string; value: string }[] = [];
    add(s1, '出車日期', v.departDate);
    add(s1, '出車時間', v.departTime);
    add(s1, '到達外院時間', v.arriveOutsideTime);
    if (shouldPrintBtType(v.arriveBtType, [v.arriveBt, v.arriveHr, v.arriveRr, v.arriveSpo2, v.arriveBp])) {
      add(s1, 'BT 種類', v.arriveBtType);
    }
    add(s1, 'BT ℃', v.arriveBt);
    add(s1, 'HR', v.arriveHr);
    add(s1, 'RR', v.arriveRr);
    add(s1, 'SpO2 %', v.arriveSpo2);
    add(s1, 'BP mmHg', v.arriveBp);
    pushPrintSection(out, '三、（一）救護車時間　（二）抵達後生命徵象', s1);

    const s2: { label: string; value: string }[] = [];
    add(s2, 'NPO', v.npo);
    add(s2, '每餐 ml', v.feedMl);
    add(s2, '每＿小時', v.feedEveryHr);
    add(s2, '血糖', v.glucoseMode, mapGlucoseMode);
    add(s2, '血糖數值', v.glucoseValue);
    add(s2, '胃管', v.ogTube);
    add(s2, '胃管號', v.ogSize);
    add(s2, '黑點前公分', v.ogCm);
    add(s2, '備註', v.giNote);
    pushPrintSection(out, '三、（三）主要處置｜2.腸胃系統', s2);

    const s3: { label: string; value: string }[] = [];
    add(s3, '抽血', v.labs, mapYesNo);
    add(s3, '抽血數值', v.labsValue);
    add(s3, 'K1', v.vitK, mapGiven);
    add(s3, '眼藥', v.eyeDrop, mapGiven);
    add(s3, '使用藥物', v.otherDrugs, mapYesNo);
    add(s3, '藥物種類', v.otherDrugsType);
    add(s3, '抗生素', v.antibiotics);
    add(s3, '無異常', v.noAbnormal);
    add(s3, '外觀', v.appearance);
    add(s3, '外觀其他', v.appearanceOther);
    add(s3, '主要處置其他', v.treatmentOther);
    pushPrintSection(out, '3.抽血及用藥　4.外觀　5.其他', s3);

    const s4: { label: string; value: string }[] = [];
    add(s4, '母親身分證字號', v.momIdNo);
    add(s4, '母親生日', v.momBirthday);
    add(s4, '轉診單', v.chkReferralForm);
    add(s4, '轉運同意書', v.chkConsent);
    add(s4, '健兒手冊', v.chkChildBook);
    add(s4, '救護車收款證明單', v.chkAmbulanceReceipt);
    add(s4, 'HBV', v.hbvStatus);
    add(s4, 'HBIG', v.hbigStatus);
    add(s4, '新生兒篩檢', v.nbsStatus);
    add(s4, '聽力篩檢', v.hearingStatus);
    pushPrintSection(out, '三、（四）護理師現場交班檢查', s4);

    const s5: { label: string; value: string }[] = [];
    add(s5, '皮膚感應溫度 ℃', v.skinSensorTemp);
    add(s5, '啟動低溫治療', v.therapeuticHypothermia);
    add(s5, '轉接過程評估備註', v.evalNote);
    pushPrintSection(out, '五、（一）外接車溫度　（二）轉接過程評估', s5);

    const s6: { label: string; value: string }[] = [];
    add(s6, '返院出發時間', v.returnDepartAt);
    add(s6, '返院回到長庚病房時間', v.returnArriveWardAt);
    pushPrintSection(out, '五、（四）救護車時間個案交接狀況', s6);

    const s7: { label: string; value: string }[] = [];
    if (shouldPrintBtType(v.admitBtType, [v.admitBt, v.admitHr, v.admitRr, v.admitSpo2, v.admitBp])) {
      add(s7, 'BT 種類', v.admitBtType);
    }
    add(s7, 'BT ℃', v.admitBt);
    add(s7, 'HR', v.admitHr);
    add(s7, 'RR', v.admitRr);
    add(s7, 'SpO2 %', v.admitSpo2);
    add(s7, 'BP mmHg', v.admitBp);
    pushPrintSection(out, '入院後生命徵象', s7);

    const s8: { label: string; value: string }[] = [];
    add(s8, '隨車護理師', v.escortNurseSignature);
    add(s8, '交班護理師', v.handoverNurseSignature);
    pushPrintSection(out, '簽名', s8);

    return emptyPrintFallback(out);
  }
}
