import { Injectable, signal } from '@angular/core';

export type RecordedAudio = {
  blob: Blob;
  mimeType: string;
  filename: string;
  durationMs: number;
  peak: number;
};

/**
 * 不用 MediaRecorder（iOS mp4/fMP4 常錄出殘缺檔 → Groq/ffmpeg 全掛）。
 * 改走 AudioContext 擷取 PCM，前端編成標準 WAV（16k mono）。
 *
 * 優化重點：
 * - 線性插值降採樣（比 nearest 清楚）
 * - 去頭尾靜音
 * - 峰值正規化（小聲也能辨識）
 */
@Injectable({ providedIn: 'root' })
export class AudioProcessorService {
  /** 0–1，錄音中即時音量（給 UI 用） */
  readonly level = signal(0);

  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;
  private pcmChunks: Float32Array[] = [];
  private startedAt = 0;
  private sampleRate = 44100;

  async startRecording(): Promise<void> {
    this.cleanup();
    this.level.set(0);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new Ctx();
    await this.audioCtx.resume();
    this.sampleRate = this.audioCtx.sampleRate;
    this.pcmChunks = [];
    this.startedAt = Date.now();

    this.source = this.audioCtx.createMediaStreamSource(this.stream);
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.gain = this.audioCtx.createGain();
    this.gain.gain.value = 0;

    this.processor.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      this.pcmChunks.push(new Float32Array(input));
      // 即時音量（RMS → 近似 UI）
      let sum = 0;
      for (let i = 0; i < input.length; i += 8) {
        const v = input[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / Math.max(1, Math.floor(input.length / 8)));
      this.level.set(Math.min(1, rms * 4));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.gain);
    this.gain.connect(this.audioCtx.destination);

    console.log('[AudioProcessor] PCM 錄音開始', { sampleRate: this.sampleRate });
  }

  async stopRecordingAndGetBlob(): Promise<RecordedAudio> {
    const elapsed = Date.now() - this.startedAt;
    const chunks = this.pcmChunks.slice();
    const rate = this.sampleRate;
    this.cleanup();
    this.level.set(0);

    if (elapsed < 1000) {
      throw new Error('錄音太短，請按住至少 1–2 秒再說一次');
    }
    if (!chunks.length) {
      throw new Error('幾乎沒錄到聲音，請檢查麥克風權限後再試');
    }

    let merged = this.mergeFloat32(chunks);
    const peakRaw = this.peakAmplitude(merged);
    if (peakRaw < 0.004) {
      throw new Error('音量太小，請靠近麥克風再說一次');
    }

    // 去頭尾靜音；若裁完過短（小聲/數字常被誤判），保留原音訊
    const trimmed = this.trimSilence(merged, rate);
    const minSamples = Math.floor(rate * 0.25);
    if (trimmed.length >= minSamples) {
      merged = trimmed;
    } else if (merged.length < minSamples) {
      throw new Error('有效語音太短，請按住再說清楚一點');
    }

    // 正規化到約 0.75，避免過小聲被 Whisper 聽成空白
    merged = this.normalizePeak(merged, 0.75);

    const wavBuffer = this.encodeWav(merged, rate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const peak = this.peakAmplitude(merged);

    console.log('[AudioProcessor] WAV 完成', {
      ms: elapsed,
      bytes: blob.size,
      peak: Number(peak.toFixed(3)),
      sampleRate: rate,
      samples: merged.length,
    });

    return {
      blob,
      mimeType: 'audio/wav',
      filename: 'recording.wav',
      durationMs: elapsed,
      peak,
    };
  }

  private cleanup(): void {
    try { this.processor?.disconnect(); } catch {}
    try { this.source?.disconnect(); } catch {}
    try { this.gain?.disconnect(); } catch {}
    try { this.audioCtx?.close(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());

    this.processor = null;
    this.source = null;
    this.gain = null;
    this.audioCtx = null;
    this.stream = null;
    this.pcmChunks = [];
  }

  private mergeFloat32(chunks: Float32Array[]): Float32Array {
    let len = 0;
    for (const c of chunks) len += c.length;
    const out = new Float32Array(len);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  private peakAmplitude(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }

  private normalizePeak(samples: Float32Array, target = 0.75): Float32Array {
    const peak = this.peakAmplitude(samples);
    if (peak < 1e-6 || peak >= target) return samples;
    const gain = target / peak;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
    }
    return out;
  }

  /**
   * 以短窗 RMS 找頭尾有效語音（比單點振幅穩）。
   * 門檻隨整體峰值自適應，避免小聲／數字被整段裁掉。
   */
  private trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
    const frame = Math.max(64, Math.floor(sampleRate * 0.02)); // 20ms
    const hop = Math.max(32, Math.floor(frame / 2));
    const peak = this.peakAmplitude(samples);
    // 小聲時門檻跟著降；最低 0.002，最高約 0.012
    const threshold = Math.min(0.012, Math.max(0.002, peak * 0.08));
    const pad = Math.floor(sampleRate * 0.12);

    const frameRms = (at: number): number => {
      let sum = 0;
      const end = Math.min(samples.length, at + frame);
      const n = Math.max(1, end - at);
      for (let i = at; i < end; i++) {
        const v = samples[i];
        sum += v * v;
      }
      return Math.sqrt(sum / n);
    };

    let startFrame = 0;
    let endFrame = Math.max(0, samples.length - frame);
    while (startFrame < samples.length && frameRms(startFrame) < threshold) {
      startFrame += hop;
    }
    while (endFrame > startFrame && frameRms(endFrame) < threshold) {
      endFrame -= hop;
    }

    let start = Math.max(0, startFrame - pad);
    let end = Math.min(samples.length - 1, endFrame + frame + pad);
    if (end <= start) return samples;
    return samples.subarray(start, end + 1);
  }

  /** PCM float32 → 16-bit mono WAV @ 16k */
  private encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const { data, rate } = this.downsampleTo16k(samples, sampleRate);

    const buffer = new ArrayBuffer(44 + data.length * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + data.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, data.length * 2, true);

    let offset = 44;
    for (let i = 0; i < data.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  /** 線性插值降採樣到 16k（比 nearest 清楚） */
  private downsampleTo16k(input: Float32Array, inputRate: number): { data: Float32Array; rate: number } {
    const target = 16000;
    if (Math.abs(inputRate - target) < 50) return { data: input, rate: inputRate };
    if (inputRate < target) return { data: input, rate: inputRate };

    const ratio = inputRate / target;
    const newLen = Math.floor(input.length / ratio);
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const t = src - i0;
      out[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return { data: out, rate: target };
  }
}
