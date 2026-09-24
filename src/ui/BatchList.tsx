import { useStore } from "../archive/store";
import { STATUS_META, effectiveStatus, latestSessionForRevision } from "../domain/rules";
import type { Batch } from "../domain/types";
import { Badge, EmptyHint, Panel } from "./controls";
import type { Filters } from "./Sidebar";

function BatchRow(props: { batch: Batch; selected: boolean; onSelect: () => void }) {
  const sessions = useStore((s) => s.sessions);
  const orders = useStore((s) => s.orders);
  const status = effectiveStatus(sessions, props.batch);
  const meta = STATUS_META[status];
  const latest = latestSessionForRevision(sessions, props.batch);
  const order = orders.find((o) => o.batchId === props.batch.id);
  const deValues = latest?.readings.map((r) => r.de);

  return (
    <article className={`batch-row ${props.selected ? "selected" : ""}`} onClick={props.onSelect}>
      <div className="batch-main">
        <div className="batch-idline">
          <h3>{props.batch.id}</h3>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {props.batch.revision > 1 ? <span className="rev-tag">v{props.batch.revision}</span> : null}
        </div>
        <p>
          {props.batch.fabric} · {props.batch.composition} · {props.batch.gsm}g/㎡ · {props.batch.finish}
        </p>
        <p className="batch-sub">
          {order ? `订单 ${order.id} · ${order.customer} · ${order.meters}m` : "未关联客户订单"}
        </p>
      </div>
      <div className="batch-de">
        {latest && deValues ? (
          <>
            <div className="de-values">
              {deValues.map((de, i) => (
                <span key={i} className={de > 0.8 ? "de-over" : "de-ok"}>
                  员{i + 1} ΔE {de.toFixed(2)}
                </span>
              ))}
              {latest.arbitrator ? (
                <span className={latest.arbitrator.de > 0.8 ? "de-over" : "de-ok"}>
                  仲裁 ΔE {latest.arbitrator.de.toFixed(2)}
                </span>
              ) : null}
            </div>
            <small>
              {latest.boxId} · v{latest.revision}
            </small>
          </>
        ) : (
          <small className="de-none">本版尚无评色记录</small>
        )}
      </div>
    </article>
  );
}

export function BatchList(props: {
  filters: Filters;
  selectedId: string;
  onSelect: (id: string) => void;
  onExport: () => void;
}) {
  const batches = useStore((s) => s.batches);
  const sessions = useStore((s) => s.sessions);
  const orders = useStore((s) => s.orders);

  const visible = batches.filter((b) => {
    if (props.filters.composition !== "全部" && b.composition !== props.filters.composition) return false;
    if (props.filters.orderOnly && !b.orderId) return false;
    if (props.filters.status !== "全部" && effectiveStatus(sessions, b) !== props.filters.status) return false;
    return true;
  });

  const overCount = visible.filter((b) => {
    const st = effectiveStatus(sessions, b);
    return st === "fail" || st === "calibration-hold" || st === "arbitration";
  }).length;

  return (
    <Panel
      kicker="批次列表"
      title="小样批次"
      className="batch-panel"
      actions={
        <div className="head-actions">
          <span className="count-chip">
            {visible.length} 块 · 超限 {overCount}
          </span>
          <button onClick={props.onExport}>导出CSV</button>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyHint>没有符合筛选条件的批次。</EmptyHint>
      ) : (
        <div className="batch-list">
          {visible.map((b) => (
            <BatchRow key={b.id} batch={b} selected={b.id === props.selectedId} onSelect={() => props.onSelect(b.id)} />
          ))}
        </div>
      )}
      <p className="list-foot">
        订单筛选的通过状态随评色/改版实时复判；当前命中 {orders.filter((o) =>
          effectiveStatus(sessions, batches.find((b) => b.id === o.batchId)!) === "pass",
        ).length}{" "}
        / {orders.length} 张订单的批次通过。
      </p>
    </Panel>
  );
}
