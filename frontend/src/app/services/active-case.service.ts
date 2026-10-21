import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type NoTransferReason = 'none' | 'full' | 'lt3' | 'self';

/** API path segment → Mongo 欄位 */
export type FormSection = 'history' | 'doctor-record' | 'nurse-record' | 'handover';
export type FormSectionKey = 'history' | 'doctorRecord' | 'nurseRecord' | 'handover';

const SECTION_TO_KEY: Record<FormSection, FormSectionKey> = {
  history: 'history',
  'doctor-record': 'doctorRecord',
  'nurse-record': 'nurseRecord',
  handover: 'handover',
};

export interface TransferCase {
  id: string;
  serial: string;
  callDate: string;
  callTime: string;
  hospitalName: string;
  hospitalPhone: string;
  transferReason: string;
  registrar: string;
  bedControlDoctor: string;
  assignedDoctor: string;
  noTransferReason: NoTransferReason;
  doctorReply24h: '' | 'yes' | 'no';
  preBedSlots: string[];
  externalTransferAt?: string;
  formUpdatedAt?: Partial<Record<FormSectionKey | 'registry', string>>;
}

export interface TransferDetail extends TransferCase {
  history?: Record<string, unknown>;
  doctorRecord?: Record<string, unknown>;
  nurseRecord?: Record<string, unknown>;
  handover?: Record<string, unknown>;
}

const NO_TRANSFER_LABEL: Record<NoTransferReason, string> = {
  none: '有外接（無未外接原因）',
  full: '未外接：滿床',
  lt3: '未外接：空床<3',
  self: '未外接：自行抱來',
};

@Injectable({ providedIn: 'root' })
export class ActiveCaseService {
  private http = inject(HttpClient);

  readonly cases = signal<TransferCase[]>([]);
  readonly details = signal<Record<string, TransferDetail>>({});
  readonly activeId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly mongoOk = signal<boolean | null>(null);

  readonly activeCase = computed(() => {
    const id = this.activeId();
    if (!id) return null;
    return this.details()[id] || this.cases().find((c) => c.id === id) || null;
  });

  readonly hasActiveCase = computed(() => !!this.activeCase());

  select(id: string | null): void {
    this.activeId.set(id);
  }

  getById(id: string): TransferCase | undefined {
    return this.details()[id] || this.cases().find((c) => c.id === id);
  }

  labelNoTransfer(reason: NoTransferReason): string {
    return NO_TRANSFER_LABEL[reason];
  }

  isTransferred(reason: NoTransferReason): boolean {
    return reason === 'none';
  }

  private cacheDetail(detail: TransferDetail): void {
    this.details.update((m) => ({ ...m, [detail.id]: detail }));
    this.cases.update((list) => {
      const idx = list.findIndex((c) => c.id === detail.id);
      const summary: TransferCase = {
        id: detail.id,
        serial: detail.serial,
        callDate: detail.callDate,
        callTime: detail.callTime,
        hospitalName: detail.hospitalName,
        hospitalPhone: detail.hospitalPhone,
        transferReason: detail.transferReason,
        registrar: detail.registrar,
        bedControlDoctor: detail.bedControlDoctor,
        assignedDoctor: detail.assignedDoctor,
        noTransferReason: detail.noTransferReason,
        doctorReply24h: detail.doctorReply24h,
        preBedSlots: detail.preBedSlots,
        externalTransferAt: detail.externalTransferAt,
        formUpdatedAt: detail.formUpdatedAt,
      };
      if (idx >= 0) {
        const next = [...list];
        next[idx] = summary;
        return next;
      }
      return [summary, ...list];
    });
  }

  async refresh(limit = 50, q = ''): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const params: Record<string, string> = { limit: String(limit) };
      if (q.trim()) params['q'] = q.trim();
      const rows = await firstValueFrom(
        this.http.get<TransferCase[]>('/api/transfers', { params }),
      );
      this.cases.set(rows || []);
      try {
        const st = await firstValueFrom(
          this.http.get<{ ok: boolean }>('/api/mongo/status'),
        );
        this.mongoOk.set(!!st?.ok);
      } catch {
        this.mongoOk.set(false);
      }
    } catch (e: any) {
      this.error.set(e?.error?.error || '無法載入轉診清單（Mongo / API）');
      this.mongoOk.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  async loadDetail(id: string, force = false): Promise<TransferDetail | null> {
    if (!force && this.details()[id]) return this.details()[id];
    try {
      const detail = await firstValueFrom(
        this.http.get<TransferDetail>(`/api/transfers/${encodeURIComponent(id)}`),
      );
      this.cacheDetail(detail);
      this.mongoOk.set(true);
      return detail;
    } catch (e: any) {
      this.error.set(e?.error?.error || '無法載入個案');
      return null;
    }
  }

  async ensureCase(id: string): Promise<TransferDetail | null> {
    const cached = await this.loadDetail(id);
    if (cached) return cached;
    await this.refresh(100);
    return this.loadDetail(id, true);
  }

  async createCase(partial?: Partial<TransferCase>): Promise<TransferCase> {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const payload = {
      callDate: `${y}-${m}-${day}`,
      callTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      hospitalName: '',
      hospitalPhone: '',
      transferReason: '',
      registrar: '',
      bedControlDoctor: '',
      assignedDoctor: '',
      noTransferReason: 'none' as NoTransferReason,
      doctorReply24h: '' as const,
      preBedSlots: [] as string[],
      ...partial,
    };
    const saved = await firstValueFrom(
      this.http.post<TransferCase>('/api/transfers', payload),
    );
    this.cases.update((list) => [saved, ...list.filter((c) => c.id !== saved.id)]);
    return saved;
  }

  async saveCase(id: string, patch: Partial<TransferCase>): Promise<TransferCase> {
    const saved = await firstValueFrom(
      this.http.post<TransferCase>(`/api/transfers/${encodeURIComponent(id)}`, patch),
    );
    this.cases.update((list) => list.map((c) => (c.id === id ? { ...c, ...saved } : c)));
    this.details.update((m) =>
      m[id] ? { ...m, [id]: { ...m[id], ...saved } } : m,
    );
    return saved;
  }

  formData(id: string, section: FormSection): Record<string, unknown> {
    const key = SECTION_TO_KEY[section];
    const detail = this.details()[id];
    const blob = detail?.[key];
    return blob && typeof blob === 'object' ? { ...blob } : {};
  }

  async saveFormSection(
    id: string,
    section: FormSection,
    data: Record<string, unknown>,
  ): Promise<TransferDetail> {
    const saved = await firstValueFrom(
      this.http.post<TransferDetail>(
        `/api/transfers/${encodeURIComponent(id)}/forms/${section}`,
        data,
      ),
    );
    this.cacheDetail(saved);
    this.mongoOk.set(true);
    return saved;
  }

  async deleteCase(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ deleted: boolean }>(
        `/api/transfers/${encodeURIComponent(id)}/delete`,
        {},
      ),
    );
    this.cases.update((list) => list.filter((c) => c.id !== id));
    this.details.update((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    if (this.activeId() === id) this.activeId.set(null);
  }
}
