# NTMS 全站頁面重建規格（UI Rebuild Spec）

> **用途**：之後只要說「依 `docs/NTMS-UI-REBUILD-SPEC.md` 重建全部頁面」，就以本檔為唯一依據。  
> **最後更新**：2026-08-10  
> **權威來源**：
> - 角色定位：`readme.md` → **一、五張畫面的角色定位**（實為 **6 個畫面**）
> - 欄位細節：`外接表單統整0702.docx`（全文抽出：`docs/source-外接表單統整0702.txt`）
> - 分派說明：`readme.md` → 二、畫面分派

若本檔與舊前端（Form 2 / 3-1 / 3-2 命名）衝突，**以本檔＋readme＋docx 為準**。

---

## 0. 怎麼用

1. 先確認本檔第 3、5 節（畫面角色＋欄位）無誤。
2. 對 Cursor：

```text
請嚴格依照 docs/NTMS-UI-REBUILD-SPEC.md 重建前端。
角色定位以第 3 節為準；欄位以第 5 節為準（來自 word）。
先做 Batch A（清單總表 + App Shell），不要改壞 /transfer/ 與 /api 分流。
```

3. 建議批次：A 清單 → B 外接紀錄表 → C 孕產史 → D 醫師單 → E 護理師單 → F 交班單 → G 列印／簽名／帶入連動。

---

## 1. 產品目標（精簡）

長庚 NICU 外接團隊用平板／手機完成：**來電登錄 → 孕產史／系統交班 → 醫師／護理師轉診紀錄 → 返院交班**。  
弱網可草稿＋佇列；語音僅線上。

---

## 2. Word 切張標記（欄位邊界）

| Word 標記 | 約略位置 | 意義 |
|-----------|----------|------|
| `以上是第一張` | 來電區塊之後 | **畫面 2** 結束 |
| `以上是第二張` | 二、(四)抽血及用藥之後 | **畫面 3** 結束 |
| `以上是護理師寫` | 三、(二)生命徵象之後 | 其後 (三)主要處置開頭屬醫師 |
| `以上是醫生寫` | 主要處置「呼吸系統」之後 | 醫師單核心段落結束；其後腸胃等回護理師單 |
| `以上是護理師` | 五、(二)評估表之後 | 五、(三)特殊狀況屬醫師 |

來源檔：`/home/nemo/medical-system/外接表單統整0702.docx`（與 `reference.docx` 相同）。

---

## 3. 六個畫面的角色定位（follow readme 一）

| # | 畫面代號 | 畫面名稱 | 定位 | 欄位來源（docx） |
|---|----------|----------|------|------------------|
| 1 | `S-LIST` | 轉診清單總表 | 預設 50 筆（可選 10/50/100）；可查一年內；點一筆後左側展開該筆所有表單 | 來電日期、來電院所、未外接原因、醫師 24h 回覆等摘要 |
| 2 | `S-REG` | 外接紀錄表 | **接電話後第一張**；從總表點進某筆後首先進入 | 第一張標記之前全部 |
| 3 | `S-HX` | 新生兒疾病暨案母孕產史 | 詳細病患／孕母資料與系統交班前段 | `一、歷程交班` → 至 `以上是第二張`（含二(一)~(四)） |
| 4 | `S-DR` | 轉診紀錄單（醫師） | 醫師填寫；**預覽列印（交班用）**；含評估表＋簽名 | `(三)主要處置` 呼吸系統 → `以上是醫生寫`；另加五(三)特殊狀況＋轉接途中處置自由填；加醫師簽名；評估表見圖／既有表格 |
| 5 | `S-NS` | 轉診紀錄單（護理師） | 護理師填寫；**預覽列印**；頁末隨車／交班護理師簽名 | `(五)其他` → `(三)主要處置` 之前的出勤段；以及主要處置之 **2.腸胃～** 至 **五、(二)**（(三)屬醫師）；現場檢查 **移除 6、7** |
| 6 | `S-HO` | 交班單 | 最終交接狀況 | 五、(四)救護車時間個案交接狀況；**生命徵象必填** |

### 3.1 導覽與互動（清單）

```text
S-LIST（總表）
  └─ 點某一筆轉診紀錄
        ├─ 左側工具欄展開：外接紀錄表 / 孕產史 / 醫師單 / 護理師單 / 交班單
        └─ 預設先開 S-REG（外接紀錄表）
```

- 序號格式：`YYYYMMDD` + `01~99`（例：`2026080701`）
- 未外接原因用**顏色**區分是否有外接（有外接／未外接）
- 每張表單帶入：轉診日期時間、轉診醫院（來電院所）、未外接原因（若有）
- 統計：外接統計項共 21（統計 1~30）、查詢日期範圍一年內（readme）

### 3.2 與舊路由對照（重建時改名）

| 舊 | 新 |
|----|----|
| Dashboard / transfer-list | `S-LIST` |
| Form 2 | `S-REG`（外接紀錄表，欄位大改） |
| （無独立） | `S-HX`（孕產史＋系統交班前段） |
| Form 3-1 | `S-DR`（醫師單，不是舊 3-1 全部） |
| Form 3-2 | `S-NS`（護理師單） |
| （無） | `S-HO`（交班單） |
| transfer-menu | 併入總表左側展開，或保留為個案摘要 |

---

## 4. App Shell（全域）

- 左側：深色工具欄；**選中某筆轉診後展開該筆 5 張表單捷徑**
- 頂欄：搜尋、連線／同步狀態、使用者
- 離線草稿＋outbox、語音僅線上（行為保留）
- 視覺：臨床工具風（深藍＋青綠強調）；見舊版 4.4 token 可沿用

---

## 5. 各畫面欄位規格（來自 word + readme）

下列 `key` 為建議程式欄位名；標籤與選項以 word 原文為準。

---

### 5.1 `S-LIST` 轉診清單總表

#### 查詢／分頁
| 項目 | 規格 |
|------|------|
| 預設筆數 | 50；可選 10 / 50 / 100 |
| 日期範圍 | 一年內可查 |
| 關鍵字 | 院所／序號／醫師等 `[實作時定]` |

#### 列表／卡片顯示欄位
| 欄位 | 來源 | 備註 |
|------|------|------|
| 序號 | 系統產生 | `YYYYMMDD##` |
| 來電日期／時間 | S-REG | 卡片右上可顯時間 |
| 來電院所 | S-REG | |
| 未外接原因 | S-REG | 顏色區分有無外接 |
| 醫師 24 小時回覆 | S-REG | 是／否 |
| 轉診日期時間 | 帶入 | |
| 預入床位 | S-REG | |
| 指定醫師 | S-REG | |
| （可選）呼吸器摘要 | S-HX／S-NS | 總覽帶入 |

點選 → 左側展開該筆表單；主區進 `S-REG`。

---

### 5.2 `S-REG` 外接紀錄表（第一張）

> Word：開頭～`以上是第一張`

| key | 標籤 | 型別 | 必填 | 選項／規則 |
|-----|------|------|------|------------|
| `callDate` | 來電日期 | date（可民國顯示） | ✅ | |
| `callTime` | 來電時間 | time | ✅ | |
| `hospitalName` | 來電院所名稱 | select（下拉） | ✅ | 院所清單待補 |
| `hospitalPhone` | 來電院所電話 | text | | free typing |
| `transferReason` | 轉院原因 | textarea | | free typing；可語音 |
| `registrar` | 登錄者 | text | ✅ | |
| `bedControlDoctor` | 控床醫師 | text | | |
| `assignedDoctor` | 指定醫師 | text | | |
| `noTransferReason` | 未外接原因 | radio | ✅ | `none` 無 / `full` 滿床 / `lt3` 空床數&lt;3 / `self` 自行抱來 |
| `doctorReply24h` | 醫師24小時回覆 | radio | | `yes` / `no`（非必選） |
| `preBedSlots` | 預入床位 | multi-checkbox | ✅ | `3L1`,`5L1`,`3L2`,`5L2`；**最多 2 個** |
| `transferSerial` | 序號 | text(readonly) | 系統 | `YYYYMMDD01~99` |
| `externalTransferAt` | 外接時間 | datetime | 統計用 | 有外接時填 |
| `clientId` | 冪等 ID | hidden | 系統 | UUID |

**送出後帶入他表**：轉診日期時間、轉診醫院、未外接原因、床位、指定醫師。

---

### 5.3 `S-HX` 新生兒疾病暨案母孕產史（第二張）

> Word：`一、歷程交班` → `二、(四)抽血及用藥`（至 `以上是第二張`）  
> 註：`(五)其他` 在標記之後，屬 **S-NS**。

#### （一）孕產史（1–8、11 必填）

| key | 標籤 | 型別 | 必填 | 規則 |
|-----|------|------|------|------|
| `birthDate` | 出生日期 | 民國 date | ✅ | |
| `birthTime` | 出生時間 | time 24h | ✅ | |
| `gaWeeks` | 妊娠週數（週） | number | ✅ | |
| `gaDays` | 又＿天 | number | ✅ | |
| `birthWeightG` | 出生體重（克） | number | ✅ | 通常 3–4 位數 |
| `edc` | 預產期 | 民國 date | ✅ | |
| `apgar1` | Apgar 1' | select 0–10 | ✅ | |
| `apgar5` | Apgar 5' | select 0–10 | ✅ | |
| `apgar10` | Apgar 10' | select 0–10 | 條件 | 若上一級 &lt;7 必填 |
| `apgar15` | Apgar 15' | select 0–10 | 條件 | 同上 |
| `apgar20` | Apgar 20' | select 0–10 | 條件 | 同上；或至出生＞20 分 |
| `G` | G | radio 1–4 / 其他 | ✅ | 其他→下拉 5–10 |
| `P` | P | 同上 | ✅ | |
| `AA` | AA | 同上 | 條件 | G=P 相同可免填 AA/SA |
| `SA` | SA | 同上 | 條件 | 同上 |
| `deliveryMode` | 生產方式 | radio | ✅ | `NSD` / `CS` 二選一 |
| `deliveryAssist` | 輔助 | multi | | `vacuum` 真空吸引 / `forceps` 產鉗 |
| `prom` | 破水時間 | text 或 datetime+hours | | 月日時分 **或** 小時 |
| `amniotic` | 羊水 | radio+opt | | 正常／過多／過少（單選）+ 可加「異味」 |
| `fever` | 發燒 | checkbox | | |
| `cold` | 感冒 | checkbox | | |
| `toccChecked` | TOCC | checkbox | ✅ 必勾 | |
| `toccText` | TOCC 內容 | text | ✅ 必填 | |
| `resuscMeasures` | 生產時狀況與處置 | multi | | 無／給氧／PPV／插管／Bosmin ETT／Bosmin IV-UV／CPR／其他+text |
| `meconium` | 胎便染色 | radio | | 1+～4+ 單選 |

#### （二）產檢

| key | 標籤 | 規則 |
|-----|------|------|
| `noPrenatalCare` | 無產檢 | 勾選後以下免填 |
| `hbsag` | HBsAg | 必填（除非無產檢）：+/-/已驗未知/未驗未知 |
| `hbeag` | HBeAg | 同上 |
| `gbs` | GBS | 同上 |
| `gdm` | GDM | 無／未知／飲食／口服藥／胰島素 |
| `pih` | PIH | 無／未知／飲食／藥物 |
| `hiv` | HIV | 無／未知/+/-；`+` 再填有無治療 |
| `rpr` | RPR | 同 HIV |

#### （三）產前用藥

| key | 標籤 | 規則 |
|-----|------|------|
| `noAnteMeds` | 無用藥 | 勾選後免填 |
| `betamethasone` | betamethasone | 劑量 1–4／其他 5–15 + 使用月日 |
| `dexamethasone` | dexamethasone | 同上 |
| `anteAbx` | 抗生素 | Penicillin G／Ampicillin／Cefazolin／Clindamycin／其他+text + 日期 |
| `mgso4` | MgSO4 | 劑量邏輯同 steroid + 日期 |

#### （四）過去病史

| key | 標籤 | 規則 |
|-----|------|------|
| `noPastHx` | 無 | 勾選免填 |
| `pastHx` | 病史 | multi：SLE／甲亢／甲低／地中海貧血／G6PD／DM／HTN／其他+text |
| `pastHxMeds` | 用藥 | 有勾任一項可填 |

#### 二、個案系統性交班（至第二張結束）

**(一) 呼吸系統** — 結構見共用元件 `RespiratoryBlock`（§6.1）  
**(二) 腸胃系統** — `GIBlock`（§6.2）  
**(三) 靜脈輸注**

| key | 標籤 | 規則 |
|-----|------|------|
| `ivPumpCount` | 需要＿台 IV pump | select 0–5；必填 |
| `ivFluidType` | 輸液種類 | 若 pump≥1 必填 |
| `ivRateMlHr` | 速率 ml/hr | 若 pump≥1 必填 |

**(四) 抽血及用藥** — `LabsMedsBlock`（§6.3）

> 呼吸／腸胃／抽血可**自動帶入**出勤單（S-DR／S-NS），帶入後可改；是否回寫 S-HX：依 word「不需同步」者單向帶入。

---

### 5.4 `S-DR` 轉診紀錄單（醫師）

> 定位：醫師填；要有**預覽列印（交班用）**、**轉接過程患嬰狀況評估表**、**醫師簽名**。

#### 納入區塊
1. **三、(三) 主要處置 → 1.呼吸系統**（至 `以上是醫生寫`）  
   - 使用 `RespiratoryBlock`（可由 S-HX 帶入，可改，**不回寫** S-HX）
2. **五、(三) 其他特殊狀況**（`以上是護理師` 之後屬醫師）
3. **轉接途中之處置**：整塊 **自由填寫 textbox**（readme 明確要求）
4. **轉接過程患嬰狀況評估表格**（程式依現有表格／圖設置；含返院相關時間欄位）
5. **醫師簽名欄**

#### 五、(三) 其他特殊狀況

| key | 標籤 | 規則 |
|-----|------|------|
| `specialNone` | 無 | 勾選則以下免填 |
| `specialEvents` | 事件 | multi：呼吸管路滑脫／靜脈導管滑脫／轉送中非預期插管／非預期 CPCR／嚴重藥物副作用／氣體供應失效／儀器故障／人員受傷／救護車車禍 |
| `enRouteManagement` | 轉接途中之處置 | textarea 自由填寫 |

#### 簽名／列印
| key | 說明 |
|-----|------|
| `doctorSignature` | 醫師簽名（手寫板或姓名簽章 `[實作選型]`） |
| `printPreview` | 交班用預覽列印 |

---

### 5.5 `S-NS` 轉診紀錄單（護理師）

> 定位：護理師填；預覽列印；頁末 **隨車護理師／交班護理師** 簽名。  
> **移除**現場檢查第 6、7 項（外接護士醫師申請表、外接車派車單）。

#### 納入區塊（依 readme）
1. **二、(五) 其他**（自由填寫）— 在 `以上是第二張` 之後  
2. **三、外接出勤現況**
   - (一) 救護車時間  
   - (二) 抵達後生命徵象  
   - （跳過醫師的 (三)1 呼吸）  
   - (三) 主要處置之 **2.腸胃、3.抽血及用藥、4.外觀、5.其他**  
   - (四) 護理師現場交班檢查 **1–5**（無 6、7）  
3. **五、上救護車返院**
   - (一) 外接車溫度設定  
   - (二) 轉接過程個案狀況評估（與醫師單協調：護理可填時間／共同表；醫師看特殊狀況）  
   - **不含** (三)（醫師）  
   - **不含** (四)（屬交班單 S-HO）

#### 三、(一) 救護車時間
| key | 標籤 |
|-----|------|
| `departDate` | 出車日期 |
| `departTime` | 出車時間 |
| `arriveOutsideTime` | 到達外院時間 |

可自動帶入、可改。

#### 三、(二) 抵達後生命徵象
| key | 標籤 | 規則 |
|-----|------|------|
| `arriveBtType` | 體溫種類 | 肛溫／腋溫 |
| `arriveBt` | BT ℃ | number |
| `arriveHr` | HR 次/分 | |
| `arriveRr` | RR 次/分 | |
| `arriveSpo2` | SpO2 % | |
| `arriveBp` | BP mmHg | 允許 `/` |

#### 主要處置 2～5（護理）
- 2 腸胃：`GIBlock`（由 S-HX 帶入可改）
- 3 抽血及用藥：`LabsMedsBlock`＋抽血多一個「外院附文件」
- 4 外觀：見 §6.4 `AppearanceBlock`
- 5 其他：textarea

#### (四) 現場交班檢查（1–5 必填；**無 6、7**）
| key | 標籤 | 規則 |
|-----|------|------|
| `momIdNo` | 母親身分證字號 | |
| `momBirthday` | 母親生日（民國） | |
| `chkReferralForm` | 轉診單 | checkbox |
| `chkConsent` | 轉運同意書(一式兩聯) | |
| `chkChildBook` | 健兒手冊 | |
| `hbvStatus` | HBV | 未完成／已完成／已蓋章 |
| `hbigStatus` | HBIG | 不需要施打／已完成／已蓋章 |
| `nbsStatus` | 新生兒篩檢 | 未完成／已完成／已蓋章 |
| `hearingStatus` | 聽力篩檢 | 未完成／已完成／已蓋章 |
| `chkAmbulanceReceipt` | 救護車收款證明單(粉紅單) | |

#### 五、(一) 外接車溫度
| key | 規則 |
|-----|------|
| `skinSensorTemp` | 皮膚感應溫度 ℃；&lt;36.5 提醒「保溫箱溫度設定 +0.5℃」 |
| `therapeuticHypothermia` | 啟動低溫治療 → 提醒「體溫控制 34–36℃，勿關閉保溫箱」 |
| （說明） | 出車預設保溫箱 35℃；低溫治療 32℃ |

#### 簽名／列印
| key | 說明 |
|-----|------|
| `escortNurseSignature` | 隨車護理師簽名 |
| `handoverNurseSignature` | 交班護理師簽名 |
| `printPreview` | 交班用預覽列印 |

#### 基本資料帶入（readme 與 3-2 共用段）
可由 S-HX 帶入顯示（唯讀或可編）：G/P/AA/SA、生產方式、BBW、GA、EDC、出生日期時間、Apgar、外觀、轉送原因、外接目的地／電話、父母 TOCC 等。  
`[實作]` 建議單一資料源在 S-HX，S-NS 開頭摘要列。

---

### 5.6 `S-HO` 交班單

> Word：五、(四) 救護車時間個案交接狀況  
> **生命徵象一定要填**（readme）

| key | 標籤 | 必填 | 規則 |
|-----|------|------|------|
| `returnDepartAt` | 返院出發時間 | ✅ | 年月日＋時分；可自動帶入可改 |
| `returnArriveWardAt` | 返院回到長庚病房時間 | ✅ | 時分 |
| `admitBtType` | 入院後 BT 種類 | ✅ | 肛溫／腋溫 |
| `admitBt` | BT ℃ | ✅ | |
| `admitHr` | HR | ✅ | |
| `admitRr` | RR | ✅ | |
| `admitSpo2` | SpO2 | ✅ | |
| `admitBp` | BP | ✅ | 允許 `/` |

---

## 6. 共用區塊元件（多表複用）

### 6.1 `RespiratoryBlock` 呼吸系統

| 項目 | 規則 |
|------|------|
| `noRespProblem` | 勾選 → 自動 ROOM AIR，其餘免填 |
| 症狀 multi | 血氧不穩／胸肋凹／鼻翼搧動／呼吸陣喘／呻吟聲；有勾須完成至少一種氧療設定 |
| `o2HoodLpm` | O2 hood L/min |
| `o2CannulaLpm` | O2 cannula L/min |
| `ncpap` | FiO2 % + PEEP |
| `nimv` | Rate + FiO2 + PIP + PEEP |
| `imv` | Rate + FiO2 + PIP + PEEP；選 IMV → 氣管內管號 2.0–4.0 單選 + 固定公分 |
| `respNote` | 備註 free text |

連動：選需進階呼吸支持時，腸胃 `GIBlock` **自動帶出胃管**。

### 6.2 `GIBlock` 腸胃系統

| 項目 | 規則 |
|------|------|
| `npo` | 勾選 → 免填餵食；血糖／胃管仍要 |
| `feedMl` / `feedEveryHr` | 每餐 ml、每＿小時 |
| `glucose` | 無測量／有數值+處置 |
| `ogTube` | 5/6/8 號 + 黑點前公分；呼吸進階時自動帶出 |
| `giNote` | 備註 |

### 6.3 `LabsMedsBlock` 抽血及用藥

| 項目 | 規則 |
|------|------|
| `labs` | 有／無（S-NS 主處置另加「外院附文件」）+ 數值 text |
| `vitK` | 已給／未給 |
| `eyeDrop` | 已給／未給 |
| `antibiotics` | multi：Ampicillin／Gentamycin／Metronidazole／Fortum／claforan／vancomycin／Amikacin／其他+text |
| `otherDrugs` | 有／無 + 種類 |

### 6.4 `AppearanceBlock` 外觀

| 項目 | 規則 |
|------|------|
| `noAbnormal` | 勾選免填 |
| 異常 multi | 頭血腫／產瘤／尿道下裂／無肛／唇裂／顎裂 |
| `mongolianSpot` | 部位：臀部／背部 |
| `blueSpot` | 左／右手背、手、腳、臉、頭皮 |
| `redMark` | 同上＋前胸／後背／腹股溝 |
| `appearanceOther` | 其他 text |

---

## 7. 資料帶入／單向同步規則

| 從 → 到 | 內容 | 回寫？ |
|---------|------|--------|
| S-REG → 各表 | 轉診日期時間、院所、未外接原因、床位、指定醫師 | — |
| S-HX 呼吸 → S-DR 呼吸 | 帶入可改 | 否 |
| S-HX 腸胃／抽血 → S-NS | 帶入可改 | 否 |
| S-HX 孕產史 → S-NS 摘要 | 共用欄位 | 建議單一資料源 |
| S-HX／S-NS 呼吸 → S-LIST 摘要 | 呼吸器 | 顯示用 |

---

## 8. API 建議（重建時）

| Method | Path | 畫面 |
|--------|------|------|
| `GET` | `/api/transfers?limit=&from=&to=&q=` | S-LIST |
| `POST/PATCH` | `/api/transfers` / `/api/transfers/:id` | S-REG |
| `PUT` | `/api/transfers/:id/history` | S-HX |
| `PUT` | `/api/transfers/:id/doctor-record` | S-DR |
| `PUT` | `/api/transfers/:id/nurse-record` | S-NS |
| `PUT` | `/api/transfers/:id/handover` | S-HO |
| `POST` | `/api/speech-to-text` | 沿用（轉院原因等） |

皆帶 `clientId`；離線 outbox endpoint 對應上表。

---

## 9. 驗收清單（對齊角色）

- [ ] 總表預設 50 筆、可改 10/50/100、一年內查詢
- [ ] 點一筆後左側展開 5 張表單，預設進外接紀錄表
- [ ] 序號 `YYYYMMDD##`；未外接顏色區分
- [ ] S-REG 欄位與必填／床位最多 2 項符合 word
- [ ] S-HX 含一(一)~(四)＋二(一)~(四)；Apgar／G-P-AA-SA 連動正確
- [ ] S-DR：呼吸主要處置＋特殊狀況＋途中處置自由填＋評估表＋醫師簽名＋預覽列印
- [ ] S-NS：出勤時間／生命徵象／腸胃／抽血／外觀／檢查 1–5（無 6、7）＋五(一)(二)＋雙護理簽名＋預覽列印
- [ ] S-HO：返院時間＋入院生命徵象**必填**
- [ ] 共用區塊與帶入規則正確
- [ ] 正式 `~/start_medical.sh prod` 可開、PWA／草稿仍可用

---

## 10. 產品決策（仍可改）

| # | 決策 | 預設 |
|---|------|------|
| D1 | 院所下拉清單來源 | 先本地常數，後改 API |
| D2 | 簽名實作 | Canvas 手寫 → 存圖 |
| D3 | 評估表欄位細目 | 依紙本／圖補一節附錄後實作 |
| D4 | 民國／西元輸入 | UI 顯示民國，存 ISO |
| D5 | IAP 是否獨立欄 | word 產檢段未單列；若臨床要再加 |
| D6 | 舊 Form2 API | 遷移為 S-REG，保留相容或新 endpoint |

---

## 11. 附錄：來源檔

| 檔案 | 用途 |
|------|------|
| `readme.md` | 角色定位、分派、總覽欄位 |
| `外接表單統整0702.docx` | 欄位原文 |
| `docs/source-外接表單統整0702.txt` | docx 純文字抽出 |
| `docs/NTMS-UI-REBUILD-SPEC.md` | 本重建規格（本檔） |

---

**下一步**：確認本檔第 3、5 節後，跟我說要從 Batch A（清單總表）開始重建即可。
