// 领域模型：灯箱、标准板、双人评色记录、仲裁、批次版本

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export type LightBoxId = "D65" | "TL84" | "CWF" | "A" | "UV";

export type Composition = "棉" | "涤纶" | "锦纶" | "混纺";

/** 评色员个人结论 */
export type Verdict = "pass" | "fail";

/** 一次双人复评的判定结果 */
export type EvalStatus = "pass" | "fail" | "arbitration" | "calibration-hold";

/** 批次当前对外状态：在判定结果之外，还可能因配方/后整理/克重变更而待复评 */
export type EffectiveStatus = EvalStatus | "reeval";

export interface RecipePart {
  dye: string;
  percent: number;
}

export interface FieldChange {
  field: "gsm" | "finish" | "formula";
  label: string;
  from: string;
  to: string;
}

/** 历史版本快照（只存会触发复判的三项） */
export interface BatchRevision {
  version: number;
  changedAt: string;
  reason: string;
  changes: FieldChange[];
  snapshot: {
    gsm: number;
    finish: string;
    recipe: RecipePart[];
  };
}

export interface Batch {
  id: string;
  fabric: string;
  composition: Composition;
  gsm: number;
  recipe: RecipePart[];
  liquorRatio: string;
  /** 温度曲线摘要 */
  curve: string;
  holdMinutes: number;
  finish: string;
  /** 客户标样 Lab，色差以此为准 */
  standard: Lab;
  orderId?: string;
  revision: number;
  revisedAt: string;
  createdAt: string;
  revisions: BatchRevision[];
}

export interface EnvReading {
  tempC: number;
  humidityPct: number;
  recordedAt: string;
}

/** 评色前登记的灯箱校准 / 标准板读数快照 */
export interface CalibrationReading {
  boxId: LightBoxId;
  nominal: Lab;
  measured: Lab;
  lastCalibratedAt: string;
  validDays: number;
  tileToleranceDE: number;
}

export interface CalibrationConfig extends CalibrationReading {
  name: string;
}

export interface EvaluatorReading {
  evaluatorId: string;
  evaluatorName: string;
  lab: Lab;
  /** 相对标样的 ΔE*ab，由领域层计算 */
  de: number;
  verdict: Verdict;
  measuredAt: string;
}

export interface ArbitratorResult {
  evaluatorId: string;
  evaluatorName: string;
  lab: Lab;
  de: number;
  verdict: Verdict;
  finalStatus: Extract<EvalStatus, "pass" | "fail">;
  arbitratedAt: string;
}

/** 一次复评会话：同一灯箱、同一环境下两名评色员的两份原始记录 */
export interface EvalSession {
  id: string;
  batchId: string;
  /** 评色时的批次版本，版本变更后旧记录只作历史可查 */
  revision: number;
  boxId: LightBoxId;
  env: EnvReading;
  calibration: CalibrationReading;
  readings: [EvaluatorReading, EvaluatorReading];
  status: EvalStatus;
  reasons: string[];
  /** 进入仲裁后的第三次复测；前两份原始记录始终保留 */
  arbitrator?: ArbitratorResult;
  createdAt: string;
}

export interface CustomerOrder {
  id: string;
  customer: string;
  batchId: string;
  meters: number;
}

export interface GateResult {
  code: "expired" | "tile" | "env";
  label: string;
  ok: boolean;
  detail: string;
}

export interface AppState {
  batches: Batch[];
  sessions: EvalSession[];
  calibrations: CalibrationConfig[];
  orders: CustomerOrder[];
  evaluators: { id: string; name: string }[];
  arbitrator: { id: string; name: string };
}
