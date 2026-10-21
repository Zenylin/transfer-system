export interface Form32Data {
  // 基本資料與 TOCC
  transferDest: string;
  transferPhone: string;
  transferDate: string;
  fatherTOCC: { has: boolean, date?: string };
  motherTOCC: { has: boolean, date?: string };
  // 個案基本資料
  G: number; P: number; mode: 'CS' | 'NS'; birthWeight: number;
  GA: number; EDC: string; headCircumference: number;
  birthDate: string; apgar1: number; apgar5: number;
  // 醫療評估與處置
  transferReason: string;
  vitalSignsArrival: { bt: number, bp: string, hr: number, rr: number, spo2: number };
  medications: { vitK: boolean, eyeDrops: boolean, antibiotics: string };
  // ...以及其他勾選項目
}