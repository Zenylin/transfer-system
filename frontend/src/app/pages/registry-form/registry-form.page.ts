import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActiveCaseService } from '../../services/active-case.service';
import { VoiceDictationComponent } from '../../components/voice-dictation/voice-dictation.component';
import { Time24hComponent } from '../../components/time-24h/time-24h.component';
import { PrintReportComponent } from '../../components/print-report/print-report.component';
import { defaultEmptyDates, defaultEmptyTimes, nowHm, todayYmd } from '../_shared/date-time.util';
import {
  addPrintRow,
  emptyPrintFallback,
  mapDoctorReply,
  mapTransferReply,
  pushPrintSection,
  runPreviewPrint,
  type PrintSection,
} from '../_shared/print-report.util';
import { LEN, isValidPhone } from '../_shared/form-validation.util';

@Component({
  selector: 'app-registry-form-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    VoiceDictationComponent,
    Time24hComponent,
    PrintReportComponent,
  ],
  templateUrl: './registry-form.page.html',
  styleUrls: ['../_shared/case-form.css'],
})
export class RegistryFormPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private casesApi = inject(ActiveCaseService);

  readonly todayMax = todayYmd();
  readonly LEN = LEN;
  caseId = '';
  savedMsg = '';
  printing = false;
  printAt = '';
  printSections: PrintSection[] = [];
  bedOptions = ['3L1', '5L1', '3L2', '5L2'];
  hospitalOptions = [
    '林口クリニック婦產科',
    '桃園敏盛醫院',
    '新竹馬偕',
    '竹北國泰',
    '中壢天成',
    '其他',
  ];

  form = this.fb.group({
    serial: [{ value: '', disabled: true }],
    callDate: [''],
    callTime: [''],
    hospitalName: [''],
    hospitalPhone: [''],
    transferReason: [''],
    registrar: [''],
    bedControlDoctor: [''],
    assignedDoctor: [''],
    noTransferReason: ['none'],
    doctorReply24h: [''],
    preBedSlots: this.fb.nonNullable.control<string[]>([]),
  });

  async ngOnInit(): Promise<void> {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    this.casesApi.select(this.caseId);
    const detail = await this.casesApi.loadDetail(this.caseId, true);
    const c = detail || this.casesApi.getById(this.caseId);
    if (!c) {
      void this.router.navigate(['/']);
      return;
    }
    this.form.patchValue({
      serial: c.serial,
      callDate: c.callDate,
      callTime: c.callTime,
      hospitalName: c.hospitalName,
      hospitalPhone: c.hospitalPhone,
      transferReason: c.transferReason,
      registrar: c.registrar,
      bedControlDoctor: c.bedControlDoctor,
      assignedDoctor: c.assignedDoctor,
      noTransferReason: c.noTransferReason || 'none',
      doctorReply24h: c.doctorReply24h,
      preBedSlots: [...c.preBedSlots],
    });
    defaultEmptyDates(this.form, ['callDate']);
    defaultEmptyTimes(this.form, ['callTime']);
  }

  isTransferYes(): boolean {
    return this.form.controls.noTransferReason.value === 'none';
  }

  isTransferNo(): boolean {
    return this.form.controls.noTransferReason.value !== 'none';
  }

  setTransferYes(): void {
    this.form.controls.noTransferReason.setValue('none');
  }

  setTransferNo(): void {
    const cur = this.form.controls.noTransferReason.value;
    if (cur === 'none' || !cur) {
      this.form.controls.noTransferReason.setValue('');
    }
  }

  toggleBed(slot: string, checked: boolean): void {
    const cur = new Set(this.form.controls.preBedSlots.value);
    if (checked) {
      if (cur.size >= 2 && !cur.has(slot)) return;
      cur.add(slot);
    } else {
      cur.delete(slot);
    }
    this.form.controls.preBedSlots.setValue([...cur]);
  }

  bedChecked(slot: string): boolean {
    return this.form.controls.preBedSlots.value.includes(slot);
  }

  onVoiceReason(text: string): void {
    const prev = String(this.form.controls.transferReason.value || '').trim();
    const next = text.trim();
    if (!next) return;
    if (prev.endsWith(next)) return;
    let merged = prev ? `${prev} ${next}` : next;
    if (merged.length > LEN.reason) merged = merged.slice(0, LEN.reason);
    this.form.patchValue({ transferReason: merged });
  }

  async save(): Promise<void> {
    const phone = String(this.form.controls.hospitalPhone.value || '').trim();
    if (phone && !isValidPhone(phone)) {
      this.savedMsg = '來電院所電話格式不正確（請填 8–15 位數字，可含 + -）';
      return;
    }
    const v = this.form.getRawValue();
    try {
      await this.casesApi.saveCase(this.caseId, {
        callDate: v.callDate || '',
        callTime: v.callTime || '',
        hospitalName: v.hospitalName || '',
        hospitalPhone: v.hospitalPhone || '',
        transferReason: v.transferReason || '',
        registrar: v.registrar || '',
        bedControlDoctor: v.bedControlDoctor || '',
        assignedDoctor: v.assignedDoctor || '',
        noTransferReason: (v.noTransferReason as any) || 'none',
        doctorReply24h: (v.doctorReply24h as any) || '',
        preBedSlots: v.preBedSlots || [],
      });
      this.savedMsg = '已存入本機 MongoDB（CC_DB.transfers）';
    } catch (e: any) {
      this.savedMsg = e?.message || '存檔失敗';
    }
  }

  async next(): Promise<void> {
    await this.save();
    void this.router.navigate(['/cases', this.caseId, 'history']);
  }

  previewPrint(): void {
    this.printAt = `${todayYmd()} ${nowHm()}`;
    this.printSections = this.buildPrintReport();
    runPreviewPrint((on) => (this.printing = on));
  }

  private buildPrintReport(): PrintSection[] {
    const v = this.form.getRawValue();
    const out: PrintSection[] = [];
    const add = addPrintRow;

    const s1: { label: string; value: string }[] = [];
    add(s1, '序號', v.serial);
    add(s1, '來電日期', v.callDate);
    add(s1, '來電時間', v.callTime);
    add(s1, '來電院所名稱', v.hospitalName);
    add(s1, '來電院所電話', v.hospitalPhone);
    add(s1, '轉院原因', v.transferReason);
    add(s1, '登錄者', v.registrar);
    add(s1, '控床醫師', v.bedControlDoctor);
    add(s1, '指定醫師', v.assignedDoctor);
    pushPrintSection(out, '來電與登錄', s1);

    const s2: { label: string; value: string }[] = [];
    add(s2, '外接回覆', v.noTransferReason, mapTransferReply);
    add(s2, '醫師24小時回覆', v.doctorReply24h, mapDoctorReply);
    add(s2, '預入床位', v.preBedSlots);
    pushPrintSection(out, '外接回覆／床位', s2);

    return emptyPrintFallback(out);
  }
}
