// 存档层：只负责持久化与版本记录。
// - localStorage 为单一数据源；
// - 配方/后整理/克重修改不覆盖旧值，另写 specHistory，并把旧评色标记 superseded；
// - 评色记录与仲裁原始读数只追加、不修改，历史版本随时可查。
import {
  CALIB_VALIDITY_7D,
  buildReading,
  checkCalibration,
  combineVerdict,
  specFingerprint,
} from "./decide";
import { STORAGE_KEY } from "./types";
import type {
  AppState,
  AssessmentSession,
  Batch,
  BatchState,
  Calibration,
  Lab,
  LightBox,
} from "./types";
import { deltaE00 } from "./color";
import { seedState } from "./seed";

const VALIDITY = CALIB_VALIDITY_7D;

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}${Math.floor(
    Math.random() * 1e4
  )
    .toString(36)
    .padStart(2, "0")}`;
}

function clone(state: AppState): AppState {
  return structuredClone(state);
}

/** 首次进入载入演示台账；之后以 localStorage 为准 */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.batches) && Array.isArray(parsed.boxes)) {
        return parsed;
      }
    }
  } catch {
    // 损坏的存档回退到演示数据
  }
  const seeded = seedState();
  persist(seeded);
  return seeded;
}

export function persist(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等情况下静默保留内存态
  }
}

export function resetState(): AppState {
  const seeded = seedState();
  persist(seeded);
  return seeded;
}

export interface RegisterSessionInput {
  batch: BatchState;
  box: LightBox;
  tileReading: Lab;
  temperature: number;
  humidity: number;
  assessorLabs: [Lab, Lab];
  /** 评色员手工纠正的结论；不传则按 ΔE≤0.8 自动判定 */
  conclusionsOverride?: ["pass" | "fail", "pass" | "fail"];
  at: number;
}

/** 登记一次双人评色；校准不过关时 verdict 强制为待校色 */
export function registerSession(
  prev: AppState,
  input: RegisterSessionInput
): { state: AppState; session: AssessmentSession } {
  const state = clone(prev);
  const batch = mustFindBatch(state, input.batch.id);
  const calib = state.calibrations.find((c) => c.boxId === input.box.id);
  const check = checkCalibration(
    input.box,
    calib,
    input.tileReading,
    input.at
  );

  const readings: [AssessmentSession["assessors"][number], AssessmentSession["assessors"][number]] = [
    buildReading("评色员甲", input.assessorLabs[0], batch.target),
    buildReading("评色员乙", input.assessorLabs[1], batch.target),
  ];
  if (input.conclusionsOverride) {
    readings[0].conclusion = input.conclusionsOverride[0];
    readings[1].conclusion = input.conclusionsOverride[1];
  }

  const session: AssessmentSession = {
    id: nextId("s"),
    batchId: batch.id,
    boxId: input.box.id,
    at: input.at,
    tileReading: input.tileReading,
    temperature: input.temperature,
    humidity: input.humidity,
    calibration: check,
    assessors: readings,
    verdict: combineVerdict(check, readings),
    specFingerprint: specFingerprint(batch),
    superseded: false,
    arbitration: null,
  };

  batch.sessions.push(session);
  persist(state);
  return { state, session };
}

export interface SpecUpdateInput {
  weight: number;
  recipe: string;
  finishing: string;
  reason: string;
  at: number;
}

/**
 * 修改配方/后整理/克重：
 * 旧评色与订单筛选通过状态立即重新判定（旧会话标 superseded），
 * 旧版本写入 specHistory 永久保留。
 */
export function updateSpec(
  prev: AppState,
  batchId: string,
  input: SpecUpdateInput
): AppState {
  const state = clone(prev);
  const batch = mustFindBatch(state, batchId);
  const nextFingerprint = specFingerprint(input);

  if (nextFingerprint !== specFingerprint(batch)) {
    for (const s of batch.sessions) {
      if (!s.superseded) {
        s.superseded = true;
        s.supersededAt = input.at;
      }
    }
    batch.specHistory.push({
      version: batch.specVersion + 1,
      at: input.at,
      reason: input.reason.trim() || "配方/后整理/克重修改",
      weight: input.weight,
      recipe: input.recipe.trim(),
      finishing: input.finishing.trim(),
      fingerprint: nextFingerprint,
    });
  }

  batch.weight = input.weight;
  batch.recipe = input.recipe.trim();
  batch.finishing = input.finishing.trim();
  batch.specVersion = batch.specHistory[batch.specHistory.length - 1].version;

  persist(state);
  return state;
}

/** 仲裁：在同一灯箱下由第三人复测；两份原始记录保持不动 */
export function resolveArbitration(
  prev: AppState,
  sessionId: string,
  arb: { arbitrator: string; lab: Lab; note: string; at: number }
): AppState {
  const state = clone(prev);
  const session = findSession(state, sessionId);
  if (!session || session.verdict !== "arbitration" || session.arbitration) {
    return prev;
  }
  const batch = mustFindBatch(state, session.batchId);
  const reading = buildReading(arb.arbitrator, arb.lab, batch.target);
  session.arbitration = {
    arbitrator: arb.arbitrator,
    lab: arb.lab,
    de: reading.de,
    conclusion: reading.conclusion,
    verdict: reading.conclusion === "pass" ? "arbitrated-pass" : "arbitrated-reject",
    at: arb.at,
    note: arb.note.trim(),
  };
  persist(state);
  return state;
}

/** 重新校准灯箱标准板（登记读数与时间），校准状态随台账重算 */
export function recalibrate(
  prev: AppState,
  boxId: string,
  reading: Lab,
  at: number
): AppState {
  const state = clone(prev);
  const existing = state.calibrations.find((c) => c.boxId === boxId);
  const record: Calibration = {
    boxId,
    calibratedAt: at,
    validFor: VALIDITY,
    reading,
  };
  if (existing) {
    Object.assign(existing, record);
  } else {
    state.calibrations.push(record);
  }
  persist(state);
  return state;
}

export interface NewBatchInput {
  id: string;
  fabric: string;
  weight: number;
  recipe: string;
  liquorRatio: string;
  temperatureCurve: string;
  holdTime: string;
  finishing: string;
  target: Lab;
  orderId: string;
  createdAt: number;
}

export function addBatch(prev: AppState, input: NewBatchInput): AppState {
  const state = clone(prev);
  const batch: BatchState = {
    ...({
      id: input.id,
      fabric: input.fabric,
      weight: input.weight,
      recipe: input.recipe,
      liquorRatio: input.liquorRatio,
      temperatureCurve: input.temperatureCurve,
      holdTime: input.holdTime,
      finishing: input.finishing,
      target: input.target,
      orderId: input.orderId,
      createdAt: input.createdAt,
    } satisfies Batch),
    specVersion: 1,
    specHistory: [
      {
        version: 1,
        at: input.createdAt,
        reason: "小样初版",
        weight: input.weight,
        recipe: input.recipe,
        finishing: input.finishing,
        fingerprint: specFingerprint(input),
      },
    ],
    sessions: [],
  };
  state.batches.unshift(batch);
  persist(state);
  return state;
}

/** 仅用于算法自检：仲裁人读数相对标准板的 ΔE00 */
export function previewArbitrationDe(target: Lab, lab: Lab): number {
  return deltaE00(target, lab);
}

function mustFindBatch(state: AppState, id: string): BatchState {
  const batch = state.batches.find((b) => b.id === id);
  if (!batch) throw new Error(`批次不存在：${id}`);
  return batch;
}

function findSession(
  state: AppState,
  sessionId: string
): AssessmentSession | undefined {
  for (const b of state.batches) {
    const s = b.sessions.find((x) => x.id === sessionId);
    if (s) return s;
  }
  return undefined;
}
