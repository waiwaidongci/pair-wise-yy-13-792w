import { useState, type ReactNode } from "react";
import {
  effectiveStatus,
  formatTime,
  latestSession,
  sessionOverLimitCount,
  specFingerprint,
} from "../lab/decide";
import { actions } from "../lab/store";
import type {
  AssessmentSession,
  BatchState,
  BoxIdMap,
  Lab,
} from "../lab/types";
import { CalibrationBadge, Note, StatusBadge, VerdictBadge } from "./badges";
import { LabInputs } from "./LabInputs";
import { Swatch } from "./Swatch";

interface Props {
  batch: BatchState;
  boxIdMap: BoxIdMap;
}

type Tab = "compare" | "spec" | "history";

export function BatchDetail({ batch, boxIdMap }: Props) {
  const [tab, setTab] = useState<Tab>("compare");
  const last = latestSession(batch);
  const status = effectiveStatus(batch);

  return (
    <section className="panel detail">
      <div className="heading">
        <div>
          <p>批次档案 · v{batch.specVersion}</p>
          <h2>
            {batch.id} <StatusBadge status={status} />
          </h2>
        </div>
        <div className="tabs">
          {([
            ["compare", "Lab 对比 / 仲裁"],
            ["spec", "配方与后整理"],
            ["history", `历史版本 (${batch.specHistory.length + batch.sessions.length})`],
          ] as Array<[Tab, string]>).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "tab-on" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status === "stale" && (
        <Note tone="warn">
          ⚠ 配方 / 后整理 / 克重已修改，旧评色与订单筛选的通过状态已重新判定为「待重判」，请在复评台重新评色。
        </Note>
      )}

      {tab === "compare" && <CompareTab batch={batch} last={last} boxIdMap={boxIdMap} />}
      {tab === "spec" && <SpecTab batch={batch} />}
      {tab === "history" && <HistoryTab batch={batch} boxIdMap={boxIdMap} />}
    </section>
  );
}

/* ---------------- Lab 对比 + 仲裁 ---------------- */

function CompareTab({
  batch,
  last,
  boxIdMap,
}: {
  batch: BatchState;
  last: AssessmentSession | null;
  boxIdMap: BoxIdMap;
}) {
  if (!last) {
    return (
      <div>
        <div className="target-line">
          <Swatch lab={batch.target} label="标准板" size={56} />
          <dl>
            <dt>标准板 Lab</dt>
            <dd>
              L {batch.target.L} · a {batch.target.a} · b {batch.target.b}
            </dd>
            <dt>面料 / 克重</dt>
            <dd>
              {batch.fabric} · {batch.weight}g/m²
            </dd>
          </dl>
        </div>
        <p className="empty">尚未评色，请在上方复评台选择灯箱并登记双人测量。</p>
      </div>
    );
  }

  const box = boxIdMap[last.boxId];

  return (
    <div className="compare">
      <div className="session-head">
        <div>
          <h3>
            最近评色 · {box?.code ?? last.boxId} {box?.name ?? ""}
          </h3>
          <p>
            {formatTime(last.at)} · 温度 {last.temperature}℃ · 湿度 {last.humidity}%
          </p>
        </div>
        <div className="head-badges">
          <CalibrationBadge state={last.calibration.state} />
          <VerdictBadge verdict={last.verdict} />
          {last.superseded && <span className="badge badge-stale">旧评色已失效</span>}
          {last.arbitration && (
            <span className={`badge badge-${last.arbitration.verdict}`}>
              {last.arbitration.verdict === "arbitrated-pass" ? "仲裁通过" : "仲裁驳回"}
            </span>
          )}
        </div>
      </div>

      <div className="reading-cards">
        <div className="reading-card target">
          <Swatch lab={batch.target} label="标准板" size={52} />
          <dl>
            <dt>L / a / b</dt>
            <dd>
              {batch.target.L} / {batch.target.a} / {batch.target.b}
            </dd>
          </dl>
        </div>
        {last.assessors.map((r, i) => (
          <ReadingCard
            key={i}
            name={r.assessor}
            lab={r.lab}
            de={r.de}
            conclusion={r.conclusion}
            target={batch.target}
            raw
          />
        ))}
        {last.arbitration && (
          <ReadingCard
            name={`仲裁人 ${last.arbitration.arbitrator}`}
            lab={last.arbitration.lab}
            de={last.arbitration.de}
            conclusion={last.arbitration.conclusion}
            target={batch.target}
          />
        )}
      </div>
      <p className="hint">
        两份原始记录独立留痕；本会话超限读数 {sessionOverLimitCount(last)} 个。
        {last.arbitration ? ` 仲裁说明：${last.arbitration.note || "—"}（${formatTime(last.arbitration.at)}）` : ""}
      </p>

      {last.verdict === "arbitration" && !last.arbitration && (
        <ArbitrationForm session={last} batchTarget={batch.target} />
      )}
    </div>
  );
}

function ReadingCard({
  name,
  lab,
  de,
  conclusion,
  target,
  raw,
}: {
  name: string;
  lab: Lab;
  de: number;
  conclusion: "pass" | "fail";
  target: Lab;
  raw?: boolean;
}) {
  const over = de > 0.8;
  return (
    <div className={`reading-card${over ? " over" : ""}`}>
      <div className="reading-title">
        <Swatch lab={lab} size={52} />
        <Swatch lab={target} size={52} />
      </div>
      <h4>{name}</h4>
      <p>
        L {lab.L} / a {lab.a} / b {lab.b}
      </p>
      <p className={`delta ${over ? "over" : "ok"}`}>
        ΔE<sub>00</sub> <b>{de.toFixed(2)}</b>
        <small>
          ΔL {(lab.L - target.L).toFixed(2)} · Δa {(lab.a - target.a).toFixed(2)} · Δb{" "}
          {(lab.b - target.b).toFixed(2)}
        </small>
      </p>
      <span className={`badge badge-${conclusion === "pass" ? "passed" : "rejected"}`}>
        {conclusion === "pass" ? "判通过" : "判不通过"}
        {raw ? " · 原始记录" : ""}
      </span>
    </div>
  );
}

function ArbitrationForm({
  session,
  batchTarget,
}: {
  session: AssessmentSession;
  batchTarget: Lab;
}) {
  const [arbitrator, setArbitrator] = useState("仲裁人丙");
  const [lab, setLab] = useState<Lab>({ ...batchTarget });
  const [note, setNote] = useState("");

  return (
    <div className="arbitration">
      <h4>仲裁复测（同一灯箱，第三人测量；甲乙两份原始记录保留不动）</h4>
      <div className="arb-row">
        <label>
          <span>仲裁人</span>
          <input value={arbitrator} onChange={(e) => setArbitrator(e.target.value)} />
        </label>
        <LabInputs value={lab} onChange={setLab} compact />
      </div>
      <label className="arb-note">
        <span>仲裁意见</span>
        <input
          placeholder="如：核对边中色差方向，以乙方读数为准 …"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={!arbitrator.trim()}
        onClick={() =>
          actions.resolveArbitration(session.id, {
            arbitrator: arbitrator.trim(),
            lab,
            note,
            at: Date.now(),
          })
        }
      >
        出具仲裁结论
      </button>
    </div>
  );
}

/* ---------------- 配方 / 后整理 / 克重修改 ---------------- */

function SpecTab({ batch }: { batch: BatchState }) {
  const [weight, setWeight] = useState(batch.weight);
  const [recipe, setRecipe] = useState(batch.recipe);
  const [finishing, setFinishing] = useState(batch.finishing);
  const [reason, setReason] = useState("");

  const nextFp = specFingerprint({ weight, recipe, finishing });
  const changed = nextFp !== specFingerprint(batch);

  return (
    <div className="spec-tab">
      <div className="process-grid">
        <label>
          <span>面料成分</span>
          <input defaultValue={batch.fabric} readOnly />
        </label>
        <label>
          <span>浴比</span>
          <input defaultValue={batch.liquorRatio} readOnly />
        </label>
        <label>
          <span>温度曲线</span>
          <input defaultValue={batch.temperatureCurve} readOnly />
        </label>
        <label>
          <span>保温时间</span>
          <input defaultValue={batch.holdTime} readOnly />
        </label>
      </div>

      <h4>可触发重判的三项参数</h4>
      <div className="spec-edit">
        <label>
          <span>克重 g/m²</span>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </label>
        <label className="wide">
          <span>染料配方</span>
          <textarea rows={2} value={recipe} onChange={(e) => setRecipe(e.target.value)} />
        </label>
        <label className="wide">
          <span>后整理方式</span>
          <textarea rows={2} value={finishing} onChange={(e) => setFinishing(e.target.value)} />
        </label>
        <label className="wide">
          <span>修改原因（写入历史版本）</span>
          <input
            placeholder="如：客户手感意见 / 打样修正"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>

      {changed ? (
        <Note tone="warn">
          保存后：旧评色立即标为失效，批次与「只看订单可通过」筛选均重新判定；历史版本仍可查。
        </Note>
      ) : (
        <p className="hint">三项参数未变化，保存不会重判。</p>
      )}
      <button
        className="primary"
        disabled={!changed}
        onClick={() => {
          actions.updateSpec(batch.id, { weight, recipe, finishing, reason, at: Date.now() });
          setReason("");
        }}
      >
        保存修改并重判
      </button>
    </div>
  );
}

/* ---------------- 历史版本 ---------------- */

function HistoryTab({ batch, boxIdMap }: { batch: BatchState; boxIdMap: BoxIdMap }) {
  type Entry =
    | { kind: "spec"; at: number; node: React.ReactNode }
    | { kind: "session"; at: number; node: React.ReactNode };

  const entries: Entry[] = [
    ...batch.specHistory.map((v) => ({
      kind: "spec" as const,
      at: v.at,
      node: (
        <article className="history-item" key={`spec-${v.version}`}>
          <div className="history-stamp">
            <span className="badge badge-spec">配方版本 v{v.version}</span>
            <small>{formatTime(v.at)}</small>
          </div>
          <p>
            <b>{v.reason}</b>
          </p>
          <p>
            克重 {v.weight}g/m² · {v.recipe}
          </p>
          <p>后整理：{v.finishing}</p>
        </article>
      ),
    })),
    ...batch.sessions.map((s) => ({
      kind: "session" as const,
      at: s.at,
      node: (
        <article className="history-item" key={s.id}>
          <div className="history-stamp">
            <span className="badge badge-session">
              评色记录 · {boxIdMap[s.boxId]?.code ?? s.boxId}
            </span>
            <small>{formatTime(s.at)}</small>
            {s.superseded && <span className="badge badge-stale">已失效（重判前结论）</span>}
          </div>
          <p>
            {s.assessors
              .map((r) => `${r.assessor} ΔE ${r.de.toFixed(2)} ${r.conclusion === "pass" ? "通过" : "不通过"}`)
              .join(" ｜ ")}
          </p>
          <p>
            白板 ΔE {s.calibration.de.toFixed(2)} / 允差 {s.calibration.tolerance} · 温 {s.temperature}℃ · 湿{" "}
            {s.humidity}%
          </p>
          <p>
            <VerdictBadge verdict={s.verdict} />
            {s.arbitration && (
              <span className={`badge badge-${s.arbitration.verdict}`}>
                {s.arbitration.arbitrator} ΔE {s.arbitration.de.toFixed(2)} ·{" "}
                {s.arbitration.verdict === "arbitrated-pass" ? "仲裁通过" : "仲裁驳回"}
              </span>
            )}
          </p>
        </article>
      ),
    })),
  ];

  entries.sort((a, b) => b.at - a.at);

  return (
    <div className="history">
      <p className="hint">配方版本与评色记录合并归档；失效记录只标记、不删除，随时可回溯。</p>
      {entries.map((e) => e.node)}
    </div>
  );
}
