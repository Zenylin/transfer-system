// src/app/services/whisper-engine.service.ts
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WhisperEngineService {
  private worker!: Worker;

  // 用來廣播辨識出的文字給 Component
  public transcribedText$ = new Subject<string>();

  // 記錄 Worker 是否已經載入模型並準備好
  public isReady = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    console.log('%c[WhisperService] 正在動態載入 libstream.js...', 'color: #2196F3; font-weight: bold;');

    // 建立一個 script 標籤
    const script = document.createElement('script');
    // 記得加上你的 servePath
    script.src = '/transfer/assets/whisper/libstream.js';

    script.onload = () => {
      console.log('%c[WhisperService] libstream.js 載入完成！', 'color: #4CAF50; font-weight: bold;');

      // 當大總管載入後，通常會在全域 (window) 掛載一個叫做 Module 的物件
      // 我們要等它把 WASM 也準備好
      if ((window as any).Module) {
        (window as any).Module.onRuntimeInitialized = () => {
          this.isReady = true;
          console.log('%c[WhisperService] WebAssembly 引擎完全就緒！', 'color: #009688; font-weight: bold;');
        };
      } else {
        console.warn('[WhisperService] 找不到全域 Module 物件，請確認 libstream.js 的匯出方式');
      }
    };

    script.onerror = (err) => {
      console.error('[WhisperService] 載入 libstream.js 失敗', err);
    };

    // 把 script 塞進 HTML 的 body 裡執行
    document.body.appendChild(script);
  }

  public transcribe(audioData: Float32Array) {
    if (!this.isReady) {
      console.warn('[WhisperService] 引擎還沒 Ready，拒絕傳送資料。');
      return;
    }
    console.log(`%c[WhisperService] 發送 transcribe 指令，音訊大小: ${audioData.length}`, 'color: #2196F3; font-weight: bold;');

    // 把 type 改為 command
    this.worker.postMessage({
      command: 'transcribe',
      data: audioData
    });
  }
}