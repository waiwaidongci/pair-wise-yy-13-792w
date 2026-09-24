// 判定层：所有色差复评规则都在这里，是纯函数，不碰存档、不碰 React。
// UI 与存档都只调用这些规则，保证口径唯一。
import { deltaE00 } from "./color";
import { DE_LIMIT } from "./types";
import type {
  AssessorReading,
  AssessmentSession,
  BatchState,
  Calibration,
  CalibrationCheck,
  CalibrationState,
  Lab,
  LightBox,
  SpecChangeInput,
  Verdict,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;

/** 配方/后整理/克重指纹：任一项修改都会变化，旧评色即失效需重判 */
export function specFingerprint(spec: SpecChangeInput): string {
  return JSON.stringify([
    String(spec.weight),
    spec.recipe.trim(),
    spec.finishing.trim(),
  ]);
}

export function latestSession(batch: BatchState): AssessmentSession | null {
  return batch.sessions.length === 0
    ? null
    : batch.sessions.reduce((a, b) => (a.at > b.at ? a : b));
}

/**
 * 校准预检：校色登记前的硬门槛。
 * - 过期（或未登记） → expired
 * - 标准板读数 |ΔE| 越限 → overlimit
 * 两种情况都只能留「待校色」，禁止给出通过结论。
 */
export function checkCalibration(
  box: LightBox,
  calib: Calibration | undefined,
  tileReading: Lab,
  now: number
): CalibrationCheck {
  const tolerance = box.tileTolerance;
  if (!calib) {
    return {
      state: "expired",
      de: deltaE00(box.tile, tileReading),
      tolerance,
      expiresAt: null,
      message: "该灯箱尚无标准板校准登记，不能判通过。",
    };
  }
  const expiresAt = calib.calibratedAt + calib.validFor;
  if (now >= expiresAt) {
    return {
      state: "expired",
      de: deltaE00(box.tile, tileReading),
      tolerance,
      expiresAt,
      message: `校准已于 ${formatTime(expiresAt)} 过期，只能登记待校色。`,
    };
  }
  const de = deltaE00(box.tile, tileReading);
  if (de > tolerance + 1e-9) {
    return {
      state: "overlimit",
      de,
      tolerance,
      expiresAt,
      message: `标准板读数 |ΔE|=${de.toFixed(2)} 超出 ${tolerance}，只能登记待校色。`,
    };
  }
  return {
    state: "ok",
    de,
    tolerance,
    expiresAt,
    message: `标准板 |ΔE|=${de.toFixed(2)} ≤ ${tolerance}，校准有效至 ${formatTime(
      expiresAt
    )}。`,
  };
}

export function calibrationState(
  box: LightBox,
  calib: Calibration | undefined,
  now: number
): { state: CalibrationState; expiresAt: number | null } {
  if (!calib) return { state: "expired", expiresAt: null };
  const expiresAt = calib.calibratedAt + calib.validFor;
  if (now >= expiresAt) return { state: "expired", expiresAt };
  // 用校准时登记的读数复核
  const de = deltaE00(box.tile, calib.reading);
  if (de > box.tileTolerance + 1e-9) return { state: "overlimit", expiresAt };
  return { state: "ok", expiresAt };
}

/** 单人测量：以标准板为基准算 ΔE00；ΔE≤0.8 方可判通过 */
export function buildReading(
  assessor: string,
  lab: Lab,
  target: Lab
): AssessorReading {
  const de = deltaE00(target, lab);
  return { assessor, lab, de, conclusion: de <= DE_LIMIT ? "pass" : "fail" };
}

/**
 * 两人同灯箱结论合成：
 * - 校准不过关（过期/越限）→ pending-calibration，不给通过
 * - 两份都 pass 且结论一致 → passed
 * - 两份都 fail 且结论一致 → rejected
 * - 结论不一致（含一人过一人不过）→ arbitration，两份原始记录都保留
 */
export function combineVerdict(
  check: CalibrationCheck,
  readings: [AssessorReading, AssessorReading]
): Verdict {
  if (check.state !== "ok") return "pending-calibration";
  const [r1, r2] = readings;
  if (r1.conclusion === r2.conclusion) {
    return r1.conclusion === "pass" ? "passed" : "rejected";
  }
  return "arbitration";
}

/** 批次当前有效结论：考虑配方/后整理/克重修改导致的旧评色失效 */
export type EffectiveStatus =
  | "unevaluated"
  | "stale" // 旧评色待重判
  | "pending-calibration"
  | "passed"
  | "rejected"
  | "arbitration"
  | "arbitrated-pass"
  | "arbitrated-reject";

export function effectiveStatus(
  batch: BatchState
): EffectiveStatus {
  const last = latestSession(batch);
  if (!last) return "unevaluated";
  if (last.specFingerprint !== specFingerprint(batch)) return "stale";
  if (last.arbitration) return `arbitrated-${last.arbitration.conclusion}` as
    | "arbitrated-pass"
    | "arbitrated-reject";
  return last.verdict;
}

export function isPassed(batch: BatchState): boolean {
  return effectiveStatus(batch) === "passed";
}

/** 一次会话里的超限读数条数（任一评色员/仲裁人 ΔE>0.8） */
export function sessionOverLimitCount(s: AssessmentSession): number {
  let n = s.assessors.filter((r) => r.de > DE_LIMIT + 1e-9).length;
  if (s.arbitration && s.arbitration.de > DE_LIMIT + 1e-9) n += 1;
  return n;
}

/** 批次当前是否存在超限读数（用于「色差超限」指标）；未评色或已失效待重判不计入现况 */
export function batchOverLimit(batch: BatchState): boolean {
  const status = effectiveStatus(batch);
  if (status === "unevaluated" || status === "stale") return false;
  const last = latestSession(batch);
  if (!last) return false;
  return sessionOverLimitCount(last) > 0;
}

export interface StationMetrics {
  batchCount: number;
  overLimitCount: number;
  pendingCalibrationCount: number;
  arbitrationCount: number;
  orderCount: number;
  passedCount: number;
  decidedCount: number;
  passRate: number; // 仅统计已评定且不待重判的批次
}

export function computeMetrics(batches: BatchState[]): StationMetrics {
  const orders = new Set<string>();
  let over = 0;
  let pending = 0;
  let arbitration = 0;
  let passed = 0;
  let decided = 0;

  for (const b of batches) {
    orders.add(b.orderId);
    if (batchOverLimit(b)) over += 1;
    const status = effectiveStatus(b);
    if (status === "pending-calibration") pending += 1;
    if (status === "arbitration") arbitration += 1;
    if (status === "passed" || status === "arbitrated-pass") {
      passed += 1;
      decided += 1;
    } else if (
      status === "rejected" ||
      status === "arbitrated-reject"
    ) {
      decided += 1;
    }
  }

  return {
    batchCount: batches.length,
    overLimitCount: over,
    pendingCalibrationCount: pending,
    arbitrationCount: arbitration,
    orderCount: orders.size,
    passedCount: passed,
    decidedCount: decided,
    passRate: decided === 0 ? 0 : Math.round((passed / decided) * 100),
  };
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export const CALIB_VALIDITY_7D = 7 * DAY;
