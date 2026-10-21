import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { ActiveCaseService, type FormSection } from './active-case.service';

/** 載入個案 + 表單 blob，供各表單頁 ngOnInit 使用 */
export async function initCaseFormPage(
  casesApi: ActiveCaseService,
  caseId: string,
  section: FormSection,
  form: FormGroup,
  opts?: {
    onLoaded?: (detail: NonNullable<Awaited<ReturnType<ActiveCaseService['ensureCase']>>>) => void;
    rebuildArrays?: (fb: FormBuilder, data: Record<string, unknown>) => void;
  },
): Promise<boolean> {
  casesApi.select(caseId);
  const detail = await casesApi.ensureCase(caseId);
  if (!detail) return false;

  const data = casesApi.formData(caseId, section);
  if (opts?.rebuildArrays && Object.keys(data).length) {
    opts.rebuildArrays(new FormBuilder(), data);
  }
  if (Object.keys(data).length) {
    form.patchValue(data);
  }
  opts?.onLoaded?.(detail);
  return true;
}

export function patchEvalRows(
  fb: FormBuilder,
  form: FormGroup,
  data: Record<string, unknown>,
): void {
  const rows = data['evalRows'];
  if (!Array.isArray(rows) || !rows.length) return;
  const arr = fb.array(
    rows.map((row: any) =>
      fb.group({
        item: [row?.item ?? ''],
        t0: [row?.t0 ?? ''],
        t1: [row?.t1 ?? ''],
        t2: [row?.t2 ?? ''],
        t3: [row?.t3 ?? ''],
      }),
    ),
  );
  form.setControl('evalRows', arr);
}

export async function persistFormSection(
  casesApi: ActiveCaseService,
  caseId: string,
  section: FormSection,
  form: FormGroup,
  opts?: {
    /** 回傳錯誤訊息則中止存檔 */
    validate?: (raw: Record<string, unknown>) => string | null;
  },
): Promise<string> {
  const payload = form.getRawValue() as Record<string, unknown>;
  const err = opts?.validate?.(payload);
  if (err) throw new Error(err);
  await casesApi.saveFormSection(caseId, section, payload);
  const labels: Record<FormSection, string> = {
    history: 'CC_DB.transfers.history（孕產史）',
    'doctor-record': 'CC_DB.transfers.doctorRecord（醫師紀錄）',
    'nurse-record': 'CC_DB.transfers.nurseRecord（護理紀錄）',
    handover: 'CC_DB.transfers.handover（交班單）',
  };
  return `已存入 MongoDB — ${labels[section]}`;
}
