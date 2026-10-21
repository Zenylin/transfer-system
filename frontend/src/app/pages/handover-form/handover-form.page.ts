import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActiveCaseService } from '../../services/active-case.service';
import { initCaseFormPage, persistFormSection } from '../../services/case-form.util';
import { Time24hComponent } from '../../components/time-24h/time-24h.component';
import { Datetime24hComponent } from '../../components/time-24h/datetime-24h.component';
import { NUM } from '../_shared/number-limits';
import { NumericOnlyDirective } from '../_shared/numeric-only.directive';
import {
  defaultEmptyDateTimes,
  defaultEmptyTimes,
  nowDateTimeLocal,
} from '../_shared/date-time.util';
import { HANDOVER_NUM_SPECS, findOutOfRange, isValidBp } from '../_shared/form-validation.util';

@Component({
  selector: 'app-handover-form-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    Time24hComponent,
    Datetime24hComponent,
    NumericOnlyDirective,
  ],
  templateUrl: './handover-form.page.html',
  styleUrls: ['../_shared/case-form.css'],
})
export class HandoverFormPage implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private casesApi = inject(ActiveCaseService);

  readonly NUM = NUM;
  readonly nowMax = nowDateTimeLocal();
  caseId = '';
  serial = '';
  hospital = '';
  savedMsg = '';

  form = this.fb.group({
    returnDepartAt: [''],
    returnArriveWardAt: [''],
    admitBtType: [''],
    admitBt: [null as number | null],
    admitHr: [null as number | null],
    admitRr: [null as number | null],
    admitSpo2: [null as number | null],
    admitBp: [''],
  });

  async ngOnInit(): Promise<void> {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    const ok = await initCaseFormPage(this.casesApi, this.caseId, 'handover', this.form, {
      onLoaded: (d) => {
        this.serial = d.serial;
        this.hospital = d.hospitalName;
      },
    });
    if (!ok) {
      void this.router.navigate(['/']);
      return;
    }
    defaultEmptyDateTimes(this.form, ['returnDepartAt']);
    defaultEmptyTimes(this.form, ['returnArriveWardAt']);
  }

  async save(): Promise<void> {
    try {
      this.savedMsg = await persistFormSection(this.casesApi, this.caseId, 'handover', this.form, {
        validate: (raw) => {
          const bad = findOutOfRange(raw, HANDOVER_NUM_SPECS);
          if (bad.length) return `數值超出範圍：${bad.join('、')}`;
          if (raw['admitBp'] && !isValidBp(raw['admitBp'])) {
            return '血壓格式須為「收縮壓/舒張壓」，例如 65/40';
          }
          return null;
        },
      });
    } catch (e: any) {
      this.savedMsg = e?.message || '存檔失敗';
    }
  }
}
