export interface TransferTask {
  id: number;
  patientName: string;
  status: 'pending' | 'in-progress' | 'completed';
  urgency: 'routine' | 'urgent';
  reason: string;
  hospitalName: string;
  lastUpdated: string;
}