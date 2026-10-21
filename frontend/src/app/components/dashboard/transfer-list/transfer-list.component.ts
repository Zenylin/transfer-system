import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowService } from '../../../services/flow.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-transfer-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transfer-list.component.html',
  styleUrls: ['./transfer-list.component.css']
})
export class TransferListComponent {
  private flowService = inject(FlowService);
  private router = inject(Router);
  tasks = [
    {
      id: 1,
      patientName: '王怡婷',
      doctor: '林醫師',
      urgency: 'urgent', // urgent | routine
      status: 'in-progress',
      reason: '肚子痛',
      hospital: '中壢禾馨',
      phone: '03-388-1234',
      lastUpdated: '2026/06/02 10:42 AM'
    },
    {
      id: 2,
      patientName: '李安安',
      doctor: '林醫師',
      urgency: 'routine',
      status: 'pending',
      reason: '生命徵象強烈不穩定',
      hospital: '中壢禾馨',
      phone: '03-388-1234',
      lastUpdated: '2026/06/02 10:42 AM'
    },
    {
      id: 3,
      patientName: '陳寶寶 (Baby Chen)',
      doctor: '林醫師',
      urgency: 'routine',
      status: 'completed',
      reason: '肚子痛',
      hospital: '新竹台大分院',
      phone: '03-333-5555',
      lastUpdated: '2026/06/02 10:42 AM'
    }
  ];
  onCardClick(task: any) {
    console.log('點擊病人 ID:', task.id);
    this.flowService.currentPatientId = task.id;
    this.router.navigate(['/transfer/form-2', task.id]);
  }
}