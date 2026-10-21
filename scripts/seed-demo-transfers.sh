#!/usr/bin/env bash
# 建立 5 筆示範轉診紀錄 → CC_DB.transfers
cd "$(dirname "$0")/../backend"
exec node seed-demo-transfers.js
