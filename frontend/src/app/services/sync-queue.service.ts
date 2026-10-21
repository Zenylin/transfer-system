import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PatientService } from './patient.service';
import { NetworkStatusService } from './network-status.service';
import {
  getOfflineDb,
  newClientId,
  type SyncEndpoint,
  type SyncQueueItem
} from './offline-db';

@Injectable({ providedIn: 'root' })
export class SyncQueueService {
  private patientService = inject(PatientService);
  private network = inject(NetworkStatusService);

  private readonly items = signal<SyncQueueItem[]>([]);
  private flushing = false;

  readonly pendingCount = computed(
    () => this.items().filter((i) => i.status === 'pending' || i.status === 'failed' || i.status === 'syncing').length
  );
  readonly failedCount = computed(() => this.items().filter((i) => i.status === 'failed').length);
  readonly isSyncing = computed(() => this.items().some((i) => i.status === 'syncing') || this.flushing);
  readonly queue = this.items.asReadonly();

  constructor() {
    void this.refresh();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.flush();
      });
    }
  }

  async refresh(): Promise<void> {
    const db = await getOfflineDb();
    const all = await db.getAll('outbox');
    const active = all
      .filter((i) => i.status !== 'done')
      .sort((a, b) => a.createdAt - b.createdAt);
    this.items.set(active);
  }

  async enqueue(
    endpoint: SyncEndpoint,
    payload: Record<string, unknown>,
    clientId = newClientId()
  ): Promise<SyncQueueItem> {
    const now = Date.now();
    const item: SyncQueueItem = {
      id: newClientId(),
      clientId,
      endpoint,
      method: 'POST',
      payload: { ...payload, clientId },
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now
    };
    const db = await getOfflineDb();
    await db.put('outbox', item);
    await this.refresh();
    return item;
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.network.isOnline) return;
    this.flushing = true;

    try {
      await this.refresh();
      const pending = this.items().filter((i) => i.status === 'pending' || i.status === 'failed');

      for (const item of pending) {
        if (!this.network.isOnline) break;
        await this.syncOne(item.id);
      }
    } finally {
      this.flushing = false;
      await this.refresh();
    }
  }

  async retryFailed(): Promise<void> {
    const db = await getOfflineDb();
    const failed = (await db.getAll('outbox')).filter((i) => i.status === 'failed');
    for (const item of failed) {
      item.status = 'pending';
      item.lastError = undefined;
      item.updatedAt = Date.now();
      await db.put('outbox', item);
    }
    await this.refresh();
    await this.flush();
  }

  private async syncOne(id: string): Promise<void> {
    const db = await getOfflineDb();
    const item = await db.get('outbox', id);
    if (!item || item.status === 'done') return;

    item.status = 'syncing';
    item.attempts += 1;
    item.updatedAt = Date.now();
    await db.put('outbox', item);
    await this.refresh();

    try {
      if (item.endpoint === 'transfer/registry') {
        await firstValueFrom(this.patientService.saveTransferRegistry(item.payload));
      } else {
        throw new Error(`未知 endpoint: ${item.endpoint}`);
      }

      item.status = 'done';
      item.lastError = undefined;
      item.updatedAt = Date.now();
      await db.put('outbox', item);
      // 成功後可清掉，避免本機堆積
      await db.delete('outbox', item.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      item.status = 'failed';
      item.lastError = message;
      item.updatedAt = Date.now();
      await db.put('outbox', item);
    } finally {
      await this.refresh();
    }
  }
}
