import mongoose from 'mongoose';

/**
 * NTMS 轉診一筆 = 一個 Transfer document（CC_DB.transfers）
 *
 * ├─ serial / patientId          序號（YYYYMMDD##）
 * ├─ registry 欄位（頂層，供清單查詢）  ← 外接紀錄表
 * ├─ history                     ← 新生兒疾病暨案母孕產史
 * ├─ doctorRecord                ← 轉診紀錄單（醫師）
 * ├─ nurseRecord                 ← 轉診紀錄單（護理師）
 * ├─ handover                    ← 交班單
 * └─ formUpdatedAt.{section}     各表單最後暫存時間
 */
const TransferSchema = new mongoose.Schema(
  {
    serial: { type: String, index: true, unique: true, sparse: true },
    patientId: { type: String, index: true },

    // --- 外接紀錄表（registry，頂層方便清單 API）---
    callDate: String,
    callTime: String,
    hospitalName: String,
    hospitalPhone: String,
    transferReason: String,
    registrar: String,
    bedControlDoctor: String,
    assignedDoctor: String,
    noTransferReason: {
      type: String,
      enum: ['none', 'full', 'lt3', 'self', ''],
      default: 'none',
    },
    doctorReply24h: { type: String, enum: ['', 'yes', 'no'], default: '' },
    preBedSlots: { type: [String], default: [] },
    externalTransferAt: String,

    // --- 其餘四張表單（JSON blob，對應前端 form.getRawValue()）---
    history: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    doctorRecord: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    nurseRecord: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    handover: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    formUpdatedAt: {
      registry: Date,
      history: Date,
      doctorRecord: Date,
      nurseRecord: Date,
      handover: Date,
    },

    // 舊欄位相容
    transferDateTime: String,
    recordType: String,
    isTransferred: Boolean,
    replyHours: Number,
    satisfaction: String,
    remarks: String,
  },
  { timestamps: true, minimize: false },
);

TransferSchema.pre('validate', function ensureSerial(next) {
  if (!this.serial && this.patientId) this.serial = this.patientId;
  if (!this.patientId && this.serial) this.patientId = this.serial;
  if (typeof this.isTransferred !== 'boolean' && this.noTransferReason) {
    this.isTransferred = this.noTransferReason === 'none';
  }
  next();
});

export const Transfer = mongoose.model('Transfer', TransferSchema);

export const FORM_SECTIONS = {
  history: 'history',
  doctorRecord: 'doctorRecord',
  nurseRecord: 'nurseRecord',
  handover: 'handover',
};

export const FORM_SECTION_ALIASES = {
  history: 'history',
  'doctor-record': 'doctorRecord',
  doctorRecord: 'doctorRecord',
  'nurse-record': 'nurseRecord',
  nurseRecord: 'nurseRecord',
  handover: 'handover',
};
