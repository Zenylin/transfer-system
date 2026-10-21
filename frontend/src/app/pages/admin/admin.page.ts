import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AuthUser } from '../../services/auth.service';
import {
  AdminService,
  PermissionDef,
  RoleDef,
  TransferStats,
  UserDraft,
  apiError,
} from '../../services/admin.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.css',
})
export class AdminPage implements OnInit {
  readonly auth = inject(AuthService);
  private admin = inject(AdminService);

  tab = signal<'accounts' | 'stats'>('accounts');
  loadingUsers = signal(false);
  loadingStats = signal(false);
  saving = signal(false);
  error = signal('');
  notice = signal('');

  users = signal<AuthUser[]>([]);
  roles: RoleDef[] = [];
  permissions: PermissionDef[] = [];

  editor: UserDraft | null = null;
  confirmPassword = '';
  pendingDelete: AuthUser | null = null;

  year = signal(String(new Date().getFullYear()));
  stats = signal<TransferStats | null>(null);

  readonly canManage = computed(() => this.auth.can('users.manage'));
  readonly canStats = computed(() => this.auth.can('stats.view'));

  permGroups(): { group: string; items: PermissionDef[] }[] {
    const map = new Map<string, PermissionDef[]>();
    for (const item of this.permissions) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()].map(([group, items]) => ({ group, items }));
  }

  readonly barMax = computed(() => {
    const rows = this.stats()?.monthly || [];
    return Math.max(1, ...rows.map((row) => row.total));
  });

  readonly hospitalMax = computed(() => {
    const rows = this.stats()?.hospitals || [];
    return Math.max(1, ...rows.map((row) => row.count));
  });

  readonly reasonMax = computed(() => {
    const rows = this.stats()?.reasons || [];
    return Math.max(1, ...rows.map((row) => row.count));
  });

  readonly bedMax = computed(() => {
    const rows = this.stats()?.beds || [];
    return Math.max(1, ...rows.map((row) => row.count));
  });

  ngOnInit(): void {
    if (!this.canManage() && this.canStats()) this.tab.set('stats');
    if (this.canManage()) void this.loadUsers();
    if (this.canStats()) void this.loadStats();
  }

  showTab(next: 'accounts' | 'stats'): void {
    this.tab.set(next);
    this.error.set('');
    this.notice.set('');
    if (next === 'stats' && !this.stats()) void this.loadStats();
  }

  async loadUsers(): Promise<void> {
    this.loadingUsers.set(true);
    try {
      const data = await this.admin.catalog();
      this.users.set(data.users);
      this.roles = data.roles;
      this.permissions = data.permissions;
    } catch (e) {
      this.error.set(apiError(e, '無法載入帳號'));
    } finally {
      this.loadingUsers.set(false);
    }
  }

  async loadStats(): Promise<void> {
    this.loadingStats.set(true);
    try {
      const data = await this.admin.stats(this.year());
      this.stats.set(data);
      if (data.year !== 'all') this.year.set(data.year);
    } catch (e) {
      this.error.set(apiError(e, '無法載入統計'));
    } finally {
      this.loadingStats.set(false);
    }
  }

  onYearChange(value: string): void {
    this.year.set(value);
    void this.loadStats();
  }

  openCreate(): void {
    const role = this.roles.find((item) => item.key === 'nurse') || this.roles[0];
    this.editor = {
      username: '',
      name: '',
      password: '',
      role: role?.key || 'nurse',
      permissions: [...(role?.permissions || [])],
      active: true,
    };
    this.confirmPassword = '';
    this.error.set('');
    this.notice.set('');
  }

  openEdit(user: AuthUser): void {
    this.editor = {
      id: user.id,
      username: user.username,
      name: user.name,
      password: '',
      role: user.role,
      permissions: [...user.permissions],
      active: user.active,
    };
    this.confirmPassword = '';
    this.error.set('');
    this.notice.set('');
  }

  closeEditor(): void {
    this.editor = null;
    this.confirmPassword = '';
  }

  onRoleChange(role: string): void {
    if (!this.editor) return;
    this.editor.role = role;
    const found = this.roles.find((item) => item.key === role);
    this.editor.permissions = [...(found?.permissions || [])];
  }

  hasPerm(key: string): boolean {
    return !!this.editor?.permissions.includes(key);
  }

  togglePerm(key: string, checked: boolean): void {
    if (!this.editor || this.editor.role === 'admin') return;
    const next = new Set(this.editor.permissions);
    if (checked) next.add(key);
    else next.delete(key);
    this.editor.permissions = [...next];
  }

  roleName(key: string): string {
    return this.roles.find((item) => item.key === key)?.label || key;
  }

  permSummary(user: AuthUser): string {
    if (user.role === 'admin') return '全部權限';
    const labels = this.permissions
      .filter((item) => user.permissions.includes(item.key))
      .map((item) => item.label);
    if (!labels.length) return '無權限';
    if (labels.length <= 3) return labels.join('、');
    return `${labels.slice(0, 3).join('、')} 等 ${labels.length} 項`;
  }

  async saveEditor(): Promise<void> {
    const draft = this.editor;
    if (!draft || this.saving()) return;
    if (draft.password || this.confirmPassword || !draft.id) {
      if (draft.password.length < 6) {
        this.error.set('密碼至少 6 個字元');
        return;
      }
      if (draft.password !== this.confirmPassword) {
        this.error.set('兩次輸入的密碼不一致');
        return;
      }
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = draft.id
        ? await this.admin.updateUser(draft.id, draft)
        : await this.admin.createUser(draft);
      if (saved.id === this.auth.user()?.id) this.auth.applyUser(saved);
      this.notice.set(draft.id ? '已更新帳號' : '已建立帳號');
      this.closeEditor();
      await this.loadUsers();
    } catch (e) {
      this.error.set(apiError(e, '儲存失敗'));
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(user: AuthUser): void {
    this.pendingDelete = user;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  async confirmDelete(): Promise<void> {
    const user = this.pendingDelete;
    if (!user || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.admin.deleteUser(user.id);
      this.pendingDelete = null;
      this.notice.set('已刪除帳號');
      await this.loadUsers();
    } catch (e) {
      this.error.set(apiError(e, '刪除失敗'));
    } finally {
      this.saving.set(false);
    }
  }

  barHeight(total: number): number {
    if (!total) return 0;
    return Math.max((total / this.barMax()) * 100, 8);
  }

  share(count: number, max: number): number {
    if (!count) return 0;
    return Math.max((count / max) * 100, 6);
  }

  donutStyle(): string {
    const range = this.stats()?.range;
    if (!range?.total) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    const deg = (range.transferred / range.total) * 360;
    return `conic-gradient(#0f766e 0deg ${deg}deg, #d97706 ${deg}deg 360deg)`;
  }
}
