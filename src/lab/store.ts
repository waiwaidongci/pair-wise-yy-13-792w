// 页面交互与存档之间的薄状态层：全局唯一状态，组件订阅后自动同步。
// 批次列表、超限数、Lab 对比都由同一 state 派生，写入后一起更新。
import { useSyncExternalStore } from "react";
import {
  addBatch as archiveAddBatch,
  loadState,
  persist,
  recalibrate as archiveRecalibrate,
  registerSession,
  resetState as archiveReset,
  resolveArbitration as archiveResolve,
  updateSpec,
  type NewBatchInput,
  type RegisterSessionInput,
  type SpecUpdateInput,
} from "./archive";
import type { AppState } from "./types";

let state: AppState = loadState();
const listeners = new Set<() => void>();

function emit(next: AppState): void {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStation(): AppState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  );
}

export const actions = {
  registerSession(input: RegisterSessionInput) {
    const { state: next, session } = registerSession(state, input);
    emit(next);
    return session;
  },
  updateSpec(batchId: string, input: SpecUpdateInput) {
    emit(updateSpec(state, batchId, input));
  },
  resolveArbitration(
    sessionId: string,
    arb: { arbitrator: string; lab: Parameters<typeof archiveResolve>[2]["lab"]; note: string; at: number }
  ) {
    emit(archiveResolve(state, sessionId, arb));
  },
  recalibrate(boxId: string, reading: NewBatchInput["target"], at: number) {
    emit(archiveRecalibrate(state, boxId, reading, at));
  },
  addBatch(input: NewBatchInput) {
    emit(archiveAddBatch(state, input));
  },
  resetDemo() {
    emit(archiveReset());
  },
  touch() {
    persist(state);
  },
};
