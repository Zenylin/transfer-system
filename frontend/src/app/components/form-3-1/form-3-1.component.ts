import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Time24hComponent } from '../time-24h/time-24h.component';
import { Datetime24hComponent } from '../time-24h/datetime-24h.component';
import { NumericOnlyDirective } from '../../pages/_shared/numeric-only.directive';

@Component({
  selector: 'app-form-3-1',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, Time24hComponent, Datetime24hComponent, NumericOnlyDirective],
  templateUrl: './form-3-1.component.html'
})
export class Form31Component implements OnInit {
  form31!: FormGroup;

  constructor(private fb: FormBuilder) { }

  ngOnInit() {
    this.form31 = this.fb.group({
      // 1. 轉診資訊區塊
      transferInfo: this.fb.group({
        callTime: [''],
        caller: [''],
        departTime: [''],
        arrivalTime: [''],
        reason: [''],
        treatmentDone: ['']
      }),
      // 2. 到達現況區塊 (獨立出來，對應 HTML 的 formGroupName="arrivalStatus")
      arrivalStatus: this.fb.group({
        hr: [null],
        rr: [null],
        bp: [''],
        bt: [null],
        o2Use: [false],
        o2Flow: [null],
        intubated: [false],
        fio2: [null]
      }),
      // 3. 評估表陣列
      assessments: this.fb.array([
        this.createAssessmentRow('膚色'),
        this.createAssessmentRow('活動力')
      ])
    });
  }

  createAssessmentRow(label: string) {
    return this.fb.group({
      item: [label], 
      score0: [null], 
      score1: [null], 
      score2: [null]
    });
  }

  get assessmentControls(): FormArray {
    return this.form31.get('assessments') as FormArray;
  }

  onSubmit() {
    console.log('表單提交內容:', this.form31.value);
  }
}