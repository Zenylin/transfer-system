import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioProcessorService } from '../../services/audio-processor.service';
import { TranscriberService } from '../../services/transcriber.service';
import { NetworkStatusService } from '../../services/network-status.service';

/**
 * 按住說話 → WAV → 雲端 STT → emit 辨識文字
 */
@Component({
  selector: 'app-voice-dictation',
  standalone: true,
  imports: [CommonModule],
  providers: [TranscriberService],
  template: `
    <div class="voice-wrap">
      <button
        type="button"
        class="voice-btn"
        [class.recording]="isRecording()"
        [disabled]="disabled()"
        style="touch-action: none; user-select: none; -webkit-user-select: none;"
        (pointerdown)="onDown($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="onCancel($event)"
      >
        {{ label() }}
      </button>
      @if (isRecording()) {
        <div class="voice-meter" aria-hidden="true">
          <div class="voice-meter-fill" [style.width.%]="level() * 100"></div>
        </div>
      }
      @if (hint()) {
        <p class="voice-hint">{{ hint() }}</p>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    .voice-wrap {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      max-width: 100%;
    }
    .voice-btn {
      flex: 0 0 auto;
      min-height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 700;
      font-size: 0.82rem;
      line-height: 1;
      cursor: pointer;
      white-space: nowrap;
    }
    .voice-btn.recording { background: #dbeafe; border-color: #3b82f6; }
    .voice-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .voice-meter {
      width: 64px;
      height: 5px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
      flex: 0 0 auto;
    }
    .voice-meter-fill {
      height: 100%;
      background: #2563eb;
      transition: width 75ms linear;
    }
    .voice-hint {
      margin: 0;
      flex: 0 1 auto;
      max-width: 11rem;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1.3;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `],
})
export class VoiceDictationComponent {
  private audio = inject(AudioProcessorService);
  private stt = inject(TranscriberService);
  private network = inject(NetworkStatusService);

  @Output() transcribed = new EventEmitter<string>();

  readonly isRecording = signal(false);
  readonly hint = signal('按住至少 2 秒');
  readonly level = this.audio.level;

  private pointerId: number | null = null;
  private startedAt = 0;
  private stopping = false;

  disabled(): boolean {
    return !this.network.online() || this.stt.isBusy;
  }

  label(): string {
    if (!this.network.online()) return '離線中';
    if (this.isRecording()) return '錄音中… 放開結束';
    if (this.stt.isBusy) return '辨識中…';
    return '🎙️ 按住說話';
  }

  async onDown(ev: PointerEvent): Promise<void> {
    if (this.disabled() || this.isRecording() || this.stopping) return;
    if (!this.network.isOnline) {
      this.hint.set('離線中無法語音辨識');
      return;
    }
    ev.preventDefault();
    (ev.target as HTMLElement)?.setPointerCapture?.(ev.pointerId);
    this.pointerId = ev.pointerId;
    this.startedAt = Date.now();
    try {
      this.isRecording.set(true);
      this.hint.set('錄音中…放開結束');
      await this.audio.startRecording();
    } catch (err) {
      this.isRecording.set(false);
      this.pointerId = null;
      this.hint.set('無法開麥克風，請檢查權限');
      console.error(err);
    }
  }

  async onUp(ev: PointerEvent): Promise<void> {
    if (this.pointerId !== null && ev.pointerId !== this.pointerId) return;
    ev.preventDefault();
    try {
      (ev.target as HTMLElement)?.releasePointerCapture?.(ev.pointerId);
    } catch {}
    this.pointerId = null;
    await this.finish();
  }

  async onCancel(ev: PointerEvent): Promise<void> {
    if (this.pointerId !== null && ev.pointerId !== this.pointerId) return;
    this.pointerId = null;
    await this.finish();
  }

  private async finish(): Promise<void> {
    if (!this.isRecording() || this.stopping) return;
    this.stopping = true;
    try {
      const elapsed = Date.now() - this.startedAt;
      this.isRecording.set(false);
      if (elapsed < 1000) {
        try { await this.audio.stopRecordingAndGetBlob(); } catch {}
        this.hint.set('按太短，請按住 1–2 秒');
        return;
      }
      this.hint.set('辨識中…');
      const recorded = await this.audio.stopRecordingAndGetBlob();
      await this.stt.startTranscription(recorded);
      if (this.stt.error) {
        this.hint.set(this.stt.error);
        return;
      }
      const text = this.stt.transcript?.text?.trim() || '';
      if (!text) {
        this.hint.set('沒聽到內容，請靠近再說');
        return;
      }
      this.transcribed.emit(text);
      this.hint.set('已填入，可再補充');
    } catch (err: any) {
      this.isRecording.set(false);
      this.hint.set(err?.message || '辨識失敗，請再試');
      console.error(err);
    } finally {
      this.stopping = false;
    }
  }
}
