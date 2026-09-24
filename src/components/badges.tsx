import type { ReactNode } from "react";
import type { EffectiveStatus } from "../lab/decide";
import type { CalibrationState, Verdict } from "../lab/types";

const STATUS_TEXT: Record<EffectiveStatus, string> = {
  unevaluated: "未评色",
  stale: "待重判",
  "pending-calibration": "待校色",
  passed: "通过",
  rejected: "不通过",
  arbitration: "仲裁中",
  "arbitrated-pass": "仲裁通过",
  "arbitrated-reject": "仲裁驳回",
};

const VERDICT_TEXT: Record<Verdict, string> = {
  "pending-calibration": "待校色",
  passed: "通过",
  rejected: "不通过",
  arbitration: "进入仲裁",
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_TEXT[status]}</span>;
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`badge badge-${verdict}`}>{VERDICT_TEXT[verdict]}</span>
  );
}

const CAL_TEXT: Record<CalibrationState, string> = {
  ok: "校准有效",
  expired: "校准过期",
  overlimit: "读数越限",
};

export function CalibrationBadge({ state }: { state: CalibrationState }) {
  return <span className={`badge badge-cal-${state}`}>{CAL_TEXT[state]}</span>;
}

export function Note({ tone, children }: { tone: "warn" | "block" | "ok"; children: ReactNode }) {
  return <p className={`note note-${tone}`}>{children}</p>;
}
