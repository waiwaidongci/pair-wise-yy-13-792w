import { useSyncExternalStore } from "react";
import { createSeedState } from "../domain/seed";
import { adjudicate, checkGates, resolveArbitration } from "../domain/rules";
import type {
  AppState,
  CalibrationConfig,
  EnvReading,
  EvalSession,
  FieldChange,
  Lab,
  LightBoxId,
  RecipePart,
} from "../domain/types";
import { fmtDateTime, recipeSummary } from "../domain/format";

const STORAGE_KEY = "reeval-bench-state-v1";

let state: AppState = loadState();
const listeners = new Set<() => void>();

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* 忽略损坏的本地存档 */
  }
  return createSeedState();
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时仅保留内存状态 */
  }
}

function setState(next: AppState): void {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

let seq = Date.now();
export const uid = (prefix: string): string =>
  `${prefix}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export interface RegisterEvalInput {
  batchId: string;
  boxId: LightBoxId;
  env: EnvReading;
  /** 评色时白度板的实际读数（与灯箱建档读数可不同，每次登记以本次为准） */
  tileMeasured: Lab;
  readings: [Lab, Lab];
}

/** 登记一次双人复评：判定全部由领域层完成，存档层只负责落库 */
export function registerEvalSession(input: RegisterEvalInput): EvalSession {
  const batch = state.batches.find((b) => b.id === input.batchId)!;
  const box = state.calibrations.find((c) => c.boxId === input.boxId)!;
  const now = new Date(input.env.recordedAt);

  const calibration = {
    boxId: box.boxId,
    nominal: box.nominal,
    measured: input.tileMeasured,
    lastCalibratedAt: box.lastCalibratedAt,
    validDays: box.validDays,
    tileToleranceDE: box.tileToleranceDE,
  };

  const gates = checkGates(calibration, input.env, now);
  const evaluated = input.readings.map((lab, i) => {
    const dL = lab.L - batch.standard.L;
    const da = lab.a - batch.standard.a;
    const db = lab.b - batch.standard.b;
    const de = Math.round(Math.sqrt(dL * dL + da * da + db * db) * 1000) / 1000;
    const evaluator = state.evaluators[i];
    return {
      evaluatorId: evaluator.id,
      evaluatorName: evaluator.name,
      lab,
      de,
      verdict: de <= 0.8 ? ("pass" as const) : ("fail" as const),
      measuredAt: input.env.recordedAt,
    };
  });

  const { status, reasons } = adjudicate(gates, evaluated);

  const session: EvalSession = {
    id: uid("SE"),
    batchId: input.batchId,
    revision: batch.revision,
    boxId: input.boxId,
    env: input.env,
    calibration,
    readings: evaluated as EvalSession["readings"],
    status,
    reasons,
    createdAt: new Date().toISOString(),
  };

  setState({ ...state, sessions: [...state.sessions, session] });
  return session;
}

/** 仲裁复测：终判后写回会话，前两份原始记录保持不变 */
export function resolveSessionArbitration(sessionId: string, lab: Lab): void {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session || session.status !== "arbitration" || session.arbitrator) return;
  const batch = state.batches.find((b) => b.id === session.batchId)!;
  const result = resolveArbitration(batch.standard, lab);

  const next: EvalSession = {
    ...session,
    arbitrator: {
      evaluatorId: state.arbitrator.id,
      evaluatorName: state.arbitrator.name,
      lab,
      de: result.de,
      verdict: result.verdict,
      finalStatus: result.finalStatus,
      arbitratedAt: new Date().toISOString(),
    },
  };
  setState({ ...state, sessions: state.sessions.map((s) => (s.id === sessionId ? next : s)) });
}

export interface RevisionPatch {
  gsm: number;
  finish: string;
  recipe: RecipePart[];
  reason: string;
}

/**
 * 配方 / 后整理 / 克重修改：版本 +1，旧评色和订单筛选的通过状态随之重新判定。
 * 历史版本快照与旧记录全部保留可查。
 */
export function reviseBatch(batchId: string, patch: RevisionPatch): void {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch) return;

  const changes: FieldChange[] = [];
  if (patch.gsm !== batch.gsm) {
    changes.push({ field: "gsm", label: "克重", from: `${batch.gsm} g/㎡`, to: `${patch.gsm} g/㎡` });
  }
  if (patch.finish.trim() && patch.finish.trim() !== batch.finish) {
    changes.push({ field: "finish", label: "后整理", from: batch.finish, to: patch.finish.trim() });
  }
  const nextRecipe = recipeSummary(patch.recipe);
  if (nextRecipe !== recipeSummary(batch.recipe)) {
    changes.push({ field: "formula", label: "染料配方", from: recipeSummary(batch.recipe), to: nextRecipe });
  }
  if (changes.length === 0) return;

  const changedAt = new Date().toISOString();
  const nextBatch = {
    ...batch,
    gsm: patch.gsm,
    finish: patch.finish.trim() || batch.finish,
    recipe: patch.recipe,
    revision: batch.revision + 1,
    revisedAt: changedAt,
    revisions: [
      {
        version: batch.revision + 1,
        changedAt,
        reason: patch.reason.trim() || "配方/后整理/克重修改",
        changes,
        snapshot: { gsm: patch.gsm, finish: patch.finish.trim() || batch.finish, recipe: patch.recipe },
      },
      ...batch.revisions,
    ],
  };
  setState({ ...state, batches: state.batches.map((b) => (b.id === batchId ? nextBatch : b)) });
}

/** 重新校准灯箱：登记校准日期与白度板读数，解除过期/越限挂起 */
export function recalibrate(boxId: LightBoxId, measured: Lab): void {
  const boxes = state.calibrations.map((c): CalibrationConfig =>
    c.boxId === boxId ? { ...c, measured, lastCalibratedAt: new Date().toISOString() } : c,
  );
  setState({ ...state, calibrations: boxes });
}

export function resetDemo(): void {
  setState(createSeedState());
}

/** 导出全部评色会话（含挂起、仲裁、历史版本）为 CSV */
export function exportSessionsCsv(): void {
  const header = [
    "会话号",
    "批次",
    "版本",
    "灯箱",
    "评色时间",
    "温度℃",
    "湿度%",
    "校准过期",
    "白板ΔE",
    "评色员1",
    "ΔE1",
    "评色员2",
    "ΔE2",
    "判定",
    "仲裁ΔE",
    "终判",
  ];
  const rows = state.sessions.map((s) => {
    const nom = s.calibration.nominal;
    const mea = s.calibration.measured;
    const tile = Math.sqrt(
      (nom.L - mea.L) ** 2 + (nom.a - mea.a) ** 2 + (nom.b - mea.b) ** 2,
    ).toFixed(2);
    return [
      s.id,
      s.batchId,
      `v${s.revision}`,
      s.boxId,
      fmtDateTime(s.createdAt),
      s.env.tempC,
      s.env.humidityPct,
      new Date(s.calibration.lastCalibratedAt).toLocaleDateString("zh-CN"),
      tile,
      s.readings[0].evaluatorName,
      s.readings[0].de,
      s.readings[1].evaluatorName,
      s.readings[1].de,
      s.status,
      s.arbitrator ? s.arbitrator.de : "",
      s.arbitrator ? s.arbitrator.finalStatus : "",
    ];
  });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `色差复评记录-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
