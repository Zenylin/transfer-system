import { Routes } from '@angular/router';
import { permissionGuard } from './guards/permission.guard';
import { LoginComponent } from './pages/login/login.component';
import { AdminPage } from './pages/admin/admin.page';
import { TransferListPage } from './pages/transfer-list/transfer-list.page';
import { RegistryFormPage } from './pages/registry-form/registry-form.page';
import { HistoryFormPage } from './pages/history-form/history-form.page';
import { DoctorRecordPage } from './pages/doctor-record/doctor-record.page';
import { NurseRecordPage } from './pages/nurse-record/nurse-record.page';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'admin', component: AdminPage, canActivate: [permissionGuard('users.manage', 'stats.view')] },
  { path: '', component: TransferListPage, canActivate: [permissionGuard('transfers.view')] },
  {
    path: 'cases/:id/registry',
    component: RegistryFormPage,
    canActivate: [permissionGuard('forms.registry')],
  },
  {
    path: 'cases/:id/history',
    component: HistoryFormPage,
    canActivate: [permissionGuard('forms.history')],
  },
  {
    path: 'cases/:id/doctor',
    component: DoctorRecordPage,
    canActivate: [permissionGuard('forms.doctor')],
  },
  {
    path: 'cases/:id/nurse',
    component: NurseRecordPage,
    canActivate: [permissionGuard('forms.nurse')],
  },
  // 交班單已併入護理師單（簽名前）
  {
    path: 'cases/:id/handover',
    component: NurseRecordPage,
    canActivate: [permissionGuard('forms.nurse')],
  },
  // 舊路徑導向總表，避免書籤失效
  { path: 'transfer/form-2', redirectTo: '', pathMatch: 'full' },
  { path: 'transfer/form-2/:id', redirectTo: '', pathMatch: 'full' },
  { path: 'transfer/form-3-1', redirectTo: '', pathMatch: 'full' },
  { path: 'transfer/form-3-2', redirectTo: '', pathMatch: 'full' },
  { path: 'transfer-menu', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
