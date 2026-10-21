import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActiveCaseService } from '../../services/active-case.service';
import { initCaseFormPage, persistFormSection } from '../../services/case-form.util';
import { Time24hComponent } from '../../components/time-24h/time-24h.component';
import { PrintReportComponent } from '../../components/print-report/print-report.component';
import { NUM } from '../_shared/number-limits';
import { NumericOnlyDirective } from '../_shared/numeric-only.directive';
import { defaultEmptyTimes, nowHm, todayYmd } from '../_shared/date-time.util';
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
  HISTORY_NUM_SPECS,
  LEN,
  applyGlucoseMode,
  applyNpoLock,
  findOutOfRange,
  validateGlucose,
} from '../_shared/form-validation.util';

@Component({
  selector: 'app-history-form-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    Time24hComponent,
    PrintReportComponent,
    NumericOnlyDirective,
  ],
  templateUrl: './history-form.page.html',
  styleUrls: ['../_shared/case-form.css'],
})
export class HistoryFormPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private casesApi = inject(ActiveCaseService);

  readonly NUM = NUM;
  readonly LEN = LEN;
  readonly todayMax = todayYmd();
  caseId = '';
  serial = '';
  hospital = '';
  savedMsg = '';
  printing = false;
  printAt = '';
  printSections: PrintSection[] = [];
  apgarOpts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  gpOpts = ['1', '2', '3', '4', '其他'];

  form = this.fb.group({
    birthDate: [''],
    birthTime: [''],
    gaWeeks: [null as number | null],
    gaDays: [null as number | null],
    birthWeightG: [null as number | null],
    edc: [''],
    apgar1: [null as number | null],
    apgar5: [null as number | null],
    apgar10: [null as number | null],
    apgar15: [null as number | null],
    apgar20: [null as number | null],
    G: [''],
    GOther: [null as number | null],
    P: [''],
    POther: [null as number | null],
    AA: [''],
    AAOther: [null as number | null],
    SA: [''],
    SAOther: [null as number | null],
    deliveryMode: [''],
    vacuum: [false],
    forceps: [false],
    promHas: [''],
    promDate: [''],
    promTime: [''],
    prom: [''],
    amniotic: [''],
    amnioticOdor: [false],
    fever: [false],
    toccChecked: [false],
    toccText: [''],
    resusc: this.fb.nonNullable.control<string[]>([]),
    resuscOther: [''],
    meconium: [''],
    noPrenatalCare: [false],
    hbsag: [''],
    hbeag: [''],
    gbs: [''],
    gdm: [''],
    pih: [''],
    hiv: [''],
    hivTreated: [''],
    rpr: [''],
    rprTreated: [''],
    noAnteMeds: [false],
    betaDose: [''],
    betaDate: [''],
    dexaDose: [''],
    dexaDate: [''],
    anteAbx: [''],
    anteAbxOther: [''],
    anteAbxDate: [''],
    mgso4Dose: [''],
    mgso4Date: [''],
    noPastHx: [false],
    pastHx: this.fb.nonNullable.control<string[]>([]),
    pastHxOther: [''],
    pastHxMeds: [''],
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
    respNote: [''],
    npo: [false],
    feedMl: [null as number | null],
    feedEveryHr: [null as number | null],
    glucoseMode: [''],
    glucoseValue: [null as number | null],
    glucoseAction: [''],
    ogTube: [false],
    ogSize: [''],
    ogCm: [null as number | null],
    giNote: [''],
    ivPumpCount: [0],
    ivFluidType: [''],
    ivRateMlHr: [null as number | null],
    labs: [''],
    labsValue: [''],
    vitK: [''],
    eyeDrop: [''],
    antibiotics: this.fb.nonNullable.control<string[]>([]),
    abxOther: [''],
    otherDrugs: [''],
    otherDrugsType: [''],
  });

  async ngOnInit(): Promise<void> {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    const ok = await initCaseFormPage(this.casesApi, this.caseId, 'history', this.form, {
      onLoaded: (d) => {
        this.serial = d.serial;
        this.hospital = d.hospitalName;
      },
    });
    if (!ok) {
      void this.router.navigate(['/']);
      return;
    }
    this.migrateProm();
    defaultEmptyTimes(this.form, ['birthTime']);
    this.form.controls.npo.valueChanges.subscribe(() => applyNpoLock(this.form));
    this.form.controls.glucoseMode.valueChanges.subscribe(() => applyGlucoseMode(this.form));
    applyNpoLock(this.form);
    applyGlucoseMode(this.form);
  }

  /** 舊資料 prom 文字 → 有/無 + 日期時間 */
  private migrateProm(): void {
    const has = String(this.form.controls.promHas.value || '');
    const legacy = String(this.form.controls.prom.value || '').trim();
    if (has) return;
    if (legacy) {
      this.form.patchValue({ promHas: 'yes' });
      // 嘗試解析 yyyy-MM-ddTHH:mm 或 yyyy-MM-dd HH:mm
      const m = legacy.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
      if (m) {
        this.form.patchValue({ promDate: m[1], promTime: m[2] });
      }
    }
  }

  isPromYes(): boolean {
    return this.form.controls.promHas.value === 'yes';
  }

  setPromHas(v: 'yes' | 'no'): void {
    this.form.controls.promHas.setValue(v);
    if (v === 'no') {
      this.form.patchValue({ promDate: '', promTime: '', prom: '' });
    } else {
      defaultEmptyTimes(this.form, ['promTime']);
      if (!this.form.controls.promDate.value) {
        this.form.controls.promDate.setValue(todayYmd());
      }
    }
  }

  toggleMulti(control: 'resusc' | 'pastHx' | 'respSymptoms' | 'antibiotics', value: string, on: boolean): void {
    const ctrl = this.form.controls[control];
    const set = new Set(ctrl.value);
    if (on) set.add(value);
    else set.delete(value);
    ctrl.setValue([...set]);
  }

  hasMulti(control: 'resusc' | 'pastHx' | 'respSymptoms' | 'antibiotics', value: string): boolean {
    return this.form.controls[control].value.includes(value);
  }

  private syncProm(): void {
    if (this.form.controls.promHas.value === 'yes') {
      const d = this.form.controls.promDate.value || '';
      const t = this.form.controls.promTime.value || '';
      this.form.controls.prom.setValue(d && t ? `${d}T${t}` : d || t || '');
    } else if (this.form.controls.promHas.value === 'no') {
      this.form.controls.prom.setValue('無');
    }
  }

  async save(): Promise<void> {
    this.syncProm();
    try {
      this.savedMsg = await persistFormSection(this.casesApi, this.caseId, 'history', this.form, {
        validate: (raw) => {
          const bad = findOutOfRange(raw, HISTORY_NUM_SPECS);
          if (bad.length) return `數值超出範圍：${bad.join('、')}`;
          return validateGlucose(raw);
        },
      });
    } catch (e: any) {
      this.savedMsg = e?.message || '存檔失敗';
    }
  }

  async next(): Promise<void> {
    await this.save();
    void this.router.navigate(['/cases', this.caseId, 'doctor']);
  }

  previewPrint(): void {
    this.syncProm();
    this.printAt = `${todayYmd()} ${nowHm()}`;
    this.printSections = this.buildPrintReport();
    runPreviewPrint((on) => (this.printing = on));
  }

  private buildPrintReport(): PrintSection[] {
    const v = this.form.getRawValue();
    const out: PrintSection[] = [];
    const add = addPrintRow;

    const s1: { label: string; value: string }[] = [];
    add(s1, '出生日期', v.birthDate);
    add(s1, '出生時間', v.birthTime);
    add(s1, '出生體重(g)', v.birthWeightG);
    add(s1, '妊娠週數', v.gaWeeks);
    add(s1, '又＿天', v.gaDays);
    add(s1, '預產期 EDC', v.edc);
    add(s1, "Apgar 1'", v.apgar1);
    add(s1, "Apgar 5'", v.apgar5);
    add(s1, "Apgar 10'", v.apgar10);
    add(s1, "Apgar 15'", v.apgar15);
    add(s1, "Apgar 20'", v.apgar20);
    add(s1, 'G', v.G === '其他' && v.GOther != null ? `其他 ${v.GOther}` : v.G);
    add(s1, 'P', v.P === '其他' && v.POther != null ? `其他 ${v.POther}` : v.P);
    add(s1, 'AA', v.AA === '其他' && (v as any).AAOther != null ? `其他 ${(v as any).AAOther}` : v.AA);
    add(s1, 'SA', v.SA === '其他' && (v as any).SAOther != null ? `其他 ${(v as any).SAOther}` : v.SA);
    let delivery = v.deliveryMode || '';
    if (v.vacuum) delivery = `${delivery}${delivery ? '＋' : ''}真空吸引`;
    if (v.forceps) delivery = `${delivery}${delivery ? '＋' : ''}產鉗`;
    add(s1, '生產方式', delivery);
    if (v.promHas === 'yes') {
      const pt = [v.promDate, v.promTime].filter(Boolean).join(' ');
      add(s1, '破水', pt ? `有（${pt}）` : '有');
    } else if (v.promHas === 'no') {
      add(s1, '破水', '無');
    } else if (v.prom) {
      add(s1, '破水', v.prom);
    }
    add(s1, '羊水', v.amniotic);
    add(s1, '羊水異味', v.amnioticOdor);
    add(s1, '發燒', v.fever);
    add(s1, 'TOCC', v.toccChecked);
    add(s1, 'TOCC 內容', v.toccText);
    add(s1, '生產時狀況與處置', v.resusc);
    add(s1, '處置其他', v.resuscOther);
    add(s1, '胎便染色', v.meconium);
    pushPrintSection(out, '一、（一）孕產史', s1);

    const s2: { label: string; value: string }[] = [];
    add(s2, '無產檢', v.noPrenatalCare);
    if (!v.noPrenatalCare) {
      add(s2, 'HBsAg', v.hbsag);
      add(s2, 'HBeAg', v.hbeag);
      add(s2, 'GBS', v.gbs);
      add(s2, 'GDM', v.gdm);
      add(s2, 'PIH', v.pih);
      add(s2, 'HIV', v.hiv);
      add(s2, 'HIV 治療', v.hivTreated);
      add(s2, 'RPR', v.rpr);
      add(s2, 'RPR 治療', v.rprTreated);
    }
    pushPrintSection(out, '一、（二）產檢', s2);

    const s3: { label: string; value: string }[] = [];
    add(s3, '無用藥', v.noAnteMeds);
    if (!v.noAnteMeds) {
      add(s3, 'betamethasone 劑量', v.betaDose);
      add(s3, 'betamethasone 日期', v.betaDate);
      add(s3, 'dexamethasone 劑量', v.dexaDose);
      add(s3, 'dexamethasone 日期', v.dexaDate);
      add(s3, '抗生素', v.anteAbx);
      add(s3, '抗生素其他', v.anteAbxOther);
      add(s3, '抗生素日期', v.anteAbxDate);
      add(s3, 'MgSO4 劑量', v.mgso4Dose);
      add(s3, 'MgSO4 日期', v.mgso4Date);
    }
    pushPrintSection(out, '一、（三）產前用藥', s3);

    const s4: { label: string; value: string }[] = [];
    add(s4, '無過去病史', v.noPastHx);
    if (!v.noPastHx) {
      add(s4, '過去病史', v.pastHx);
      add(s4, '其他說明', v.pastHxOther);
      add(s4, '用藥', v.pastHxMeds);
    }
    pushPrintSection(out, '二、（一）過去病史', s4);

    const s5: { label: string; value: string }[] = [];
    add(s5, '無呼吸問題', v.noRespProblem);
    add(s5, '症狀', v.respSymptoms);
    add(s5, 'O2 Hood L/min', v.o2HoodLpm);
    add(s5, 'O2 Cannula L/min', v.o2CannulaLpm);
    add(s5, 'N-CPAP FiO2 %', v.ncpapFio2);
    add(s5, 'N-CPAP PEEP', v.ncpapPeep);
    add(s5, 'NIMV Rate', (v as any).nimvRate);
    add(s5, 'NIMV FiO2 %', (v as any).nimvFio2);
    add(s5, 'IMV Rate', v.imvRate);
    add(s5, 'IMV FiO2 %', v.imvFio2);
    add(s5, '氣管內管號', v.ettSize);
    add(s5, '固定公分', v.ettFixCm);
    add(s5, '備註', v.respNote);
    pushPrintSection(out, '二、（二）呼吸系統', s5);

    const s6: { label: string; value: string }[] = [];
    add(s6, 'NPO', v.npo);
    add(s6, '每餐 ml', v.feedMl);
    add(s6, '每＿小時', v.feedEveryHr);
    add(s6, '血糖', v.glucoseMode, mapGlucoseMode);
    add(s6, '血糖數值', v.glucoseValue);
    add(s6, '處置', v.glucoseAction);
    add(s6, '胃管', v.ogTube);
    add(s6, '胃管號', v.ogSize);
    add(s6, '黑點前公分', v.ogCm);
    add(s6, '備註', v.giNote);
    pushPrintSection(out, '二、（三）腸胃系統', s6);

    const s7: { label: string; value: string }[] = [];
    if (v.ivPumpCount != null && Number(v.ivPumpCount) > 0) add(s7, 'IV pump 台數', v.ivPumpCount);
    add(s7, '輸液種類', v.ivFluidType);
    add(s7, '速率 ml/hr', v.ivRateMlHr);
    add(s7, '抽血檢查', v.labs, mapYesNo);
    add(s7, '抽血數值', v.labsValue);
    add(s7, 'K1', v.vitK, mapGiven);
    add(s7, '眼藥', v.eyeDrop, mapGiven);
    add(s7, '使用藥物', v.otherDrugs, mapYesNo);
    add(s7, '藥物種類', v.otherDrugsType);
    add(s7, '抗生素', v.antibiotics);
    add(s7, '抗生素其他', v.abxOther);
    pushPrintSection(out, '二、（四）靜脈輸注／抽血及用藥', s7);

    return emptyPrintFallback(out);
  }
}
