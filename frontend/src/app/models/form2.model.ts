export interface Form2Data {
  patientId: string;
  recordDate: Date;
  isPrenatal: boolean; // true = 產前, false = 產後
  gestationalWeeks?: number; // 懷孕週數
  bloodPressure?: string;
  weight?: number;
  notes?: string;
}