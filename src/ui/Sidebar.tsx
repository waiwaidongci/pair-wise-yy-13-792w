import { useStore } from "../archive/store";
import { effectiveStatus, isOverLimit, isCalibrationDue } from "../domain/rules";
import { fmtDate } from "../domain/format";
import type { Composition } from "../domain/types";
import { Badge } from "./controls";

export interface Filters {
  composition: Composition | "全部";
  orderOnly: boolean;
  status: string | "全部";
}

export function MetricsBar() {
  const batches = useStore((s) => s.batches);
  const sessions = useStore((s) => s.sessions);
  const orders = useStore((s) => s.orders);

  const statuses = batches.map((b) => effectiveStatus(sessions, b));
  const over = statuses.filter(isOverLimit).length;
  const passCount = statuses.filter((s) => s === "pass").length;
  const rate = batches.length ? Math.round((passCount / batches.length) * 100) : 0;

  const metrics: { label: string; value: string | number; sub?: string }[] = [
    { label: "小样批次", value: batches.length, sub: "当前在评批次" },
    { label: "色差/门控超限", value: over, sub: "不通过·仲裁中·待校色" },
    { label: "客户订单", value: orders.length, sub: "已关联订单" },
    { label: "当前通过率", value: `${rate}%`, sub: `${passCount} 块通过，改版后自动复判` },
  ];

  return (
    <section className="metrics">
      {metrics.map((m) => (
        <article key={m.label}>
          <small>{m.label}</small>
          <strong>{m.value}</strong>
          {m.sub ? <em>{m.sub}</em> : null}
        </article>
      ))}
    </section>
  );
}

const COMPOSITIONS: (Composition | "全部")[] = ["全部", "棉", "涤纶", "锦纶", "混纺"];

export function Sidebar(props: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  onRecalibrate: (boxId: import("../domain/types").LightBoxId) => void;
}) {
  const calibrations = useStore((s) => s.calibrations);
  const { filters, onChange } = props;

  return (
    <div className="sidebar">
      <section className="panel side-panel">
        <h2>订单筛选</h2>
        <p className="side-label">面料成分</p>
        <div className="chips">
          {COMPOSITIONS.map((c) => (
            <button
              key={c}
              className={filters.composition === c ? "chip-on" : ""}
              onClick={() => onChange({ ...filters, composition: c })}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="side-label">结论状态</p>
        <div className="chips">
          {["全部", "pass", "arbitration", "calibration-hold", "reeval", "fail"].map((s) => (
            <button
              key={s}
              className={filters.status === s ? "chip-on" : ""}
              onClick={() => onChange({ ...filters, status: s })}
            >
              {s === "全部"
                ? "全部"
                : { pass: "通过", arbitration: "仲裁中", "calibration-hold": "待校色", reeval: "待复评", fail: "不通过" }[s]}
            </button>
          ))}
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={filters.orderOnly}
            onChange={(e) => onChange({ ...filters, orderOnly: e.target.checked })}
          />
          只看已关联客户订单
        </label>
      </section>

      <section className="panel side-panel">
        <h2>灯箱校准台</h2>
        <p className="side-note">过期或标准板读数越限时，评色只能挂“待校色”</p>
        <div className="cal-list">
          {calibrations.map((c) => {
            const expired = isCalibrationDue(c);
            const dL = c.measured.L - c.nominal.L;
            const da = c.measured.a - c.nominal.a;
            const db = c.measured.b - c.nominal.b;
            const tileDE = Math.sqrt(dL * dL + da * da + db * db);
            const tileBad = tileDE > c.tileToleranceDE;
            const due = new Date(c.lastCalibratedAt);
            due.setDate(due.getDate() + c.validDays);
            return (
              <div key={c.boxId} className="cal-item">
                <div className="cal-head">
                  <b>{c.boxId}</b>
                  {expired ? (
                    <Badge tone="hold">校准过期</Badge>
                  ) : tileBad ? (
                    <Badge tone="warn">读数越限</Badge>
                  ) : (
                    <Badge tone="ok">可用</Badge>
                  )}
                </div>
                <p>{c.name}</p>
                <small>
                  白度板 ΔE {tileDE.toFixed(2)} / 允差 {c.tileToleranceDE} · 校准至 {fmtDate(due.toISOString())}
                </small>
                <button className="link-btn" onClick={() => props.onRecalibrate(c.boxId)}>
                  重新校准
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel side-panel">
        <h2>工作台规则</h2>
        <ul className="rule-list">
          <li>先选灯箱，登记标准板读数与温湿度</li>
          <li>校准过期 / 读数越限：只留待校色</li>
          <li>双员 ΔE 均 ≤ 0.8 且一致：通过</li>
          <li>结论不一致：仲裁，保留两份原始记录</li>
          <li>配方·后整理·克重修改：通过状态重新判定</li>
        </ul>
        <button className="ghost-btn full" onClick={props.onReset}>
          恢复演示数据
        </button>
      </section>
    </div>
  );
}
