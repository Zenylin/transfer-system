import { Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';

/**
 * 純 24 小時制時間選擇（時／分下拉，無上下午）。
 * 值格式：HH:mm 或空字串。
 */
@Component({
  selector: 'app-time-24h',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Time24hComponent),
      multi: true,
    },
  ],
  template: `
    <div class="time-24h" [class.compact]="compact">
      <select
        [ngModel]="hour"
        (ngModelChange)="onHour($event)"
        [disabled]="disabled"
        aria-label="時"
      >
        <option value="">時</option>
        @for (h of hours; track h) {
          <option [value]="h">{{ h }}</option>
        }
      </select>
      <span class="sep">:</span>
      <select
        [ngModel]="minute"
        (ngModelChange)="onMinute($event)"
        [disabled]="disabled"
        aria-label="分"
      >
        <option value="">分</option>
        @for (m of minutes; track m) {
          <option [value]="m">{{ m }}</option>
        }
      </select>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; min-width: 0; }
    .time-24h {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    }
    .time-24h select {
      flex: 1 1 0;
      min-width: 0;
      min-height: 42px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 0.95rem;
      color: #0f172a;
      background: #fff;
    }
    .time-24h.compact select {
      min-height: 32px;
      padding: 2px 4px;
      font-size: 0.75rem;
      border-radius: 6px;
    }
    .sep {
      flex: 0 0 auto;
      font-weight: 700;
      color: #475569;
    }
  `],
})
export class Time24hComponent implements ControlValueAccessor {
  @Input() compact = false;
  @Input() set disabled(v: boolean) {
    this._disabled = !!v;
  }
  get disabled(): boolean {
    return this._disabled;
  }

  readonly hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  readonly minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  hour = '';
  minute = '';
  private _disabled = false;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const v = String(value || '').trim();
    const m = v.match(/^(\d{2}):(\d{2})/);
    this.hour = m ? m[1] : '';
    this.minute = m ? m[2] : '';
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabled = isDisabled;
  }

  onHour(h: string): void {
    this.hour = h;
    this.emit();
  }

  onMinute(m: string): void {
    this.minute = m;
    this.emit();
  }

  private emit(): void {
    this.onTouched();
    // 時、分都選完才寫入，避免半選變成 :00
    if (!this.hour || !this.minute) {
      this.onChange('');
      return;
    }
    this.onChange(`${this.hour}:${this.minute}`);
  }
}
