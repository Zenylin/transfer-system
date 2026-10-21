import { Injectable } from '@angular/core';
import { DeviceDetectorService } from 'ngx-device-detector';

@Injectable({
  providedIn: 'root',
})
export class TranscriberConfigStorage {
  samplingRate = 16000;
  model = 'onnx-community/whisper-small';
  language = 'zh'; // 👈 必須改成 'zh'，這是 Whisper 對繁體中文的最佳代碼
  subtask = 'transcribe';
  isMultilingual = true;

  constructor(private deviceDetectorService: DeviceDetectorService) {
    this.model = 'onnx-community/whisper-small';
  }
}
