import { useMemo, useState } from "react";
import {
  registerEvalSession,
  resolveSessionArbitration,
  useStore,
} from "../archive/store";
import { DE_LIMIT, deltaE76 } from "../domain/color";
import { fmtDateTime } from "../domain/format";
import {
  ENV_LIMITS,
  STATUS_META,
  checkGates,
  effectiveStatus,
  isCalibrationDue,
} from "../domain/rules";
import type { Batch, EvalSession, Lab, LightBoxId } from "../domain/types";
import { Badge, LabFields, NumField, Panel } from "./controls";

function allFinite(lab: Lab): boolean {
  return Number.isFinite(lab.L) && Number.isFinite(lab.a) && Number.isFinite(lab.b);
}

function GateLines({ gates }: { gates: ReturnType<typeof checkGates> }) {
  return (
    <div className="gates">
      {gates.map((g) => (
        <div key={g.code} className={`gate ${g.ok ? "gate-ok" : "gate-bad"}`}>
          <b>{g.ok ? "✓" : "✕"} {g.label}</b>
          <span>{g.detail}</span>
        </div>
      ))}
    </div>
  );
}

function CompareBars(props: { standard: Lab; measured: Lab }) {
  const dL = props.measured.L - props.standard.L;
  const da = props.measured.a - props.standard.a;
  const db = props.measured.b - props.standard.b;
  const de = deltaE76(props.standard, props.measured);
  const widthPct = Math.min(100, (de / 1.2) * 100);
  const Bar = ({ label, v }: { label: string; v: number }) => (
    <div className="cmp-row">
      <span>{label}</span>
      <div className="cmp-track">
        <div
          className={Math.abs(v) > DE_LIMIT ? "cmp-fill over" : "cmp-fill"}
          style={{
            width: `${Math.min(50, (Math.abs(v) / 1.2) * 100)}%`,
            marginLeft: v >= 0 ? "50%" : `${50 - Math.min(50, (Math.abs(v) / 1.2) * 100)}%`,
          }}
        />
        <i className="cmp-mid" />
      </div>
      <em>{Number.isFinite(v) ? v.toFixed(2) : "—"}</em>
    </div>
  );
  return (
    <div className="compare">
      <Bar label="ΔL*" v={Number.isFinite(dL) ? dL : NaN} />
      <Bar label="Δa*" v={Number.isFinite(da) ? da : NaN} />
      <Bar label="Δb*" v={Number.isFinite(db) ? db : NaN} />
      <div className="de-bar-row">
        <span>
          ΔE*ab <b className={de > DE_LIMIT ? "de-over" : "de-ok"}>{Number.isFinite(de) ? de.toFixed(2) : "—"}</b>
        </span>
        <div className="de-track">
          <div className={de > DE_LIMIT ? "de-fill over" : "de-fill"} style={{ width: `${Number.isFinite(de) ? widthPct : 0}%` }} />
          <i className="de-limit" style={{ left: `${(DE_LIMIT / 1.2) * 100}%` }} title={`阈值 ${DE_LIMIT}`} />
        </div>
        <small>阈值 {DE_LIMIT}</small>
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: EvalSession }) {
  const batch = useStore((s) => s.batches.find((b) => b.id === session.batchId)!);
  const meta = STATUS_META[
    session.status === "arbitration" && session.arbitrator ? session.arbitrator.finalStatus : session.status
  ];
  return (
    <article className="session-card">
      <header>
        <div>
          <b>{session.id}</b>
          <small>
            {fmtDateTime(session.createdAt)} · {session.boxId} · v{session.revision} ·{" "}
            {session.env.tempC}℃ / {session.env.humidityPct}%
          </small>
        </div>
        <Badge tone={meta.tone}>
          {session.status === "arbitration"
            ? session.arbitrator
              ? `仲裁终判：${STATUS_META[session.arbitrator.finalStatus].label}`
              : "仲裁中"
            : meta.label}
        </Badge>
      </header>
      <div className="session-readings">
        {session.readings.map((r) => (
          <div key={r.evaluatorId} className="session-reading">
            <span>
              {r.evaluatorName}（{r.evaluatorId}）
            </span>
            <small>
              L* {r.lab.L} / a* {r.lab.a} / b* {r.lab.b}
            </small>
            <b className={r.de > DE_LIMIT ? "de-over" : "de-ok"}>ΔE {r.de.toFixed(2)}</b>
          </div>
        ))}
      </div>
      {session.status === "arbitration" && session.arbitrator ? (
        <div className="session-arb">
          <span>
            仲裁 {session.arbitrator.evaluatorName} · L* {session.arbitrator.lab.L} / a*{" "}
            {session.arbitrator.lab.a} / b* {session.arbitrator.lab.b}
          </span>
          <b className={session.arbitrator.de > DE_LIMIT ? "de-over" : "de-ok"}>
            ΔE {session.arbitrator.de.toFixed(2)}（两份原始记录已保留）
          </b>
        </div>
      ) : null}
      {session.reasons.length > 0 ? (
        <ul className="reasons">
          {session.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {session.status === "calibration-hold" ? (
        <p className="hold-note">门控未通过，本次只留待校色，不作通过/不通过结论。标样 Lab：L* {batch.standard.L} / a* {batch.standard.a} / b* {batch.standard.b}</p>
      ) : null}
    </article>
  );
}

function ArbitrationBox({ session, standard }: { session: EvalSession; standard: Lab }) {
  const [lab, setLab] = useState<Lab>({ ...standard });
  const ready = allFinite(lab);
  const de = ready ? deltaE76(standard, lab) : NaN;
  return (
    <div className="arb-box">
      <h3>仲裁复测（{session.id}）</h3>
      <p>两名评色员结果不一致，请由资深仲裁员在同一灯箱 {session.boxId} 下第三次测量；前两份原始记录继续保留。</p>
      <div className="arb-form">
        <LabFields label="仲裁测量 Lab" value={lab} onValue={setLab} />
        <div className="arb-submit">
          <span className={de > DE_LIMIT ? "de-over" : "de-ok"}>ΔE {ready ? de.toFixed(2) : "—"}</span>
          <button
            className="primary"
            disabled={!ready}
            onClick={() => resolveSessionArbitration(session.id, lab)}
          >
            提交仲裁终判
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReevalConsole({ batch }: { batch: Batch }) {
  const calibrations = useStore((s) => s.calibrations);
  const sessions = useStore((s) => s.sessions);
  const evaluators = useStore((s) => s.evaluators);

  const [boxId, setBoxId] = useState<LightBoxId>("D65");
  const [tempC, setTempC] = useState(22);
  const [humidity, setHumidity] = useState(58);
  const box = calibrations.find((c) => c.boxId === boxId)!;
  const [tileMeasured, setTileMeasured] = useState<Lab>(box.measured);
  const [labs, setLabs] = useState<[Lab, Lab]>([{ ...batch.standard }, { ...batch.standard }]);
  const [resultId, setResultId] = useState<string | null>(null);

  const switchBox = (id: LightBoxId) => {
    setBoxId(id);
    setTileMeasured(calibrations.find((c) => c.boxId === id)!.measured);
  };

  const env = { tempC, humidityPct: humidity, recordedAt: new Date().toISOString() };
  const calibrationSnapshot = {
    boxId,
    nominal: box.nominal,
    measured: tileMeasured,
    lastCalibratedAt: box.lastCalibratedAt,
    validDays: box.validDays,
    tileToleranceDE: box.tileToleranceDE,
  };
  const gates = useMemo(
    () => checkGates(calibrationSnapshot, env),
    // 依赖于原始值，存档变化（如重新校准）时重新计算
    [boxId, tileMeasured.L, tileMeasured.a, tileMeasured.b, tempC, humidity, box.lastCalibratedAt],
  );
  const gateBlocked = gates.some((g) => !g.ok);
  const formReady = allFinite(tileMeasured) && labs.every(allFinite) && Number.isFinite(tempC) && Number.isFinite(humidity);

  const submit = () => {
    if (!formReady) return;
    const session = registerEvalSession({
      batchId: batch.id,
      boxId,
      env,
      tileMeasured,
      readings: labs,
    });
    setResultId(session.id);
  };

  const currentSessions = sessions
    .filter((s) => s.batchId === batch.id && s.revision === batch.revision)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const pendingArbitration = sessions
    .filter((s) => s.batchId === batch.id && s.revision === batch.revision && s.status === "arbitration" && !s.arbitrator)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const resultSession = resultId ? sessions.find((s) => s.id === resultId) : undefined;
  const effStatus = effectiveStatus(sessions, batch);

  return (
    <Panel
      kicker="色差复评台"
      title={`${batch.id} 评色 · ${STATUS_META[effStatus].label}`}
      actions={<Badge tone={STATUS_META[effStatus].tone}>{STATUS_META[effStatus].desc}</Badge>}
    >
      {batch.revision > 1 ? (
        <div className="rev-banner">
          当前为 v{batch.revision}（{fmtDateTime(batch.revisedAt)} 修改），旧版本评色仅作历史存档，通过状态需重新判定。
        </div>
      ) : null}

      <div className="console-grid">
        <div className="console-step">
          <h3>1 · 选择灯箱</h3>
          <div className="box-picker">
            {calibrations.map((c) => {
              const expired = isCalibrationDue(c);
              return (
                <button
                  key={c.boxId}
                  className={c.boxId === boxId ? "box-on" : ""}
                  onClick={() => switchBox(c.boxId)}
                >
                  <b>{c.boxId}</b>
                  <small>{expired ? "校准过期" : "在有效期内"}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="console-step">
          <h3>2 · 登记标准板读数与环境温湿度</h3>
          <div className="env-grid">
            <NumField
              label="环境温度"
              suffix={`℃ 限 ${ENV_LIMITS.temp.min}~${ENV_LIMITS.temp.max}`}
              value={tempC}
              invalid={tempC < ENV_LIMITS.temp.min || tempC > ENV_LIMITS.temp.max}
              onValue={setTempC}
            />
            <NumField
              label="相对湿度"
              suffix={`% 限 ${ENV_LIMITS.humidity.min}~${ENV_LIMITS.humidity.max}`}
              value={humidity}
              invalid={humidity < ENV_LIMITS.humidity.min || humidity > ENV_LIMITS.humidity.max}
              onValue={setHumidity}
            />
          </div>
          <LabFields label="标准白度板实测 Lab" value={tileMeasured} onValue={setTileMeasured} compact />
          <GateLines gates={gates} />
        </div>

        <div className="console-step">
          <h3>3 · 两名评色员同一灯箱分别测量</h3>
          <div className="evaluator-grid">
            {evaluators.map((ev, i) => (
              <div key={ev.id} className="evaluator-card">
                <LabFields
                  label={`${ev.name}（${ev.id}）`}
                  value={labs[i]}
                  onValue={(lab) => setLabs(labs.map((l, j) => (j === i ? lab : l)) as [Lab, Lab])}
                  compact
                />
                <CompareBars standard={batch.standard} measured={labs[i]} />
              </div>
            ))}
          </div>
          <div className="submit-line">
            {gateBlocked ? (
              <span className="hold-warn">门控未通过：提交后仅登记为“待校色”，不能给通过结论</span>
            ) : (
              <span className="submit-hint">门控通过后，双员 ΔE 均 ≤ 0.8 且一致才判通过</span>
            )}
            <button className="primary" disabled={!formReady} onClick={submit}>
              提交双人评色
            </button>
          </div>
        </div>
      </div>

      {resultSession ? (
        <div
          className={`result-banner result-${resultSession.status === "arbitration" && resultSession.arbitrator ? resultSession.arbitrator.finalStatus : resultSession.status}`}
        >
          <b>
            本次判定：
            {STATUS_META[
              resultSession.status === "arbitration" && resultSession.arbitrator
                ? resultSession.arbitrator.finalStatus
                : resultSession.status
            ].label}
          </b>
          <span>{resultSession.reasons.join("；")}</span>
        </div>
      ) : null}

      {pendingArbitration ? <ArbitrationBox session={pendingArbitration} standard={batch.standard} /> : null}

      <h3 className="sessions-title">本版评色记录（v{batch.revision}）</h3>
      {currentSessions.length === 0 ? (
        <p className="empty-hint">当前版本还没有评色记录，修改配方/后整理/克重后需重新评色。</p>
      ) : (
        <div className="session-list">
          {currentSessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </Panel>
  );
}
