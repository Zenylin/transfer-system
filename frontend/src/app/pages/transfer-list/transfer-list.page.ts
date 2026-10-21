import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActiveCaseService, type TransferCase } from '../../services/active-case.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-transfer-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transfer-list.page.html',
  styleUrl: './transfer-list.page.css',
})
export class TransferListPage implements OnInit {
  private casesApi = inject(ActiveCaseService);
  private router = inject(Router);
  readonly auth = inject(AuthService);

  pageSize = signal(50);
  query = signal('');
  creating = signal(false);
  deletingId = signal<string | null>(null);
  /** 待確認刪除的個案（有值時顯示確認視窗） */
  pendingDelete = signal<TransferCase | null>(null);

  readonly pageSizeOptions = [10, 50, 100];
  readonly activeId = this.casesApi.activeId;
  readonly loading = this.casesApi.loading;
  readonly error = this.casesApi.error;
  readonly mongoOk = this.casesApi.mongoOk;

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    let rows = this.casesApi.cases();
    if (q) {
      rows = rows.filter(
        (c) =>
          c.serial.toLowerCase().includes(q) ||
          c.hospitalName.toLowerCase().includes(q) ||
          c.assignedDoctor.toLowerCase().includes(q) ||
          c.transferReason.toLowerCase().includes(q),
      );
    }
    return rows.slice(0, this.pageSize());
  });

  ngOnInit(): void {
    void this.reload();
  }

  reload(): void {
    void this.casesApi.refresh(this.pageSize(), this.query());
  }

  openCase(c: TransferCase): void {
    const order: [string, string][] = [
      ['forms.registry', 'registry'],
      ['forms.history', 'history'],
      ['forms.doctor', 'doctor'],
      ['forms.nurse', 'nurse'],
    ];
    const hit = order.find(([permission]) => this.auth.can(permission));
    if (!hit) {
      alert('此帳號沒有表單權限');
      return;
    }
    this.casesApi.select(c.id);
    void this.router.navigate(['/cases', c.id, hit[1]]);
  }

  async createNew(): Promise<void> {
    if (this.creating()) return;
    this.creating.set(true);
    try {
      const neu = await this.casesApi.createCase();
      this.openCase(neu);
    } catch (e: any) {
      alert(e?.message || '建立失敗（請確認 Mongo / API）');
    } finally {
      this.creating.set(false);
    }
  }

  labelReason(c: TransferCase): string {
    return this.casesApi.labelNoTransfer(c.noTransferReason);
  }

  transferred(c: TransferCase): boolean {
    return this.casesApi.isTransferred(c.noTransferReason);
  }

  askDelete(c: TransferCase, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.deletingId()) return;
    this.pendingDelete.set(c);
  }

  cancelDelete(): void {
    if (this.deletingId()) return;
    this.pendingDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const c = this.pendingDelete();
    if (!c || this.deletingId()) return;
    this.deletingId.set(c.id);
    try {
      await this.casesApi.deleteCase(c.id);
      if (this.activeId() === c.id) this.casesApi.select(null);
      this.pendingDelete.set(null);
    } catch (e: any) {
      alert(e?.message || '刪除失敗');
    } finally {
      this.deletingId.set(null);
    }
  }
}
