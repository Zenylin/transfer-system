import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import '/home/nemo/medical-system/frontend/src/styles.css'; // 確保這裡指向你的 CSS 檔案

// 強制信任所有來自 Proxy 的標頭
(window as any).trustProxyHeaders = true; 

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));