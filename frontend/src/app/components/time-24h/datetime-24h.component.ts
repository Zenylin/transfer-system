import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Time24hComponent } from './time-24h.component';

/**
 * 日期 + 24 小時制時間（取代 datetime-local，避免上下午）。
 * 值格式：yyyy-MM-ddTHH:mm 或空字串。
 */
@Component({
  selector: 'app-datetime-24h',
  standalone: true,
  imports: [CommonModule, FormsModule, Time24hComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Datetime24hComponent),
      multi: true,
    },
  ],
  template: `
    <div class="datetime-24h">
      <input
        type="date"
        [ngModel]="datePart"
        (ngModelChange)="onDate($event)"
        [max]="maxDate || null"
        [disabled]="disabled"
      />
      <app-time-24h
        [ngModel]="timePart"
        (ngModelChange)="onTime($event)"
        [disabled]="disabled"
      ></app-time-24h>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; min-width: 0; }
    .datetime-24h {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 8px;
      align-items: center;
    }
    .datetime-24h input[type="date"] {
      width: 100%;
      box-sizing: border-box;
      min-height: 42px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 0.95rem;
      color: #0f172a;
      background: #fff;
    }
    @media (max-width: 560px) {
      .datetime-24h { grid-template-columns: 1fr; }
    }
  `],
})
export class Datetime24hComponent implements ControlValueAccessor {
  /** yyyy-MM-dd 或 yyyy-MM-ddTHH:mm（只取日期作 max） */
  @Input() max = '';

  datePart = '';
  timePart = '';
  disabled = false;

  get maxDate(): string {
    const m = String(this.max || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const v = String(value || '').trim();
    const m = v.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
    if (m) {
      this.datePart = m[1];
      this.timePart = m[2];
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      this.datePart = v;
      this.timePart = '';
      return;
    }
    this.datePart = '';
    this.timePart = '';
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onDate(d: string): void {
    this.datePart = d || '';
    this.emit();
  }

  onTime(t: string): void {
    this.timePart = t || '';
    this.emit();
  }

  private emit(): void {
    this.onTouched();
    if (this.datePart && this.timePart) {
      this.onChange(`${this.datePart}T${this.timePart}`);
      return;
    }
    this.onChange('');
  }
}
