/** 預覽列印：只輸出有填／有選的內容 */

export type PrintRow = { label: string; value: string };
export type PrintSection = { title: string; rows: PrintRow[] };

export function isPrintFilled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return !Number.isNaN(v);
  return String(v).trim() !== '';
}

export function addPrintRow(
  rows: PrintRow[],
  label: string,
  value: unknown,
  map?: (v: unknown) => string,
): void {
  if (!isPrintFilled(value)) return;
  if (typeof value === 'boolean') {
    if (value) rows.push({ label, value: '是' });
    return;
  }
  const text = map
    ? map(value)
    : Array.isArray(value)
      ? value.join('、')
      : String(value);
  if (!String(text).trim()) return;
  rows.push({ label, value: text });
}

export function pushPrintSection(out: PrintSection[], title: string, rows: PrintRow[]): void {
  if (rows.length) out.push({ title, rows });
}

export function emptyPrintFallback(out: PrintSection[]): PrintSection[] {
  if (!out.length) {
    out.push({ title: '報告', rows: [{ label: '內容', value: '（尚無已填寫資料）' }] });
  }
  return out;
}

/** 開啟系統列印對話框；列印期間顯示報告、隱藏表單 */
export function runPreviewPrint(setPrinting: (on: boolean) => void): void {
  setPrinting(true);
  // 等 Angular 渲染報告後再呼叫列印；對話框關閉後再隱藏
  setTimeout(() => {
    window.print();
    setTimeout(() => setPrinting(false), 100);
  }, 150);
}

export function mapYesNo(v: unknown): string {
  const s = String(v);
  if (s === 'yes') return '有';
  if (s === 'no') return '無';
  if (s === 'doc') return '外院附文件';
  return s;
}

export function mapGiven(v: unknown): string {
  const s = String(v);
  if (s === 'yes') return '已給予';
  if (s === 'no') return '未給予';
  return s;
}

export function mapGlucoseMode(v: unknown): string {
  const s = String(v);
  if (s === 'none') return '無測量';
  if (s === 'value') return '有數值';
  return s;
}

export function mapDoctorReply(v: unknown): string {
  const s = String(v);
  if (s === 'yes') return '是';
  if (s === 'no') return '否';
  return s;
}

export function mapTransferReply(v: unknown): string {
  const s = String(v);
  if (s === 'none') return '有';
  if (s === 'full') return '無（滿床）';
  if (s === 'lt3') return '無（空床小於3）';
  if (s === 'self') return '無（自行抱來）';
  return s;
}
