import { Directive, HostListener, Input } from '@angular/core';

/**
 * 數值欄位：只允許數字與（視情況）小數點／負號，阻擋字母與其他符號。
 * 掛在 input[type=number] 上會自動生效；也可手動加 appNumericOnly。
 */
@Directive({
  selector: 'input[type="number"], input[appNumericOnly]',
  standalone: true,
})
export class NumericOnlyDirective {
  /** 允許小數（預設：依 step，非整數 step 則允許） */
  @Input() allowDecimal: boolean | '' | undefined;
  /** 允許負號（預設：依 min < 0） */
  @Input() allowNegative: boolean | '' | undefined;

  @HostListener('keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    const el = e.target as HTMLInputElement;
    if (!el || el.readOnly || el.disabled) return;
    if (isNavOrEditKey(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^\d$/.test(e.key)) return;

    if (e.key === '.' || e.key === ',') {
      if (!this.decimalsAllowed(el)) {
        e.preventDefault();
        return;
      }
      if (el.value.includes('.') || el.value.includes(',')) {
        e.preventDefault();
      }
      return;
    }

    if (e.key === '-' || e.key === '−') {
      if (!this.negativesAllowed(el)) {
        e.preventDefault();
        return;
      }
      if (el.selectionStart !== 0 || el.value.includes('-')) {
        e.preventDefault();
      }
      return;
    }

    // e / E / + / 字母 / 其他符號
    e.preventDefault();
  }

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(e: InputEvent): void {
    const el = e.target as HTMLInputElement;
    if (!el || el.readOnly || el.disabled) return;
    if (e.inputType?.startsWith('delete') || e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      return;
    }
    const data = e.data;
    if (data == null) return;
    if (!isAllowedNumericChunk(data, this.decimalsAllowed(el), this.negativesAllowed(el))) {
      e.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    const el = e.target as HTMLInputElement;
    if (!el || el.readOnly || el.disabled) return;
    const text = e.clipboardData?.getData('text') ?? '';
    const cleaned = sanitizeNumeric(text, this.decimalsAllowed(el), this.negativesAllowed(el));
    if (cleaned !== text.trim()) {
      e.preventDefault();
      if (cleaned === '') return;
      insertAtCursor(el, cleaned);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (!isAllowedNumericChunk(cleaned, this.decimalsAllowed(el), this.negativesAllowed(el))) {
      e.preventDefault();
    }
  }

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent): void {
    const el = e.target as HTMLInputElement;
    if (!el || el.readOnly || el.disabled) return;
    const text = e.dataTransfer?.getData('text') ?? '';
    if (!isAllowedNumericChunk(text, this.decimalsAllowed(el), this.negativesAllowed(el))) {
      e.preventDefault();
    }
  }

  private decimalsAllowed(el: HTMLInputElement): boolean {
    if (this.allowDecimal === true || this.allowDecimal === '') return true;
    if (this.allowDecimal === false) return false;
    const step = el.getAttribute('step');
    if (!step || step === 'any') return true;
    return !Number.isInteger(Number(step));
  }

  private negativesAllowed(el: HTMLInputElement): boolean {
    if (this.allowNegative === true || this.allowNegative === '') return true;
    if (this.allowNegative === false) return false;
    const min = el.getAttribute('min');
    if (min == null || min === '') return false;
    return Number(min) < 0;
  }
}

function isNavOrEditKey(e: KeyboardEvent): boolean {
  return (
    e.key === 'Backspace' ||
    e.key === 'Delete' ||
    e.key === 'Tab' ||
    e.key === 'Escape' ||
    e.key === 'Enter' ||
    e.key === 'Home' ||
    e.key === 'End' ||
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown' ||
    e.key === 'Clear'
  );
}

function isAllowedNumericChunk(text: string, allowDecimal: boolean, allowNegative: boolean): boolean {
  const t = text.trim().replace(',', '.');
  if (t === '') return true;
  if (t === '-') return allowNegative;
  if (t === '.') return allowDecimal;
  const pattern = allowDecimal
    ? allowNegative
      ? /^-?\d*\.?\d*$/
      : /^\d*\.?\d*$/
    : allowNegative
      ? /^-?\d*$/
      : /^\d*$/;
  return pattern.test(t);
}

function sanitizeNumeric(text: string, allowDecimal: boolean, allowNegative: boolean): string {
  let s = text.trim().replace(/,/g, '.');
  let out = '';
  let seenDot = false;
  let seenDigit = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') {
      out += ch;
      seenDigit = true;
      continue;
    }
    if (ch === '.' && allowDecimal && !seenDot) {
      out += '.';
      seenDot = true;
      continue;
    }
    if (ch === '-' && allowNegative && out.length === 0 && !seenDigit) {
      out += '-';
    }
  }
  return out;
}

function insertAtCursor(el: HTMLInputElement, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  // type=number：只接受合法數字字串
  if (next === '' || next === '-' || next === '.' || /^-?\d*\.?\d*$/.test(next)) {
    el.value = next;
    const pos = start + text.length;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* type=number 部分瀏覽器不支援 selection */
    }
  }
}
