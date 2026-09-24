import { DE_LIMIT, deltaE76 } from "./color";
import type {
  Batch,
  CalibrationReading,
  EffectiveStatus,
  EnvReading,
  EvalSession,
  EvalStatus,
  GateResult,
  Lab,
  Verdict,
} from "./types";

/** 环境温湿度控制区间（实验室标准） */
export const ENV_LIMITS = {
  temp: { min: 18, max: 26 },
  humidity: { min: 45, max: 75 },
};

export function isCalibrationDue(c: CalibrationReading, now: Date = new Date()): boolean {
  const due = new Date(c.lastCalibratedAt);
  due.setDate(due.getDate() + c.validDays);
  return now.getTime() > due.getTime();
}

export function calibrationDueDate(c: CalibrationReading): Date {
  const due = new Date(c.lastCalibratedAt);
  due.setDate(due.getDate() + c.validDays);
  return due;
}

/** 评色前三道门：校准有效期、标准板读数、环境温湿度。任一门不过只能挂起待校色。 */
export function checkGates(
  calibration: CalibrationReading,
  env: EnvReading,
  now: Date = new Date(),
): GateResult[] {
  const expired = isCalibrationDue(calibration, now);
  const due = calibrationDueDate(calibration);
  const tileDE = deltaE76(calibration.nominal, calibration.measured);
  const tempOk = env.tempC >= ENV_LIMITS.temp.min && env.tempC <= ENV_LIMITS.temp.max;
  const humOk = env.humidityPct >= ENV_LIMITS.humidity.min && env.humidityPct <= ENV_LIMITS.humidity.max;

  return [
    {
      code: "expired",
      label: "灯箱校准",
      ok: !expired,
      detail: expired
        ? `校准已于 ${due.toLocaleDateString("zh-CN")} 过期，须重新校准`
        : `有效期至 ${due.toLocaleDateString("zh-CN")}`,
    },
    {
      code: "tile",
      label: "标准板读数",
      ok: tileDE <= calibration.tileToleranceDE,
      detail: `白度板 ΔE ${tileDE.toFixed(2)}，允差 ${calibration.tileToleranceDE}`,
    },
    {
      code: "env",
      label: "环境温湿度",
      ok: tempOk && humOk,
      detail: `温度 ${env.tempC}℃（${ENV_LIMITS.temp.min}~${ENV_LIMITS.temp.max}）、湿度 ${env.humidityPct}%（${ENV_LIMITS.humidity.min}~${ENV_LIMITS.humidity.max}）`,
    },
  ];
}

/** 单人结论：色差不高于 0.8 方可判通过 */
export function evaluateReading(standard: Lab, measured: Lab): { de: number; verdict: Verdict } {
  const de = deltaE76(standard, measured);
  return { de: Math.round(de * 1000) / 1000, verdict: de <= DE_LIMIT ? "pass" : "fail" };
}

/** 一次双人双测的判定。门控挂起只留“待校色”，绝不给通过结论。 */
export function adjudicate(
  gates: GateResult[],
  readings: { de: number; verdict: Verdict }[],
): { status: EvalStatus; reasons: string[] } {
  const failedGates = gates.filter((g) => !g.ok);
  if (failedGates.length > 0) {
    return {
      status: "calibration-hold",
      reasons: failedGates.map((g) => `${g.label}：${g.detail}`),
    };
  }

  const overLimit = readings.filter((r) => r.de > DE_LIMIT);
  if (overLimit.length === readings.length) {
    return {
      status: "fail",
      reasons: [`两名评色员色差均超过 ${DE_LIMIT}，一致不通过`],
    };
  }
  if (overLimit.length === 0) {
    return { status: "pass", reasons: ["双员色差均不高于 0.8，结论一致，通过"] };
  }
  // 一名合格一名超限，双员结果不一致 → 仲裁，两份原始记录都保留
  return {
    status: "arbitration",
    reasons: [
      `双员结果不一致：${readings
        .map((r, i) => `评色员${i + 1} ΔE ${r.de.toFixed(2)}`)
        .join("，")}；提交仲裁并保留两份原始记录`,
    ],
  };
}

/** 仲裁：第三次复测（资深仲裁员）给出终判，原始两份记录仍保留。 */
export function resolveArbitration(
  standard: Lab,
  measured: Lab,
): { de: number; verdict: Verdict; finalStatus: Extract<EvalStatus, "pass" | "fail"> } {
  const { de, verdict } = evaluateReading(standard, measured);
  return { de, verdict, finalStatus: verdict };
}

export function isSessionCurrent(session: EvalSession, batch: Batch): boolean {
  return session.revision === batch.revision;
}

/** 批次当前版本最近一次（未被后续修改推翻的）复评 */
export function latestSessionForRevision(sessions: EvalSession[], batch: Batch, revision = batch.revision): EvalSession | undefined {
  return sessions
    .filter((s) => s.batchId === batch.id && s.revision === revision)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

export interface VersionView {
  revision: number;
  revisedAt: string;
  reason: string;
  current: boolean;
  session?: EvalSession;
}

/** 历史版本与其评色记录，供“历史版本还能查” */
export function versionViews(sessions: EvalSession[], batch: Batch): VersionView[] {
  const views: VersionView[] = batch.revisions
    .slice()
    .sort((a, b) => b.version - a.version)
    .map((r) => ({
      revision: r.version,
      revisedAt: r.changedAt,
      reason: r.reason,
      current: r.version === batch.revision,
      session: latestSessionForRevision(sessions, batch, r.version),
    }));
  return views;
}

/**
 * 批次对外有效状态：
 * - 配方/后整理/克重修改后，旧通过状态作废，重新判定为“待复评”；
 * - 否则取当前版本最近一次复判（仲裁终判优先）。
 */
export function effectiveStatus(sessions: EvalSession[], batch: Batch): EffectiveStatus {
  const session = latestSessionForRevision(sessions, batch);
  if (!session) return "reeval";
  if (session.status === "arbitration") {
    return session.arbitrator ? session.arbitrator.finalStatus : "arbitration";
  }
  return session.status;
}

export const STATUS_META: Record<EffectiveStatus, { label: string; tone: string; desc: string }> = {
  pass: { label: "通过", tone: "ok", desc: "双员 ΔE ≤ 0.8 且结论一致" },
  fail: { label: "不通过", tone: "bad", desc: "色差超限或双员一致不通过" },
  arbitration: { label: "仲裁中", tone: "warn", desc: "结论不一致，等待第三次复测，两份原始记录已保留" },
  "calibration-hold": { label: "待校色", tone: "hold", desc: "校准过期 / 标准板读数或温湿度越限，不能给通过结论" },
  reeval: { label: "待复评", tone: "neutral", desc: "配方、后整理或克重已修改，旧通过状态作废" },
};

export function isOverLimit(status: EffectiveStatus): boolean {
  return status === "fail" || status === "calibration-hold" || status === "arbitration";
}
