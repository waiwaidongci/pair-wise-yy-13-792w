import { computeMetrics } from "../lab/decide";
import type { BatchState } from "../lab/types";

const CARDS: Array<{
  key: keyof ReturnType<typeof computeMetrics>;
  label: string;
  suffix?: string;
  alert?: boolean;
}> = [
  { key: "batchCount", label: "小样批次" },
  { key: "overLimitCount", label: "色差超限", alert: true },
  { key: "pendingCalibrationCount", label: "待校色", alert: true },
  { key: "arbitrationCount", label: "仲裁中", alert: true },
  { key: "orderCount", label: "客户订单" },
  { key: "passRate", label: "已评定通过率", suffix: "%" },
];

export function MetricsBar({ batches }: { batches: BatchState[] }) {
  const m = computeMetrics(batches);
  return (
    <section className="metrics">
      {CARDS.map((c) => (
        <article key={c.key} className={c.alert && m[c.key] > 0 ? "metric-alert" : ""}>
          <small>{c.label}</small>
          <strong>
            {m[c.key]}
            {c.suffix ?? ""}
          </strong>
          {c.key === "passRate" && (
            <em>
              通过 {m.passedCount} / 已评定 {m.decidedCount}
            </em>
          )}
        </article>
      ))}
    </section>
  );
}
