import { useMemo, useState } from "react";
import { effectiveStatus, isPassed } from "../lab/decide";
import type { BatchState } from "../lab/types";
import { StatusBadge } from "./badges";

const FABRIC_FILTERS = ["全部", "棉", "涤纶", "锦纶", "混纺"];

interface Props {
  batches: BatchState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function BatchList({ batches, selectedId, onSelect }: Props) {
  const [fabric, setFabric] = useState("全部");
  const [passedOnly, setPassedOnly] = useState(false);

  const orders = useMemo(
    () => Array.from(new Set(batches.map((b) => b.orderId))).sort(),
    [batches]
  );
  const [order, setOrder] = useState("全部订单");

  const visible = batches.filter((b) => {
    if (fabric !== "全部" && !b.fabric.includes(fabric)) return false;
    if (order !== "全部订单" && b.orderId !== order) return false;
    if (passedOnly && !isPassed(b)) return false;
    return true;
  });

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>批次台账</p>
          <h2>小样批次列表</h2>
        </div>
      </div>

      <div className="filters">
        <div className="chips">
          {FABRIC_FILTERS.map((f) => (
            <button
              key={f}
              className={fabric === f ? "chip-on" : ""}
              onClick={() => setFabric(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option>全部订单</option>
            {orders.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <label className="switch">
            <input
              type="checkbox"
              checked={passedOnly}
              onChange={(e) => setPassedOnly(e.target.checked)}
            />
            <span>只看订单可通过</span>
          </label>
        </div>
      </div>

      <div className="batch-list">
        {visible.map((b) => {
          const status = effectiveStatus(b);
          return (
            <button
              key={b.id}
              className={`batch-row${selectedId === b.id ? " selected" : ""}`}
              onClick={() => onSelect(b.id)}
            >
              <div className="batch-row-main">
                <h3>{b.id}</h3>
                <p>
                  {b.fabric} · {b.weight}g/m² · {b.orderId}
                </p>
              </div>
              <div className="batch-row-side">
                <StatusBadge status={status} />
                <small>v{b.specVersion} · {b.sessions.length} 次评色</small>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && <p className="empty">没有符合筛选条件的批次。</p>}
      </div>
    </section>
  );
}
