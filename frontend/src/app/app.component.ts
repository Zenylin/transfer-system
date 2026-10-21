import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { NetworkStatusService } from './services/network-status.service';
import { SyncQueueService } from './services/sync-queue.service';
import { AuthService } from './services/auth.service';
import { ActiveCaseService } from './services/active-case.service';
import '/home/nemo/medical-system/frontend/src/styles.css';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  navOpen = false;
  private routerSub?: Subscription;

  readonly network = inject(NetworkStatusService);
  readonly syncQueue = inject(SyncQueueService);
  readonly auth = inject(AuthService);
  readonly casesApi = inject(ActiveCaseService);
  private router = inject(Router);

  private readonly urlSignal = signal(this.router.url);

  readonly showShell = computed(() => {
    const url = this.urlSignal();
    return this.auth.isLoggedIn && !url.startsWith('/login');
  });

  readonly activeCase = this.casesApi.activeCase;

  readonly formLinks = computed(() => {
    const c = this.activeCase();
    if (!c) return [];
    const base = `/cases/${c.id}`;
    const links = [
      { path: `${base}/registry`, label: '外接紀錄表', code: 'S-REG', permission: 'forms.registry' },
      { path: `${base}/history`, label: '孕產史／系統交班', code: 'S-HX', permission: 'forms.history' },
      { path: `${base}/doctor`, label: '轉診紀錄單（醫師）', code: 'S-DR', permission: 'forms.doctor' },
      { path: `${base}/nurse`, label: '轉診紀錄單（護理師）', code: 'S-NS', permission: 'forms.nurse' },
    ];
    return links.filter((link) => this.auth.can(link.permission));
  });

  ngOnInit(): void {
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.urlSignal.set(e.urlAfterRedirects);
        const m = e.urlAfterRedirects.match(/\/cases\/([^/]+)/);
        if (m?.[1]) this.casesApi.select(m[1]);
        if (window.innerWidth < 1024) this.closeNav();
      });

    void this.syncQueue.refresh().then(() => this.syncQueue.flush());
    if (this.auth.isLoggedIn) {
      void this.auth.refreshProfile().catch(() => undefined);
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleNav(): void {
    this.navOpen = !this.navOpen;
  }

  closeNav(): void {
    this.navOpen = false;
  }

  clearCase(): void {
    this.casesApi.select(null);
    void this.router.navigate(['/']);
    this.closeNav();
  }

  logout(): void {
    this.auth.logout();
    this.casesApi.select(null);
    void this.router.navigate(['/login']);
  }

  async retrySync(): Promise<void> {
    await this.syncQueue.retryFailed();
  }

  async flushSync(): Promise<void> {
    await this.syncQueue.flush();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 1024) this.closeNav();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeNav();
  }
}
