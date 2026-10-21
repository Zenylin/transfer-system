import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PrintSection } from '../../pages/_shared/print-report.util';

/**
 * 預覽列印報告（不含表單控件）。
 * 使用 ViewEncapsulation.None，讓 .printing / @media print 能正確顯示。
 */
@Component({
  selector: 'app-print-report',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="print-report">
      <h1>{{ title }}</h1>
      @if (meta) {
        <p class="meta">{{ meta }}</p>
      }
      @for (sec of sections; track sec.title) {
        <section>
          <h2>{{ sec.title }}</h2>
          <dl class="print-dl">
            @for (r of sec.rows; track r.label) {
              <div class="print-row">
                <dt>{{ r.label }}</dt>
                <dd>{{ r.value }}</dd>
              </div>
            }
          </dl>
        </section>
      }
    </div>
  `,
  styles: [`
    app-print-report {
      display: none;
    }
    .case-form-page.printing app-print-report {
      display: block;
    }
    @media print {
      app-print-report {
        display: block !important;
      }
    }
    .print-report h1 {
      margin: 0 0 6px;
      font-size: 1.35rem;
      color: #0f172a;
    }
    .print-report .meta {
      margin: 0 0 16px;
      color: #475569;
      font-size: 0.9rem;
    }
    .print-report section {
      break-inside: avoid;
      margin-bottom: 14px;
      padding: 0;
      border: none;
      background: transparent;
    }
    .print-report h2 {
      margin: 0 0 8px;
      font-size: 1rem;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }
    .print-dl {
      margin: 0;
    }
    .print-row {
      display: grid;
      grid-template-columns: 10rem minmax(0, 1fr);
      gap: 8px 12px;
      padding: 4px 0;
      border-bottom: 1px dotted #e2e8f0;
      font-size: 0.92rem;
    }
    .print-row dt {
      margin: 0;
      font-weight: 700;
      color: #334155;
    }
    .print-row dd {
      margin: 0;
      color: #0f172a;
      white-space: pre-wrap;
    }
  `],
})
export class PrintReportComponent {
  @Input() title = '';
  @Input() meta = '';
  @Input() sections: PrintSection[] = [];
}
