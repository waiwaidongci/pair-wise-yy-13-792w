import { useState } from "react";
import { reviseBatch, useStore } from "../archive/store";
import { fmtDateTime, recipeSummary } from "../domain/format";
import { STATUS_META, versionViews } from "../domain/rules";
import type { Batch, RecipePart } from "../domain/types";
import { Badge, EmptyHint, Panel } from "./controls";

function RecipeBars({ recipe }: { recipe: RecipePart[] }) {
  const max = Math.max(...recipe.map((p) => p.percent), 1);
  return (
    <div className="recipe-bars">
      {recipe.map((p) => (
        <div key={p.dye} className="recipe-row">
          <span>{p.dye}</span>
          <div className="recipe-track">
            <i style={{ width: `${(p.percent / max) * 100}%` }} />
          </div>
          <em>{p.percent}%</em>
        </div>
      ))}
    </div>
  );
}

function RevisionEditor({ batch }: { batch: Batch }) {
  const [gsm, setGsm] = useState(batch.gsm);
  const [finish, setFinish] = useState(batch.finish);
  const [parts, setParts] = useState<RecipePart[]>(batch.recipe.map((p) => ({ ...p })));
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);

  const setPart = (i: number, patch: Partial<RecipePart>) =>
    setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPart = () => setParts([...parts, { dye: "新染料", percent: 0.2 }]);
  const removePart = (i: number) => setParts(parts.filter((_, j) => j !== i));

  const same =
    gsm === batch.gsm &&
    finish.trim() === batch.finish &&
    recipeSummary(parts) === recipeSummary(batch.recipe);

  const save = () => {
    reviseBatch(batch.id, { gsm, finish, recipe: parts, reason });
    setEditing(false);
    setReason("");
  };

  if (!editing) {
    return (
      <button className="ghost-btn full" onClick={() => setEditing(true)}>
        修改配方 / 后整理 / 克重（将生成新版本）
      </button>
    );
  }

  return (
    <div className="revise-form">
      <label>
        <span>克重 g/㎡</span>
        <input type="number" value={gsm} onChange={(e) => setGsm(Number(e.target.value))} />
      </label>
      <label>
        <span>后整理方式</span>
        <input value={finish} onChange={(e) => setFinish(e.target.value)} />
      </label>
      <div className="recipe-edit">
        <span>染料配方</span>
        {parts.map((p, i) => (
          <div key={i} className="recipe-edit-row">
            <input value={p.dye} onChange={(e) => setPart(i, { dye: e.target.value })} />
            <input
              type="number"
              step={0.1}
              value={p.percent}
              onChange={(e) => setPart(i, { percent: Number(e.target.value) })}
            />
            <button onClick={() => removePart(i)}>删</button>
          </div>
        ))}
        <button onClick={addPart}>＋ 增加染料</button>
      </div>
      <label>
        <span>改版原因</span>
        <input value={reason} placeholder="如：客供手感样加深" onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="revise-actions">
        <button onClick={() => setEditing(false)}>取消</button>
        <button className="primary" disabled={same} onClick={save}>
          保存并生成 v{batch.revision + 1}
        </button>
      </div>
      <p className="revise-warn">保存后旧评色记录保留可查，订单筛选中的通过状态自动作废并要求复评。</p>
    </div>
  );
}

export function BatchDetail({ batch }: { batch: Batch }) {
  const sessions = useStore((s) => s.sessions);
  const views = versionViews(sessions, batch);

  return (
    <div className="detail-grid">
      <Panel kicker="小样档案" title={`${batch.id} · ${batch.fabric}`}>
        <div className="spec-grid">
          <div><small>面料成分</small><b>{batch.composition}</b></div>
          <div><small>克重</small><b>{batch.gsm} g/㎡</b></div>
          <div><small>浴比</small><b>{batch.liquorRatio}</b></div>
          <div><small>保温时间</small><b>{batch.holdMinutes} min</b></div>
          <div><small>后整理</small><b>{batch.finish}</b></div>
          <div><small>当前版本</small><b>v{batch.revision}（{fmtDateTime(batch.revisedAt)}）</b></div>
        </div>
        <h3>配方比例</h3>
        <RecipeBars recipe={batch.recipe} />
        <h3>工艺曲线摘要</h3>
        <div className="curve-box">
          <div className="curve-dot" />
          <p>{batch.curve}；保温 {batch.holdMinutes} min；浴比 {batch.liquorRatio}</p>
        </div>
        <h3>标样 Lab（色差基准）</h3>
        <p className="std-lab">
          L* {batch.standard.L} ／ a* {batch.standard.a} ／ b* {batch.standard.b}
        </p>
        <RevisionEditor batch={batch} />
      </Panel>

      <Panel kicker="历史版本" title="版本与评色存档">
        <p className="side-note">配方、后整理或克重每改一次生成一个版本；旧版本记录仍可查，通过状态按当前版本重新判定。</p>
        {views.length === 0 ? (
          <EmptyHint>暂无版本。</EmptyHint>
        ) : (
          <div className="version-list">
            {views.map((v) => {
              const revision = batch.revisions.find((r) => r.version === v.revision)!;
              const status = v.session
                ? v.session.status === "arbitration" && v.session.arbitrator
                  ? v.session.arbitrator.finalStatus
                  : v.session.status
                : undefined;
              return (
                <article key={v.revision} className={`version-card ${v.current ? "current" : ""}`}>
                  <header>
                    <b>v{v.revision}</b>
                    {v.current ? <Badge tone="ok">当前版本</Badge> : <Badge tone="neutral">历史版本</Badge>}
                    {status ? <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge> : <Badge tone="neutral">无评色</Badge>}
                  </header>
                  <small>{fmtDateTime(v.revisedAt)} · {v.reason}</small>
                  {revision.changes.length > 0 ? (
                    <ul className="change-list">
                      {revision.changes.map((c) => (
                        <li key={c.field}>
                          {c.label}：{c.from} → {c.to}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="change-empty">初版打样快照：{revision.snapshot.gsm}g · {revision.snapshot.finish}</p>
                  )}
                  {v.session ? (
                    <p className="version-session">
                      {v.session.boxId} · {v.session.readings[0].evaluatorName} ΔE {v.session.readings[0].de.toFixed(2)}、
                      {v.session.readings[1].evaluatorName} ΔE {v.session.readings[1].de.toFixed(2)}
                      {v.session.arbitrator ? `；仲裁 ΔE ${v.session.arbitrator.de.toFixed(2)}` : ""}
                    </p>
                  ) : (
                    <p className="version-session muted">该版本无评色记录</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
