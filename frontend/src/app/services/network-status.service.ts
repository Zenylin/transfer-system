import { Injectable, NgZone, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private zone = inject(NgZone);

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;

    const setOnline = (value: boolean) => {
      this.zone.run(() => this.online.set(value));
    };

    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }

  get isOnline(): boolean {
    return this.online();
  }
}
