import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NumericOnlyDirective } from '../../pages/_shared/numeric-only.directive';

@Component({
  selector: 'app-form-3-2',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, NumericOnlyDirective],
  templateUrl: './form-3-2.component.html'
})
export class Form32Component implements OnInit {
  form32!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.form32 = this.fb.group({
      // 基本資料與 TOCC
      basicInfo: this.fb.group({
        dest: [''], phone: [''], date: [''],
        fatherTocc: [false], fatherToccDate: [''],
        motherTocc: [false], motherToccDate: [''],
        other: ['']
      }),
      // 個案基本資料
      caseInfo: this.fb.group({
        G: [null], P: [null], mode: [''], birthWeight: [null],
        GA: [null], EDC: [''], headCircumference: [null],
        birthDate: [''], birthTime: [''], 
        apgar1: [null], apgar5: [null],
        appearance: [false], appearanceNote: ['']
      }),
      // 醫療資訊
      medicalInfo: this.fb.group({
        transferReason: [''],
        transferProcess: [''],
        vdrl: [false], hbsag: [false], hbeag: [false], hiv: [false],
        gbs: [false], gdm: [false], pih: [false],破水: [false], 發燒: [false], 感冒: [false],
        arrivalBt: [null], arrivalBp: [''], arrivalHr: [null], arrivalRr: [null], arrivalSpo2: [null]
      }),
      // 處置項目
      treatment: this.fb.group({
        vitK: [false], eyeDrop: [false], antibioticType: [''],
        lastFeedTime: [''], lastGlucose: [null], tubing: ['']
      })
    });
  }

  onSubmit() {
    console.log('Form 3-2 完整提交資料:', this.form32.value);
  }
}