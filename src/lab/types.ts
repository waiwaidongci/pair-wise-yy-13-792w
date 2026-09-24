// 领域模型：色差复评台
// 只放数据结构与常量，判定规则在 decide.ts，存档在 archive.ts。

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** 灯箱（标准照明体） */
export interface LightBox {
  id: string;
  /** 光源代号：D65 / TL84 / CWF / A … */
  code: string;
  name: string;
  /** 该光源下标准白板的标称 Lab */
  tile: Lab;
  /** 白板读数允许偏差 |ΔE| */
  tileTolerance: number;
}

/** 标准板校准登记 */
export interface Calibration {
  boxId: string;
  /** 最近一次校准时间（ms） */
  calibratedAt: number;
  /** 校准有效期（ms） */
  validFor: number;
  /** 校准时登记的标准板读数 */
  reading: Lab;
}

export type CalibrationState =
  | "ok"
  | "expired" // 校准过期
  | "overlimit"; // 读数越限

/** 一名评色员的一次原始测量记录 */
export interface AssessorReading {
  assessor: string;
  lab: Lab;
  /** ΔE00，存档时由标准板 Lab 计算后固化 */
  de: number;
  /** 该评色员给出的结论：色差不高于 0.8 才判 pass */
  conclusion: "pass" | "fail";
}

export type Verdict =
  | "pending-calibration" // 校准过期或读数越限：只留待校色，不能通过
  | "passed" // 两人 ΔE 均 ≤ 0.8 且结论一致
  | "rejected" // 两人一致判不通过
  | "arbitration"; // 结论不一致 / 一人过一人不过 → 仲裁

export type FinalVerdict = "arbitrated-pass" | "arbitrated-reject";

/** 校准预检结果（评色登记的前置条件） */
export interface CalibrationCheck {
  state: CalibrationState;
  de: number;
  tolerance: number;
  expiresAt: number | null;
  message: string;
}

/** 一次评色会话：两名评色员在同一灯箱下分别测量 */
export interface AssessmentSession {
  id: string;
  batchId: string;
  boxId: string;
  at: number;
  /** 本次使用的标准板登记读数与环境条件 */
  tileReading: Lab;
  temperature: number;
  humidity: number;
  calibration: CalibrationCheck;
  assessors: [AssessorReading, AssessorReading];
  verdict: Verdict;
  /** 评色时小样配方/后整理/克重版本指纹，用于修改后识别旧结论 */
  specFingerprint: string;
  /** 配方等修改后旧会话标记为 superseded，但记录仍完整保留 */
  superseded: boolean;
  supersededAt?: number;
  /** 仲裁结果；未仲裁为 null，仲裁后两份原始记录仍在 assessors 中 */
  arbitration: {
    arbitrator: string;
    lab: Lab;
    de: number;
    conclusion: "pass" | "fail";
    verdict: FinalVerdict;
    at: number;
    note: string;
  } | null;
}

/** 小样（批次） */
export interface Batch {
  id: string;
  fabric: string; // 面料成分
  weight: number; // 克重 g/m²
  recipe: string; // 染料配方
  liquorRatio: string; // 浴比
  temperatureCurve: string; // 温度曲线摘要
  holdTime: string; // 保温时间
  finishing: string; // 后整理方式
  target: Lab; // 标准板 Lab
  orderId: string; // 客户订单
  createdAt: number;
}

export interface SpecVersion {
  version: number;
  at: number;
  reason: string;
  weight: number;
  recipe: string;
  finishing: string;
  fingerprint: string;
}

export interface BatchState extends Batch {
  specVersion: number;
  specHistory: SpecVersion[];
  sessions: AssessmentSession[];
}

export interface AppState {
  boxes: LightBox[];
  calibrations: Calibration[];
  batches: BatchState[];
}

/** 灯箱 id → 灯箱，避免 UI 到处 find */
export type BoxIdMap = Record<string, LightBox>;

/** 参与重判的三项小样参数 */
export interface SpecChangeInput {
  weight: number;
  recipe: string;
  finishing: string;
}

export const DE_LIMIT = 0.8;
export const STORAGE_KEY = "hxyfront-62012-color-station-v1";
