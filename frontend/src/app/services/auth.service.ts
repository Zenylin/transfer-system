import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const KEY = 'ntms-auth';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  roleLabel: string;
  permissions: string[];
  active: boolean;
}

interface Session {
  token: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private session = signal<Session | null>(this.read());

  readonly user = computed(() => this.session()?.user ?? null);

  get isLoggedIn(): boolean {
    return !!this.session()?.token;
  }

  token(): string | null {
    return this.session()?.token ?? null;
  }

  can(key: string): boolean {
    const user = this.user();
    if (!user || user.active === false) return false;
    if (user.role === 'admin') return true;
    return !!user.permissions?.includes(key);
  }

  homeUrl(): string {
    if (this.can('transfers.view')) return '/';
    if (this.can('users.manage') || this.can('stats.view')) return '/admin';
    return '/login';
  }

  async login(username: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string; user: AuthUser }>('/api/transfer/auth/login', {
        username: username.trim(),
        password,
      }),
    );
    this.persist({ token: res.token, user: res.user });
  }

  logout(): void {
    localStorage.removeItem(KEY);
    this.session.set(null);
  }

  async refreshProfile(): Promise<void> {
    if (!this.token()) return;
    const user = await firstValueFrom(this.http.get<AuthUser>('/api/transfer/auth/me'));
    const token = this.token();
    if (!token) return;
    this.persist({ token, user });
  }

  applyUser(user: AuthUser): void {
    const token = this.token();
    if (!token) return;
    this.persist({ token, user });
  }

  private persist(session: Session): void {
    localStorage.setItem(KEY, JSON.stringify(session));
    this.session.set(session);
  }

  private read(): Session | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Session;
      if (!parsed?.token || !parsed.user?.username) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
