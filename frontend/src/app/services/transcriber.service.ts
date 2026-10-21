import { Injectable, signal, WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranscriberData } from '../models/transcriber-data';
import { lastValueFrom, timeout } from 'rxjs';
import { RecordedAudio } from './audio-processor.service';

@Injectable({ providedIn: 'root' })
export class TranscriberService {
    public isBusySignal: WritableSignal<boolean> = signal<boolean>(false);
    public errorSignal: WritableSignal<string | null> = signal<string | null>(null);
    public transcriptSignal: WritableSignal<TranscriberData | null> = signal<TranscriberData | null>(null);
    private apiUrl = '/api/speech-to-text';

    constructor(private http: HttpClient) { }

    get transcript() { return this.transcriptSignal(); }
    get isBusy() { return this.isBusySignal(); }
    get error() { return this.errorSignal(); }

    async startTranscription(input: Blob | RecordedAudio): Promise<void> {
        this.transcriptSignal.set(null);
        this.errorSignal.set(null);
        this.isBusySignal.set(true);

        const recorded = input instanceof Blob
            ? { blob: input, mimeType: input.type || 'audio/webm', filename: 'recording.webm' }
            : input;

        const formData = new FormData();
        formData.append('audio', recorded.blob, recorded.filename);

        try {
            const response: any = await lastValueFrom(
                this.http.post(this.apiUrl, formData).pipe(timeout(60000))
            );

            const text = this.normalizeTranscriptText(response?.text ?? response?.chunks);
            if (!text) {
                this.errorSignal.set('沒有辨識到有效語音，請靠近麥克風再說一次');
                return;
            }

            const transcriptData: TranscriberData = {
                isBusy: false,
                text,
                chunks: [{ text, timestamp: [0, null] }],
                tps: 0
            };

            this.transcriptSignal.set(transcriptData);
        } catch (error: any) {
            console.error('語音辨識 API 發生錯誤:', error);
            if (error?.name === 'TimeoutError') {
                this.errorSignal.set('語音辨識逾時（超過 60 秒）。請再說短一點後重試。');
            } else {
                const body = error?.error;
                const serverMsg =
                    (typeof body === 'string' ? body : null) ||
                    body?.error ||
                    body?.message ||
                    error?.message;
                // 不要把整段 ffmpeg 版本字串丟給使用者
                const short = String(serverMsg || '')
                    .replace(/libav[\s\S]*?(Invalid data|Error|失敗)/i, '$1')
                    .replace(/\s+/g, ' ')
                    .trim();
                this.errorSignal.set(
                    short.includes('Invalid data') || short.includes('ffmpeg')
                        ? '錄音格式異常，請按住至少 2 秒後再試一次'
                        : (short || '無法連線至語音辨識伺服器')
                );
            }
        } finally {
            this.isBusySignal.set(false);
        }
    }

    private normalizeTranscriptText(raw: unknown): string {
        if (raw == null) return '';
        if (typeof raw === 'string') return raw.trim();
        if (Array.isArray(raw)) {
            return raw
                .map((line: any) => {
                    if (typeof line === 'string') return line;
                    return line?.speech ?? line?.text ?? '';
                })
                .join('')
                .trim();
        }
        if (typeof raw === 'object' && raw !== null && 'text' in raw) {
            return this.normalizeTranscriptText((raw as { text: unknown }).text);
        }
        return String(raw).trim();
    }
}
