import { Component, OnInit, inject, effect, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PatientService } from '../../services/patient.service';
import { AudioProcessorService } from '../../services/audio-processor.service';
import { TranscriberService } from '../../services/transcriber.service';
import { TranscriberConfigStorage } from '../../storage/transcriber-config.storage';
import { DraftStoreService } from '../../services/draft-store.service';
import { SyncQueueService } from '../../services/sync-queue.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { newClientId } from '../../services/offline-db';
import { Datetime24hComponent } from '../time-24h/datetime-24h.component';
import { NumericOnlyDirective } from '../pages/_shared/numeric-only.directive';

@Component({
  selector: 'app-form2',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, Datetime24hComponent, NumericOnlyDirective],
  templateUrl: './form-2.component.html',
  providers: [TranscriberService, TranscriberConfigStorage]
})
export class Form2Component implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private patientService = inject(PatientService);
  private audioProcessor = inject(AudioProcessorService);
  public transcriberService = inject(TranscriberService);
  readonly voiceLevel = this.audioProcessor.level;
  private draftStore = inject(DraftStoreService);
  private syncQueue = inject(SyncQueueService);
  readonly network = inject(NetworkStatusService);

  public isRecording = false;
  public form2!: FormGroup;
  /** 手機預設雲端（穩）；桌面可開即時 */
  public useRealtime = false;
  public statusHint = '按住說話，放開後自動填入轉院原因';
  public draftHint = '';
  public submitting = false;

  private recognition: any = null;
  private browserTranscript = '';
  private activePointerId: number | null = null;
  private recordStartedAt = 0;
  private stopping = false;
  private patientId: string | null = null;
  private draftSub?: Subscription;
  private restoringDraft = false;

  constructor() {
    effect(() => {
      const result = this.transcriberService.transcript;
      if (result?.text && this.form2) {
        this.appendReason(result.text);
      }
    });

    effect(() => {
      // 追蹤 online signal，離線時更新語音提示
      this.network.online();
      if (this.form2) this.updateVoiceHint();
    });
  }

  ngOnInit() {
    this.patientId = this.route.snapshot.paramMap.get('id');
    if (this.patientId) this.loadPatientData(this.patientId);

    this.form2 = this.fb.group({
      transferDateTime: [new Date().toISOString().substring(0, 16)],
      hospitalName: [''],
      recordType: ['prenatal'],
      transferReason: [''],
      registrar: [''],
      remarks: [''],
      isTransferred: [true],
      noTransferReason: [''],
      replyHours: [null],
      satisfaction: ['']
    });

    this.useRealtime = false; // 手機／桌面一律走雲端 WAV，避免 MediaRecorder 格式問題
    this.updateVoiceHint();
    void this.restoreDraft();
    this.wireDraftAutosave();
  }

  get isPrenatal(): boolean {
    return this.form2.get('recordType')?.value === 'prenatal';
  }

  public get isProcessing(): boolean {
    return this.transcriberService.isBusy;
  }

  get voiceDisabled(): boolean {
    return !this.network.online() || this.isProcessing;
  }

  get micLabel(): string {
    if (!this.network.online()) return '離線中（請手動輸入）';
    if (this.isRecording) return '錄音中… 放開結束';
    if (this.isProcessing) return '辨識中…';
    return '🎙️ 按住說話';
  }

  loadPatientData(_id: string) {}

  get showNoTransferReason(): boolean {
    const v = this.form2.get('isTransferred')?.value;
    return v === false || v === 'false';
  }

  async onSubmit() {
    if (!this.form2.valid || this.submitting) return;
    this.submitting = true;

    const payload = { ...this.form2.getRawValue() } as Record<string, unknown>;
    const nextRoute = this.isPrenatal ? '/transfer/form-3-1' : '/transfer/form-3-2';

    try {
      if (!this.network.isOnline) {
        await this.syncQueue.enqueue('transfer/registry', payload);
        await this.draftStore.clear('form-2', this.patientId);
        this.draftHint = '已離線暫存，恢復網路後會自動同步';
        alert('目前離線：資料已加入待同步佇列，恢復網路後會自動送出');
        this.router.navigate([nextRoute]);
        return;
      }

      try {
        const clientId = newClientId();
        const res = await firstValueFrom(
          this.patientService.saveTransferRegistry({ ...payload, clientId })
        );
        console.log('MongoDB 寫入成功:', res);
        await this.draftStore.clear('form-2', this.patientId);
        this.router.navigate([nextRoute]);
      } catch (err) {
        console.error('後端 API 錯誤，改排入同步佇列:', err);
        await this.syncQueue.enqueue('transfer/registry', payload);
        await this.draftStore.clear('form-2', this.patientId);
        alert('連線失敗：資料已加入待同步佇列，恢復網路後會自動送出');
        this.router.navigate([nextRoute]);
      }
    } finally {
      this.submitting = false;
    }
  }

  async clearForm() {
    this.form2.reset({
      transferDateTime: new Date().toISOString().substring(0, 16),
      hospitalName: '',
      recordType: 'prenatal',
      transferReason: '',
      registrar: '',
      remarks: '',
      isTransferred: true,
      noTransferReason: '',
      replyHours: null,
      satisfaction: ''
    });
    await this.draftStore.clear('form-2', this.patientId);
    this.draftHint = '草稿已清除';
    this.updateVoiceHint();
  }

  ngOnDestroy() {
    this.draftSub?.unsubscribe();
    try { this.recognition?.abort?.(); } catch {}
    try { this.recognition?.stop?.(); } catch {}
  }

  /** 只用 Pointer Events，避免手機 touch + mouse 雙重觸發 */
  async onPointerDown(ev: PointerEvent) {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (this.voiceDisabled || this.isRecording || this.stopping) return;

    if (!this.network.isOnline) {
      this.statusHint = '離線中無法語音辨識，請手動輸入轉院原因';
      return;
    }

    ev.preventDefault();
    (ev.target as HTMLElement)?.setPointerCapture?.(ev.pointerId);
    this.activePointerId = ev.pointerId;
    this.recordStartedAt = Date.now();

    if (this.useRealtime) {
      this.startBrowserRecognition();
      return;
    }

    try {
      this.isRecording = true;
      this.statusHint = '錄音中，請繼續說…';
      await this.audioProcessor.startRecording();
    } catch (error) {
      this.isRecording = false;
      this.activePointerId = null;
      this.statusHint = '無法啟動麥克風，請檢查權限後再試';
      console.error(error);
    }
  }

  async onPointerUp(ev: PointerEvent) {
    if (this.activePointerId !== null && ev.pointerId !== this.activePointerId) return;
    ev.preventDefault();
    try {
      (ev.target as HTMLElement)?.releasePointerCapture?.(ev.pointerId);
    } catch {}
    this.activePointerId = null;
    await this.finishRecording();
  }

  async onPointerCancel(ev: PointerEvent) {
    if (this.activePointerId !== null && ev.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    await this.finishRecording();
  }

  private async finishRecording() {
    if (!this.isRecording || this.stopping) return;
    this.stopping = true;

    try {
      if (this.useRealtime) {
        this.stopBrowserRecognition();
        return;
      }

      const elapsed = Date.now() - this.recordStartedAt;
      this.isRecording = false;

      if (elapsed < 1000) {
        try { await this.audioProcessor.stopRecordingAndGetBlob(); } catch {}
        this.statusHint = '按太短了，請按住至少 1–2 秒再說一次';
        return;
      }

      this.statusHint = '雲端辨識中，請稍候…';
      const recorded = await this.audioProcessor.stopRecordingAndGetBlob();
      await this.transcriberService.startTranscription(recorded);

      if (this.transcriberService.error) {
        this.statusHint = this.transcriberService.error;
      } else {
        this.statusHint = '已填入轉院原因，可再按住補充';
      }
    } catch (error: any) {
      this.isRecording = false;
      console.error('辨識失敗:', error);
      this.statusHint = error?.message || '語音辨識失敗，請再試一次';
    } finally {
      this.stopping = false;
    }
  }

  private appendReason(text: string) {
    const prev = String(this.form2.get('transferReason')?.value || '').trim();
    const next = text.trim();
    if (!next) return;
    // 避免重複貼上同一段
    if (prev.endsWith(next)) return;
    this.form2.patchValue({
      transferReason: prev ? `${prev} ${next}` : next
    });
  }

  private async restoreDraft() {
    try {
      const draft = await this.draftStore.load('form-2', this.patientId);
      if (!draft?.payload) return;
      this.restoringDraft = true;
      this.form2.patchValue(draft.payload);
      const when = new Date(draft.updatedAt).toLocaleString('zh-TW');
      this.draftHint = `已還原本機草稿（${when}）`;
    } catch (err) {
      console.warn('讀取草稿失敗', err);
    } finally {
      this.restoringDraft = false;
    }
  }

  private wireDraftAutosave() {
    this.draftSub = this.form2.valueChanges
      .pipe(debounceTime(500), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe((value) => {
        if (this.restoringDraft) return;
        void this.draftStore
          .save('form-2', value as Record<string, unknown>, this.patientId)
          .then(() => {
            this.draftHint = `草稿已自動儲存 ${new Date().toLocaleTimeString('zh-TW')}`;
          })
          .catch((err) => console.warn('草稿儲存失敗', err));
      });
  }

  private updateVoiceHint() {
    if (!this.network.online()) {
      this.statusHint = '離線中無法語音辨識，請手動輸入轉院原因';
    } else {
      this.statusHint = '按住說話至少 2 秒，放開後自動辨識填入';
    }
  }

  private startBrowserRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      this.useRealtime = false;
      this.statusHint = '此瀏覽器不支援即時辨識，請再按住一次改用雲端';
      this.isRecording = false;
      this.activePointerId = null;
      return;
    }

    try { this.recognition?.abort?.(); } catch {}

    this.recognition = new SR();
    this.recognition.lang = 'zh-TW';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.browserTranscript = '';
    this.isRecording = true;
    this.statusHint = '即時辨識中…';

    this.recognition.onresult = (ev: any) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < ev.results.length; i++) {
        const piece = ev.results[i][0]?.transcript || '';
        if (ev.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      if (finalText) this.browserTranscript += finalText;
      const shown = (this.browserTranscript + interim).trim();
      if (shown) this.form2.patchValue({ transferReason: shown });
    };

    this.recognition.onerror = (ev: any) => {
      console.warn('Web Speech error', ev?.error);
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        this.isRecording = false;
        this.useRealtime = false;
        this.statusHint = '麥克風權限被拒，已改為雲端模式，請再按住一次';
      }
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        try { this.recognition.start(); } catch {}
      }
    };

    try {
      this.recognition.start();
    } catch (err) {
      console.error(err);
      this.isRecording = false;
      this.useRealtime = false;
      this.activePointerId = null;
      this.statusHint = '即時辨識無法啟動，已改雲端，請再按住一次';
    }
  }

  private stopBrowserRecognition() {
    this.isRecording = false;
    try { this.recognition?.stop?.(); } catch {}

    const text = this.browserTranscript.trim();
    this.statusHint = text ? '已更新轉院原因' : '沒有聽到內容，請靠近麥克風再按住說一次';
  }
}
