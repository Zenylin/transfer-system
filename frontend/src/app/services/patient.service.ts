// src/app/services/patient.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PatientService {
	private http = inject(HttpClient);
	// 走相對路徑，開發用 Angular proxy / 外網用 Gateway 轉到後端
	private apiUrl = '/api';

	saveTransferRegistry(data: any): Observable<any> {
		console.log('正在提交轉診登錄資料:', data);
		return this.http.post(`${this.apiUrl}/transfer/registry`, data);
	}

	getPatientById(id: string): Observable<any> {
		return this.http.get(`${this.apiUrl}/patient/${id}`);
	}

	transcribeAudio(file: File): Observable<any> {
		const formData = new FormData();
		formData.append('audio', file);
		return this.http.post(`${this.apiUrl}/speech-to-text`, formData);
	}
}
