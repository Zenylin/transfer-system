/**
 * 表單數值欄位上下限與間隔（不可為負）。
 * min / max / step 直接綁到 <input type="number">。
 */
export type NumLimit = { min: number; max: number; step: number };

export const NUM = {
  // 體重／週數
  birthWeightG: { min: 0, max: 6000, step: 1 },
  gaWeeks: { min: 0, max: 45, step: 1 },
  gaDays: { min: 0, max: 6, step: 1 },
  gpOther: { min: 5, max: 10, step: 1 },

  // 呼吸處置（新生兒外接規格）
  o2HoodLpm: { min: 35, max: 60, step: 5 },
  o2CannulaLpm: { min: 1, max: 10, step: 1 },
  ncpapFio2: { min: 21, max: 60, step: 1 },
  ncpapPeep: { min: 5, max: 10, step: 1 },
  nimvRate: { min: 20, max: 50, step: 1 },
  nimvFio2: { min: 21, max: 60, step: 1 },
  imvRate: { min: 20, max: 50, step: 1 },
  imvFio2: { min: 21, max: 100, step: 1 },
  /** 通用 FiO2（舊欄位相容） */
  fio2: { min: 21, max: 100, step: 1 },
  peep: { min: 5, max: 10, step: 1 },
  ettFixCm: { min: 0, max: 15, step: 0.5 },

  // 腸胃／輸液
  feedMl: { min: 1, max: 300, step: 1 },
  feedEveryHr: { min: 1, max: 8, step: 1 },
  ogCm: { min: 1, max: 8, step: 1 },
  ivRateMlHr: { min: 0, max: 30, step: 0.1 },
  /** 血糖 mg/dL */
  glucose: { min: 0, max: 500, step: 1 },

  // 生命徵象（通用）
  bt: { min: 30, max: 42, step: 0.1 },
  hr: { min: 0, max: 250, step: 1 },
  rr: { min: 0, max: 120, step: 1 },
  spo2: { min: 0, max: 100, step: 1 },
  skinTemp: { min: 32, max: 42, step: 0.1 },
  ambulancePeople: { min: 0, max: 20, step: 1 },

  // 護理紀錄：抵達後生命徵象
  arriveBt: { min: 32, max: 42, step: 0.1 },
  arriveHr: { min: 30, max: 200, step: 1 },
  arriveRr: { min: 10, max: 70, step: 1 },
  arriveSpo2: { min: 60, max: 100, step: 1 },
} as const satisfies Record<string, NumLimit>;
