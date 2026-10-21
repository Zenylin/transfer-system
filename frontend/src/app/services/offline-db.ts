import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type FormType = 'form-2' | 'form-3-1' | 'form-3-2';

export type SyncEndpoint = 'transfer/registry';

export type SyncItemStatus = 'pending' | 'syncing' | 'done' | 'failed';

export interface DraftRecord {
  id: string;
  formType: FormType;
  patientId?: string;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface SyncQueueItem {
  id: string;
  clientId: string;
  endpoint: SyncEndpoint;
  method: 'POST';
  payload: Record<string, unknown>;
  status: SyncItemStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

interface NtmsDb extends DBSchema {
  drafts: {
    key: string;
    value: DraftRecord;
    indexes: { 'by-form': string };
  };
  outbox: {
    key: string;
    value: SyncQueueItem;
    indexes: { 'by-status': string };
  };
}

const DB_NAME = 'ntms-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NtmsDb>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<NtmsDb>> {
  if (!dbPromise) {
    dbPromise = openDB<NtmsDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
        drafts.createIndex('by-form', 'formType');
        const outbox = db.createObjectStore('outbox', { keyPath: 'id' });
        outbox.createIndex('by-status', 'status');
      }
    });
  }
  return dbPromise;
}

export function draftKey(formType: FormType, patientId?: string | null): string {
  return patientId ? `${formType}:${patientId}` : `${formType}:new`;
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `cid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
