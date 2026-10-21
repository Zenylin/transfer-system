#!/usr/bin/env node
/**
 * 建立示範轉診紀錄（給客戶 demo）
 * - 4 筆有外接：五張表單所有欄位皆填
 * - 1 筆未外接（2026080904）：僅外接紀錄表 + 部分孕產史
 *
 * 用法：cd backend && node seed-demo-transfers.js
 * 或：./scripts/seed-demo-transfers.sh
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Transfer } from './models/Transfer.js';
import { FULL_DEMO_CASES, NO_TRANSFER_DEMO } from './demo-transfer-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/CC_DB';

const ALL_CASES = [...FULL_DEMO_CASES, NO_TRANSFER_DEMO];

async function main() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
  });
  console.log('Connected →', MONGO_URI);

  for (const row of ALL_CASES) {
    const { serial } = row;
    const existing = await Transfer.findOne({ serial });
    if (existing) {
      await Transfer.updateOne({ serial }, { $set: row });
      console.log('更新', serial, row.hospitalName, row.noTransferReason === 'none' ? '（有外接·全欄位）' : '（未外接）');
    } else {
      await Transfer.create(row);
      console.log('新增', serial, row.hospitalName);
    }
  }

  const total = await Transfer.countDocuments();
  console.log(`\n完成。CC_DB.transfers 共 ${total} 筆`);
  console.log('有外接全欄位：', FULL_DEMO_CASES.map((c) => c.serial).join(', '));
  console.log('未外接：', NO_TRANSFER_DEMO.serial);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
