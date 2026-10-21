import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthUser } from './auth.service';

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
}

export interface RoleDef {
  key: string;
  label: string;
  permissions: string[];
}

export interface AdminCatalog {
  permissions: PermissionDef[];
  roles: RoleDef[];
  users: AuthUser[];
}

export interface MonthStat {
  key: string;
  label: string;
  total: number;
  transferred: number;
  notTransferred: number;
}

export interface TransferStats {
  year: string;
  years: string[];
  totals: { all: number; undated: number };
  range: {
    total: number;
    transferred: number;
    notTransferred: number;
    rate: number;
    replyYes: number;
    replyNo: number;
    replyEmpty: number;
  };
  monthly: MonthStat[];
  reasons: { key: string; label: string; count: number }[];
  hospitals: { name: string; count: number }[];
  beds: { name: string; count: number }[];
}

export interface UserDraft {
  id?: string;
  username: string;
  name: string;
  password: string;
  role: string;
  permissions: string[];
  active: boolean;
}

export function apiError(error: unknown, fallback: string): string {
  const body = (error as { error?: { error?: string } })?.error;
  return body?.error || fallback;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  catalog(): Promise<AdminCatalog> {
    return firstValueFrom(this.http.get<AdminCatalog>('/api/transfer/admin/users'));
  }

  createUser(draft: UserDraft): Promise<AuthUser> {
    return firstValueFrom(
      this.http.post<AuthUser>('/api/transfer/admin/users', {
        username: draft.username,
        name: draft.name,
        password: draft.password,
        role: draft.role,
        permissions: draft.permissions,
        active: draft.active,
      }),
    );
  }

  updateUser(id: string, draft: UserDraft): Promise<AuthUser> {
    const body: Record<string, unknown> = {
      username: draft.username,
      name: draft.name,
      role: draft.role,
      permissions: draft.permissions,
      active: draft.active,
    };
    if (draft.password.trim()) body['password'] = draft.password;
    return firstValueFrom(this.http.patch<AuthUser>(`/api/transfer/admin/users/${id}`, body));
  }

  deleteUser(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/transfer/admin/users/${id}`));
  }

  stats(year: string): Promise<TransferStats> {
    return firstValueFrom(
      this.http.get<TransferStats>('/api/transfer/admin/stats', { params: { year } }),
    );
  }
}
