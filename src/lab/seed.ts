// 演示台账：下午连续复评的起点数据。
// 时间全部相对当前时刻生成，以便同时演示「校准有效 / 过期 / 读数越限」。
import { buildReading, checkCalibration, combineVerdict, specFingerprint } from "./decide";
import type {
  AppState,
  AssessmentSession,
  BatchState,
  Calibration,
  LightBox,
} from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const BOXES: LightBox[] = [
  {
    id: "box-d65",
    code: "D65",
    name: "D65 日光",
    tile: { L: 96.5, a: -0.4, b: 1.2 },
    tileTolerance: 0.5,
  },
  {
    id: "box-tl84",
    code: "TL84",
    name: "TL84 商场光",
    tile: { L: 96.5, a: -0.4, b: 1.2 },
    tileTolerance: 0.5,
  },
  {
    id: "box-cwf",
    code: "CWF",
    name: "CWF 冷白荧光",
    tile: { L: 96.5, a: -0.4, b: 1.2 },
    tileTolerance: 0.5,
  },
  {
    id: "box-a",
    code: "A",
    name: "A 白炽灯",
    tile: { L: 96.5, a: -0.4, b: 1.2 },
    tileTolerance: 0.5,
  },
];

type Calibrations = Calibration[];

function buildCalibrations(now: number): Calibrations {
  return [
    // D65：有效，读数合格
    {
      boxId: "box-d65",
      calibratedAt: now - 2 * DAY,
      validFor: 7 * DAY,
      reading: { L: 96.4, a: -0.3, b: 1.4 },
    },
    // TL84：已过期 3 天
    {
      boxId: "box-tl84",
      calibratedAt: now - 10 * DAY,
      validFor: 7 * DAY,
      reading: { L: 96.4, a: -0.3, b: 1.3 },
    },
    // CWF：在有效期内但白板读数越限
    {
      boxId: "box-cwf",
      calibratedAt: now - 1 * DAY,
      validFor: 7 * DAY,
      reading: { L: 95.6, a: -0.2, b: 2.6 },
    },
    // A：有效
    {
      boxId: "box-a",
      calibratedAt: now - 3 * DAY,
      validFor: 7 * DAY,
      reading: { L: 96.5, a: -0.3, b: 1.3 },
    },
  ];
}

export function seedState(): AppState {
  const now = Date.now();
  const calibrations = buildCalibrations(now);

  // —— 620A：D65 双人双通过 ——
  const b620: BatchState = {
    id: "LAB-620A",
    fabric: "100%棉 府绸",
    weight: 120,
    recipe: "活性红3BS 1.2% / 活性黄3RS 0.4% / 活性藏青KN-B 0.15%",
    liquorRatio: "1:10",
    temperatureCurve: "60℃×40min，升温 1.5℃/min",
    holdTime: "40min",
    finishing: "定型 150℃×45s",
    target: { L: 62.4, a: 2.1, b: -24.6 },
    orderId: "SO-2409 华纺",
    createdAt: now - 3 * DAY,
    specVersion: 1,
    specHistory: [
      {
        version: 1,
        at: now - 3 * DAY,
        reason: "小样初版",
        weight: 120,
        recipe: "活性红3BS 1.2% / 活性黄3RS 0.4% / 活性藏青KN-B 0.15%",
        finishing: "定型 150℃×45s",
        fingerprint: "",
      },
    ],
    sessions: [],
  };
  b620.specHistory[0].fingerprint = specFingerprint(b620);
  b620.sessions.push(
    makeSession(
      b620,
      calibrations,
      "box-d65",
      now - 5 * HOUR,
      calibrations[0].reading,
      21.1,
      57,
      { L: 62.9, a: 2.4, b: -24.9 },
      { L: 61.8, a: 1.7, b: -25.1 }
    )
  );

  // —— 621C：A 光源下一过一不过，进入仲裁（两份原始记录保留，未仲裁） ——
  const b621: BatchState = {
    id: "LAB-621C",
    fabric: "100%涤纶 针织",
    weight: 160,
    recipe: "分散蓝2BLN 1.8% / 分散红玉S-5BL 0.3%",
    liquorRatio: "1:12",
    temperatureCurve: "130℃高温高压，升温 2℃/min",
    holdTime: "30min",
    finishing: "亲水剂 30g/L 浸轧",
    target: { L: 28.6, a: 1.8, b: -32.4 },
    orderId: "SO-2411 恒逸",
    createdAt: now - 2 * DAY,
    specVersion: 1,
    specHistory: [
      {
        version: 1,
        at: now - 2 * DAY,
        reason: "小样初版",
        weight: 160,
        recipe: "分散蓝2BLN 1.8% / 分散红玉S-5BL 0.3%",
        finishing: "亲水剂 30g/L 浸轧",
        fingerprint: "",
      },
    ],
    sessions: [],
  };
  b621.specHistory[0].fingerprint = specFingerprint(b621);
  b621.sessions.push(
    makeSession(
      b621,
      calibrations,
      "box-a",
      now - 3 * HOUR,
      calibrations[3].reading,
      21.4,
      59,
      { L: 28.1, a: 2.1, b: -31.8 },
      { L: 27.4, a: 2.9, b: -30.9 }
    )
  );

  // —— 624B：D65 曾通过，后整理由柔软剂1.5%改为2.0%，旧评色失效待重判 ——
  const b624: BatchState = {
    id: "LAB-624B",
    fabric: "棉/涤 65/35 斜纹",
    weight: 205,
    recipe: "还原蓝RSN 2.1% / 分散黄棕S-2RFL 0.5%",
    liquorRatio: "1:10",
    temperatureCurve: "轧染，预烘80℃ → 焙烘160℃×3min",
    holdTime: "3min",
    finishing: "柔软剂 2.0%（1:20 浸轧）",
    target: { L: 55.2, a: -0.8, b: -2.6 },
    orderId: "SO-2398 鼎天",
    createdAt: now - 4 * DAY,
    specVersion: 2,
    specHistory: [
      {
        version: 1,
        at: now - 4 * DAY,
        reason: "小样初版",
        weight: 205,
        recipe: "还原蓝RSN 2.1% / 分散黄棕S-2RFL 0.5%",
        finishing: "柔软剂 1.5%（1:20 浸轧）",
        fingerprint: "",
      },
      {
        version: 2,
        at: now - 1 * DAY,
        reason: "客户手感意见，柔软剂 1.5% → 2.0%",
        weight: 205,
        recipe: "还原蓝RSN 2.1% / 分散黄棕S-2RFL 0.5%",
        finishing: "柔软剂 2.0%（1:20 浸轧）",
        fingerprint: "",
      },
    ],
    sessions: [],
  };
  b624.specHistory[0].fingerprint = specFingerprint({
    weight: b624.specHistory[0].weight,
    recipe: b624.specHistory[0].recipe,
    finishing: b624.specHistory[0].finishing,
  });
  b624.specHistory[1].fingerprint = specFingerprint(b624);
  const s624 = makeSession(
    b624,
    calibrations,
    "box-d65",
    now - 2 * DAY,
    calibrations[0].reading,
    20.9,
    56,
    { L: 54.7, a: -0.5, b: -2.2 },
    { L: 55.6, a: -1.1, b: -2.9 },
    b624.specHistory[0].fingerprint // 该评色发生在 v1 参数下
  );
  // 次日修改后整理，旧会话失效（记录保留）
  s624.superseded = true;
  s624.supersededAt = now - 1 * DAY;
  b624.sessions.push(s624);

  // —— 626F：TL84 校准过期，登记只能留待校色 ——
  const b626: BatchState = {
    id: "LAB-626F",
    fabric: "100%锦纶 塔夫绸",
    weight: 72,
    recipe: "酸性大红RS 1.1% / 酸性黄N-3R 0.25%",
    liquorRatio: "1:15",
    temperatureCurve: "98℃煮沸，升温 1℃/min",
    holdTime: "35min",
    finishing: "防水整理（氟系 40g/L）",
    target: { L: 36.8, a: 44.2, b: 18.6 },
    orderId: "SO-2420 荣晟",
    createdAt: now - 1 * DAY,
    specVersion: 1,
    specHistory: [
      {
        version: 1,
        at: now - 1 * DAY,
        reason: "小样初版",
        weight: 72,
        recipe: "酸性大红RS 1.1% / 酸性黄N-3R 0.25%",
        finishing: "防水整理（氟系 40g/L）",
        fingerprint: "",
      },
    ],
    sessions: [],
  };
  b626.specHistory[0].fingerprint = specFingerprint(b626);
  b626.sessions.push(
    makeSession(
      b626,
      calibrations,
      "box-tl84",
      now - 2 * HOUR,
      { L: 96.4, a: -0.3, b: 1.3 },
      21.6,
      60,
      { L: 36.3, a: 44.8, b: 19.1 },
      { L: 37.2, a: 43.7, b: 18.2 }
    )
  );

  // —— 628K：新到样，尚未评色 ——
  const b628: BatchState = {
    id: "LAB-628K",
    fabric: "棉/氨 95/5 弹力布",
    weight: 185,
    recipe: "活性翠蓝KN-G 2.4%",
    liquorRatio: "1:8",
    temperatureCurve: "60℃浸染，升温 1℃/min",
    holdTime: "45min",
    finishing: "预缩 + 碳素磨毛",
    target: { L: 48.5, a: -28.0, b: -12.0 },
    orderId: "SO-2409 华纺",
    createdAt: now - 2 * HOUR,
    specVersion: 1,
    specHistory: [
      {
        version: 1,
        at: now - 2 * HOUR,
        reason: "小样初版",
        weight: 185,
        recipe: "活性翠蓝KN-G 2.4%",
        finishing: "预缩 + 碳素磨毛",
        fingerprint: "",
      },
    ],
    sessions: [],
  };
  b628.specHistory[0].fingerprint = specFingerprint(b628);

  return {
    boxes: BOXES,
    calibrations,
    batches: [b620, b621, b624, b626, b628],
  };
}

function makeSession(
  batch: BatchState,
  calibrations: Calibrations,
  boxId: string,
  at: number,
  tileReading: AssessmentSession["tileReading"],
  temperature: number,
  humidity: number,
  lab1: AssessmentSession["assessors"][number]["lab"],
  lab2: AssessmentSession["assessors"][number]["lab"],
  fingerprintOverride?: string
): AssessmentSession {
  const box = BOXES.find((b) => b.id === boxId)!;
  const readings = [
    buildReading("评色员甲", lab1, batch.target),
    buildReading("评色员乙", lab2, batch.target),
  ] as AssessmentSession["assessors"];
  const calib = calibrations.find((c) => c.boxId === boxId);
  const check = checkCalibration(box, calib, tileReading, at);
  return {
    id: `seed-${batch.id}-${boxId}`,
    batchId: batch.id,
    boxId,
    at,
    tileReading,
    temperature,
    humidity,
    calibration: check,
    assessors: readings,
    verdict: combineVerdict(check, readings),
    specFingerprint: fingerprintOverride ?? specFingerprint(batch),
    superseded: false,
    arbitration: null,
  };
}
