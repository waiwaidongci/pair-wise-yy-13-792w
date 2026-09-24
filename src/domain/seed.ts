import { DE_LIMIT } from "./color";
import { adjudicate, checkGates, resolveArbitration } from "./rules";
import type {
  AppState,
  Batch,
  CalibrationConfig,
  EnvReading,
  EvalSession,
  Lab,
} from "./types";

/** 固定“今天”为 2026-09-24 下午，保证演示数据的校准期限稳定 */
const NOW = new Date(2026, 8, 24, 14, 30);
const at = (dayOffset: number, hour = 14, minute = 30) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const EVALUATORS = [
  { id: "E01", name: "王敏" },
  { id: "E02", name: "李建国" },
];

export const ARBITRATOR = { id: "S01", name: "周工（质量主管）" };

export const LIGHT_BOXES: Record<string, { name: string }> = {
  D65: { name: "D65 人造日光" },
  TL84: { name: "TL84 商店光" },
  CWF: { name: "CWF 冷白荧光" },
  A: { name: "A 光源（钨丝灯）" },
  UV: { name: "UV 紫外" },
};

const WHITE: Lab = { L: 95.2, a: -0.4, b: 1.8 };

/** D65/A 校准有效但 A 白度板读数越限；TL84 校准过期 → 只能挂待校色 */
export const CALIBRATIONS: CalibrationConfig[] = [
  {
    boxId: "D65",
    name: LIGHT_BOXES.D65.name,
    nominal: WHITE,
    measured: { L: 95.15, a: -0.36, b: 1.86 },
    lastCalibratedAt: at(-12),
    validDays: 30,
    tileToleranceDE: 0.4,
  },
  {
    boxId: "TL84",
    name: LIGHT_BOXES.TL84.name,
    nominal: WHITE,
    measured: { L: 95.1, a: -0.35, b: 1.9 },
    lastCalibratedAt: at(-40),
    validDays: 30,
    tileToleranceDE: 0.4,
  },
  {
    boxId: "CWF",
    name: LIGHT_BOXES.CWF.name,
    nominal: WHITE,
    measured: { L: 95.05, a: -0.3, b: 1.95 },
    lastCalibratedAt: at(-8),
    validDays: 30,
    tileToleranceDE: 0.5,
  },
  {
    boxId: "A",
    name: LIGHT_BOXES.A.name,
    nominal: WHITE,
    measured: { L: 94.5, a: 0.1, b: 2.6 },
    lastCalibratedAt: at(-6),
    validDays: 30,
    tileToleranceDE: 0.4,
  },
  {
    boxId: "UV",
    name: LIGHT_BOXES.UV.name,
    nominal: WHITE,
    measured: { L: 95.18, a: -0.38, b: 1.84 },
    lastCalibratedAt: at(-3),
    validDays: 15,
    tileToleranceDE: 0.5,
  },
];

const offsetLab = (base: Lab, dL: number, da: number, db: number): Lab => ({
  L: Math.round((base.L + dL) * 100) / 100,
  a: Math.round((base.a + da) * 100) / 100,
  b: Math.round((base.b + db) * 100) / 100,
});

interface ReadingSpec {
  lab: Lab;
  measuredAt: string;
}

interface SessionSpec {
  id: string;
  batchId: string;
  revision: number;
  boxId: EvalSession["boxId"];
  env: EnvReading;
  readingA: ReadingSpec;
  readingB: ReadingSpec;
  createdAt: string;
  arbitrator?: { lab: Lab; arbitratedAt: string };
}

function buildSession(spec: SessionSpec, batches: Batch[]): EvalSession {
  const batch = batches.find((b) => b.id === spec.batchId)!;
  const calibration = CALIBRATIONS.find((c) => c.boxId === spec.boxId)!;
  const make = (evaluator: { id: string; name: string }, rs: ReadingSpec) => {
    const dL = rs.lab.L - batch.standard.L;
    const da = rs.lab.a - batch.standard.a;
    const db = rs.lab.b - batch.standard.b;
    const de = Math.round(Math.sqrt(dL * dL + da * da + db * db) * 1000) / 1000;
    return {
      evaluatorId: evaluator.id,
      evaluatorName: evaluator.name,
      lab: rs.lab,
      de,
      verdict: de <= DE_LIMIT ? ("pass" as const) : ("fail" as const),
      measuredAt: rs.measuredAt,
    };
  };
  const readings = [
    make(EVALUATORS[0], spec.readingA),
    make(EVALUATORS[1], spec.readingB),
  ] as EvalSession["readings"];

  // 与领域层同口径推导状态（门控 → 双人结果）
  const gates = checkGates(calibration, spec.env, NOW);
  const { status, reasons } = adjudicate(gates, readings);
  const session: EvalSession = {
    id: spec.id,
    batchId: spec.batchId,
    revision: spec.revision,
    boxId: spec.boxId,
    env: spec.env,
    calibration: {
      boxId: calibration.boxId,
      nominal: calibration.nominal,
      measured: calibration.measured,
      lastCalibratedAt: calibration.lastCalibratedAt,
      validDays: calibration.validDays,
      tileToleranceDE: calibration.tileToleranceDE,
    },
    readings,
    status,
    reasons,
    createdAt: spec.createdAt,
  };
  if (spec.arbitrator) {
    const r = resolveArbitration(batch.standard, spec.arbitrator.lab);
    session.arbitrator = {
      evaluatorId: ARBITRATOR.id,
      evaluatorName: ARBITRATOR.name,
      lab: spec.arbitrator.lab,
      de: r.de,
      verdict: r.verdict,
      finalStatus: r.finalStatus,
      arbitratedAt: spec.arbitrator.arbitratedAt,
    };
  }
  return session;
}

export function createSeedState(): AppState {
  const created = at(-10, 9, 15);
  const revised = at(-1, 16, 40);

  const batches: Batch[] = [
    {
      id: "LAB-620A",
      fabric: "棉府绸 120g",
      composition: "棉",
      gsm: 120,
      recipe: [
        { dye: "活性红3BS", percent: 1.8 },
        { dye: "活性黄3RS", percent: 0.6 },
      ],
      liquorRatio: "1:10",
      curve: "60℃×40min，升温 1.5℃/min",
      holdMinutes: 40,
      finish: "预缩",
      standard: { L: 62.4, a: 28.1, b: 12.6 },
      orderId: "PO-2609-01",
      revision: 1,
      revisedAt: created,
      createdAt: created,
      revisions: [{ version: 1, changedAt: created, reason: "初版打样", changes: [], snapshot: { gsm: 120, finish: "预缩", recipe: [] } }],
    },
    {
      id: "LAB-621C",
      fabric: "涤纶针织",
      composition: "涤纶",
      gsm: 160,
      recipe: [
        { dye: "分散红玉S-5BL", percent: 2.4 },
        { dye: "分散橙SE-RFL", percent: 0.9 },
      ],
      liquorRatio: "1:12",
      curve: "130℃×35min，升温 2℃/min",
      holdMinutes: 35,
      finish: "定型 170℃",
      standard: { L: 48.9, a: 34.2, b: 6.4 },
      orderId: "PO-2609-02",
      revision: 1,
      revisedAt: created,
      createdAt: created,
      revisions: [{ version: 1, changedAt: created, reason: "初版打样", changes: [], snapshot: { gsm: 160, finish: "定型 170℃", recipe: [] } }],
    },
    {
      id: "LAB-624B",
      fabric: "混纺斜纹",
      composition: "混纺",
      gsm: 240,
      recipe: [
        { dye: "分散蓝2BLN", percent: 1.6 },
        { dye: "活性藏青", percent: 2.1 },
      ],
      liquorRatio: "1:10",
      curve: "两浴法，130℃→60℃",
      holdMinutes: 50,
      finish: "柔软剂 2%",
      standard: { L: 36.8, a: -2.4, b: -18.9 },
      orderId: "PO-2609-03",
      revision: 1,
      revisedAt: created,
      createdAt: created,
      revisions: [{ version: 1, changedAt: created, reason: "初版打样", changes: [], snapshot: { gsm: 240, finish: "柔软剂 2%", recipe: [] } }],
    },
    {
      id: "LAB-628E",
      fabric: "锦纶塔丝隆",
      composition: "锦纶",
      gsm: 95,
      recipe: [
        { dye: "酸性红GRS", percent: 1.2 },
        { dye: "酸性黄N-GW", percent: 0.4 },
      ],
      liquorRatio: "1:15",
      curve: "98℃×45min，升温 1℃/min",
      holdMinutes: 45,
      finish: "防水 PA 涂层",
      standard: { L: 55.6, a: 30.8, b: 15.2 },
      orderId: undefined,
      revision: 1,
      revisedAt: created,
      createdAt: created,
      revisions: [{ version: 1, changedAt: created, reason: "初版打样", changes: [], snapshot: { gsm: 95, finish: "防水 PA 涂层", recipe: [] } }],
    },
    {
      id: "LAB-630F",
      fabric: "棉弹力斜纹",
      composition: "棉",
      gsm: 270,
      recipe: [
        { dye: "活性藏青GG", percent: 3.2 },
        { dye: "活性黑WNN", percent: 0.8 },
      ],
      liquorRatio: "1:10",
      curve: "60℃×50min，升温 1.5℃/min",
      holdMinutes: 50,
      finish: "液氨+免烫",
      standard: { L: 31.5, a: -1.8, b: -12.4 },
      orderId: "PO-2609-04",
      revision: 2,
      revisedAt: revised,
      createdAt: created,
      revisions: [
        {
          version: 2,
          changedAt: revised,
          reason: "客供手感样，加深克重并加强免烫",
          changes: [
            { field: "gsm", label: "克重", from: "260 g/㎡", to: "270 g/㎡" },
            { field: "finish", label: "后整理", from: "免烫", to: "液氨+免烫" },
          ],
          snapshot: { gsm: 270, finish: "液氨+免烫", recipe: [] },
        },
        { version: 1, changedAt: created, reason: "初版打样", changes: [], snapshot: { gsm: 260, finish: "免烫", recipe: [] } },
      ],
    },
  ];

  const std = (id: string) => batches.find((b) => b.id === id)!.standard;
  const envOkay: EnvReading = { tempC: 22, humidityPct: 58, recordedAt: at(-2, 15, 10) };
  const envHumid: EnvReading = { tempC: 25, humidityPct: 81, recordedAt: at(-2, 10, 5) };

  const specs: SessionSpec[] = [
    // 620A：D65 双员均合格 → 通过
    {
      id: "SE-0001",
      batchId: "LAB-620A",
      revision: 1,
      boxId: "D65",
      env: { ...envOkay, recordedAt: at(-2, 15, 12) },
      readingA: { lab: offsetLab(std("LAB-620A"), 0.25, 0.35, -0.2), measuredAt: at(-2, 15, 25) },
      readingB: { lab: offsetLab(std("LAB-620A"), -0.15, 0.45, 0.3), measuredAt: at(-2, 15, 31) },
      createdAt: at(-2, 15, 35),
    },
    // 621C：双员都超限 → 不通过
    {
      id: "SE-0002",
      batchId: "LAB-621C",
      revision: 1,
      boxId: "D65",
      env: { ...envOkay, recordedAt: at(-2, 16, 2) },
      readingA: { lab: offsetLab(std("LAB-621C"), -0.8, 0.6, 0.35), measuredAt: at(-2, 16, 14) },
      readingB: { lab: offsetLab(std("LAB-621C"), -0.55, 0.72, 0.42), measuredAt: at(-2, 16, 20) },
      createdAt: at(-2, 16, 24),
    },
    // 624B：一合格一超限 → 仲裁中，两份原始记录保留
    {
      id: "SE-0003",
      batchId: "LAB-624B",
      revision: 1,
      boxId: "D65",
      env: { ...envOkay, recordedAt: at(-1, 15, 40) },
      readingA: { lab: offsetLab(std("LAB-624B"), -0.3, 0.3, 0.25), measuredAt: at(-1, 15, 52) },
      readingB: { lab: offsetLab(std("LAB-624B"), -0.4, 0.7, 0.55), measuredAt: at(-1, 15, 58) },
      createdAt: at(-1, 16, 2),
    },
    // 628E：TL84 校准过期 → 待校色（读数再合格也不能给通过）
    {
      id: "SE-0004",
      batchId: "LAB-628E",
      revision: 1,
      boxId: "TL84",
      env: { ...envOkay, recordedAt: at(-1, 10, 20) },
      readingA: { lab: offsetLab(std("LAB-628E"), 0.2, 0.2, -0.3), measuredAt: at(-1, 10, 31) },
      readingB: { lab: offsetLab(std("LAB-628E"), -0.1, 0.3, 0.25), measuredAt: at(-1, 10, 37) },
      createdAt: at(-1, 10, 41),
    },
    // 630F v1：A 光源白度板读数越限 → 待校色（历史版本可查）
    {
      id: "SE-0005",
      batchId: "LAB-630F",
      revision: 1,
      boxId: "A",
      env: { ...envHumid, recordedAt: at(-3, 10, 6) },
      readingA: { lab: offsetLab(std("LAB-630F"), 0.2, -0.2, 0.3), measuredAt: at(-3, 10, 18) },
      readingB: { lab: offsetLab(std("LAB-630F"), -0.15, 0.25, -0.2), measuredAt: at(-3, 10, 24) },
      createdAt: at(-3, 10, 28),
    },
  ];

  const sessions = specs.map((s) => buildSession(s, batches));

  const orders = [
    { id: "PO-2609-01", customer: "华歌尔面料部", batchId: "LAB-620A", meters: 3200 },
    { id: "PO-2609-02", customer: "三枪针织", batchId: "LAB-621C", meters: 5600 },
    { id: "PO-2609-03", customer: "鲁泰纺织", batchId: "LAB-624B", meters: 1800 },
    { id: "PO-2609-04", customer: "溢达制衣", batchId: "LAB-630F", meters: 4100 },
  ];

  return {
    batches,
    sessions,
    calibrations: CALIBRATIONS,
    orders,
    evaluators: EVALUATORS,
    arbitrator: ARBITRATOR,
  };
}
