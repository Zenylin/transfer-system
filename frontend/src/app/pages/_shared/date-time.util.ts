import { FormGroup } from '@angular/forms';

/** 日期／時間防呆與預設值 */

export function todayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 24 小時制 HH:mm */
export function nowHm(d = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** datetime-local 用 yyyy-MM-ddTHH:mm */
export function nowDateTimeLocal(d = new Date()): string {
  return `${todayYmd(d)}T${nowHm(d)}`;
}

function isEmpty(v: unknown): boolean {
  return v == null || String(v).trim() === '';
}

/** 空白時間欄填入現在（24h） */
export function defaultEmptyTimes(form: FormGroup, keys: string[]): void {
  const t = nowHm();
  for (const k of keys) {
    const c = form.get(k);
    if (c && isEmpty(c.value)) c.setValue(t);
  }
}

/** 空白日期欄填入今天（不含 EDC） */
export function defaultEmptyDates(form: FormGroup, keys: string[]): void {
  const t = todayYmd();
  for (const k of keys) {
    const c = form.get(k);
    if (c && isEmpty(c.value)) c.setValue(t);
  }
}

export function defaultEmptyDateTimes(form: FormGroup, keys: string[]): void {
  const t = nowDateTimeLocal();
  for (const k of keys) {
    const c = form.get(k);
    if (c && isEmpty(c.value)) c.setValue(t);
  }
}
