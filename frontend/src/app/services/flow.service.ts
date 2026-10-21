import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root' // <--- 這行是關鍵，沒加這行會找不到服務
})
export class FlowService {
  currentPatientId: string | null = null;
  isMenuCompleted = false;
}