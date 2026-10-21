import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  error = '';
  submitting = false;

  constructor() {
    if (this.auth.isLoggedIn) {
      void this.router.navigateByUrl(this.auth.homeUrl());
    }
  }

  async submit(): Promise<void> {
    if (this.submitting) return;
    this.error = '';
    this.submitting = true;
    try {
      await this.auth.login(this.username, this.password);
      await this.router.navigateByUrl(this.auth.homeUrl());
    } catch (e: unknown) {
      const body = (e as { error?: { error?: string } })?.error;
      this.error = body?.error || '登入失敗，請確認姓名或連線';
    } finally {
      this.submitting = false;
    }
  }
}
