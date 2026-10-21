import { Injectable } from '@angular/core';
import { draftKey, getOfflineDb, type DraftRecord, type FormType } from './offline-db';

@Injectable({ providedIn: 'root' })
export class DraftStoreService {
  async save(formType: FormType, payload: Record<string, unknown>, patientId?: string | null): Promise<void> {
    const db = await getOfflineDb();
    const id = draftKey(formType, patientId);
    const record: DraftRecord = {
      id,
      formType,
      patientId: patientId || undefined,
      payload,
      updatedAt: Date.now()
    };
    await db.put('drafts', record);
  }

  async load(formType: FormType, patientId?: string | null): Promise<DraftRecord | undefined> {
    const db = await getOfflineDb();
    return db.get('drafts', draftKey(formType, patientId));
  }

  async clear(formType: FormType, patientId?: string | null): Promise<void> {
    const db = await getOfflineDb();
    await db.delete('drafts', draftKey(formType, patientId));
  }
}
