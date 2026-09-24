import type { Lab } from "./types";

/** 双人双测的通过阈值：两名评色员色差都不高于 0.8 */
export const DE_LIMIT = 0.8;

/** CIE76 ΔE*ab 色差 */
export function deltaE76(p: Lab, q: Lab): number {
  const dL = p.L - q.L;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const round3 = (n: number): number => Math.round(n * 1000) / 1000;
