import { FormGroup } from '@angular/forms';
import { NUM, type NumLimit } from './number-limits';

/** 文字長度上限 */
export const LEN = {
  phone: 20,
  twId: 10,
  note: 500,
  reason: 1000,
  signature: 40,
  shortText: 100,
  drugs: 200,
  labsValue: 200,
  glucoseAction: 200,
} as const;

export type NumFieldSpec = { key: string; label: string; limit: NumLimit };

/** 病史／醫師／護理常見數值欄 */
export const HISTORY_NUM_SPECS: NumFieldSpec[] = [
  { key: 'birthWeightG', label: '出生體重', limit: NUM.birthWeightG },
  { key: 'gaWeeks', label: '妊娠週數', limit: NUM.gaWeeks },
  { key: 'gaDays', label: '又＿天', limit: NUM.gaDays },
  { key: 'GOther', label: 'G 其他', limit: NUM.gpOther },
  { key: 'POther', label: 'P 其他', limit: NUM.gpOther },
  { key: 'AAOther', label: 'AA 其他', limit: NUM.gpOther },
  { key: 'SAOther', label: 'SA 其他', limit: NUM.gpOther },
  { key: 'o2HoodLpm', label: 'O2 Hood', limit: NUM.o2HoodLpm },
  { key: 'o2CannulaLpm', label: 'O2 Cannula', limit: NUM.o2CannulaLpm },
  { key: 'ncpapFio2', label: 'N-CPAP FiO2', limit: NUM.ncpapFio2 },
  { key: 'ncpapPeep', label: 'N-CPAP PEEP', limit: NUM.ncpapPeep },
  { key: 'nimvRate', label: 'NIMV Rate', limit: NUM.nimvRate },
  { key: 'nimvFio2', label: 'NIMV FiO2', limit: NUM.nimvFio2 },
  { key: 'imvRate', label: 'IMV Rate', limit: NUM.imvRate },
  { key: 'imvFio2', label: 'IMV FiO2', limit: NUM.imvFio2 },
  { key: 'ettFixCm', label: '固定公分', limit: NUM.ettFixCm },
  { key: 'feedMl', label: '每餐 ml', limit: NUM.feedMl },
  { key: 'feedEveryHr', label: '每＿小時', limit: NUM.feedEveryHr },
  { key: 'ogCm', label: '黑點前公分', limit: NUM.ogCm },
  { key: 'ivRateMlHr', label: '輸液速率', limit: NUM.ivRateMlHr },
  { key: 'glucoseValue', label: '血糖數值', limit: NUM.glucose },
];

export const DOCTOR_NUM_SPECS: NumFieldSpec[] = [
  { key: 'o2HoodLpm', label: 'O2 Hood', limit: NUM.o2HoodLpm },
  { key: 'o2CannulaLpm', label: 'O2 Cannula', limit: NUM.o2CannulaLpm },
  { key: 'ncpapFio2', label: 'N-CPAP FiO2', limit: NUM.ncpapFio2 },
  { key: 'ncpapPeep', label: 'N-CPAP PEEP', limit: NUM.ncpapPeep },
  { key: 'nimvRate', label: 'NIMV Rate', limit: NUM.nimvRate },
  { key: 'nimvFio2', label: 'NIMV FiO2', limit: NUM.nimvFio2 },
  { key: 'imvRate', label: 'IMV Rate', limit: NUM.imvRate },
  { key: 'imvFio2', label: 'IMV FiO2', limit: NUM.imvFio2 },
  { key: 'ettFixCm', label: '固定公分', limit: NUM.ettFixCm },
  { key: 'ambulancePeople', label: '救護車人數', limit: NUM.ambulancePeople },
];

export const NURSE_NUM_SPECS: NumFieldSpec[] = [
  { key: 'arriveBt', label: '抵達 BT', limit: NUM.arriveBt },
  { key: 'arriveHr', label: '抵達 HR', limit: NUM.arriveHr },
  { key: 'arriveRr', label: '抵達 RR', limit: NUM.arriveRr },
  { key: 'arriveSpo2', label: '抵達 SpO2', limit: NUM.arriveSpo2 },
  { key: 'feedMl', label: '每餐 ml', limit: NUM.feedMl },
  { key: 'feedEveryHr', label: '每＿小時', limit: NUM.feedEveryHr },
  { key: 'ogCm', label: '黑點前公分', limit: NUM.ogCm },
  { key: 'glucoseValue', label: '血糖數值', limit: NUM.glucose },
  { key: 'skinSensorTemp', label: '皮膚感應溫度', limit: NUM.skinTemp },
  { key: 'admitBt', label: '入院 BT', limit: NUM.bt },
  { key: 'admitHr', label: '入院 HR', limit: NUM.hr },
  { key: 'admitRr', label: '入院 RR', limit: NUM.rr },
  { key: 'admitSpo2', label: '入院 SpO2', limit: NUM.spo2 },
];

export const HANDOVER_NUM_SPECS: NumFieldSpec[] = [
  { key: 'admitBt', label: 'BT', limit: NUM.bt },
  { key: 'admitHr', label: 'HR', limit: NUM.hr },
  { key: 'admitRr', label: 'RR', limit: NUM.rr },
  { key: 'admitSpo2', label: 'SpO2', limit: NUM.spo2 },
];

export function findOutOfRange(
  raw: Record<string, unknown>,
  specs: NumFieldSpec[],
): string[] {
  const bad: string[] = [];
  for (const s of specs) {
    const v = raw[s.key];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isNaN(n) || n < s.limit.min || n > s.limit.max) {
      bad.push(`${s.label}（${s.limit.min}–${s.limit.max}）`);
    }
  }
  return bad;
}

/** 血壓：sys/dia，如 60/40 */
export function isValidBp(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  const m = s.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!m) return false;
  const sys = Number(m[1]);
  const dia = Number(m[2]);
  return sys >= 20 && sys <= 250 && dia >= 10 && dia <= 150 && sys >= dia;
}

/** 電話：數字為主，可含 + - ( ) 空白，8–20 碼數字 */
export function isValidPhone(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return true; // 空白視為未填（非必填）
  if (s.length > LEN.phone) return false;
  if (!/^[0-9+\-()＃#*\s]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/** 台灣身分證字號（含檢查碼） */
export function isValidTwId(v: unknown): boolean {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return true; // 空白略過
  if (!/^[A-Z][12]\d{8}$/.test(s)) return false;
  const letterMap: Record<string, number> = {
    A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18,
    K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27,
    U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
  };
  const code = letterMap[s[0]];
  if (code == null) return false;
  const nums = [
    Math.floor(code / 10),
    code % 10,
    ...s.slice(1).split('').map((c) => Number(c)),
  ];
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
  return sum % 10 === 0;
}

/** NPO 勾選時清空並鎖定餵食欄 */
export function applyNpoLock(form: FormGroup, lockedExternally = false): void {
  const npo = !!form.get('npo')?.value;
  for (const k of ['feedMl', 'feedEveryHr'] as const) {
    const c = form.get(k);
    if (!c) continue;
    if (npo) {
      if (c.value != null && c.value !== '') c.setValue(null, { emitEvent: false });
      c.disable({ emitEvent: false });
    } else if (!lockedExternally) {
      c.enable({ emitEvent: false });
    }
  }
}

/** 血糖模式聯動 */
export function applyGlucoseMode(form: FormGroup, lockedExternally = false): void {
  const mode = String(form.get('glucoseMode')?.value || '');
  const val = form.get('glucoseValue');
  if (!val) return;
  if (mode === 'none') {
    if (val.value != null && val.value !== '') val.setValue(null, { emitEvent: false });
    val.disable({ emitEvent: false });
  } else if (!lockedExternally) {
    val.enable({ emitEvent: false });
  }
}

/** 僅檢查已填血糖數值是否在範圍內（不強制必填） */
export function validateGlucose(raw: Record<string, unknown>): string | null {
  const v = raw['glucoseValue'];
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < NUM.glucose.min || n > NUM.glucose.max) {
    return `血糖數值須為 ${NUM.glucose.min}–${NUM.glucose.max}`;
  }
  return null;
}

/** 生命徵象有任一數值時才印 BT 種類 */
export function shouldPrintBtType(
  btType: unknown,
  vitals: unknown[],
): boolean {
  if (!String(btType || '').trim()) return false;
  return vitals.some((v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'number') return !Number.isNaN(v);
    return String(v).trim() !== '';
  });
}
