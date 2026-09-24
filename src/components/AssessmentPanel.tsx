import { useMemo, useRef, useState } from "react";
import {
  buildReading,
  checkCalibration,
  combineVerdict,
  formatTime,
} from "../lab/decide";
import { actions } from "../lab/store";
import { DE_LIMIT } from "../lab/types";
import type {
  AssessorReading,
  BatchState,
  Calibration,
  Lab,
  LightBox,
} from "../lab/types";
import { deltaE00 } from "../lab/color";
import { Note, VerdictBadge } from "./badges";
import { LabInputs } from "./LabInputs";
import { Swatch } from "./Swatch";

interface Props {
  batch: BatchState | null;
  box: LightBox;
  calibration: Calibration | undefined;
}

interface AssessorDraft {
  name: string;
  lab: Lab;
  manual: boolean;
  conclusion: "pass" | "fail";
}

export function AssessmentPanel({ batch, box, calibration }: Props) {
  const [tile, setTile] = useState<Lab>({ ...box.tile });
  const [temperature, setTemperature] = useState(21.0);
  const [humidity, setHumidity] = useState(58);
  const [a1, setA1] = useState<AssessorDraft>({
    name: "评色员甲",
    lab: batch ? { ...batch.target } : { L: 0, a: 0, b: 0 },
    manual: false,
    conclusion: "pass",
  });
  const [a2, setA2] = useState<AssessorDraft>({
    name: "评色员乙",
    lab: batch ? { ...batch.target } : { L: 0, a: 0, b: 0 },
    manual: false,
    conclusion: "pass",
  });
  const [flash, setFlash] = useState<string | null>(null);

  // 校准过期判断只与灯箱/校准记录/白板读数有关；组件由 key 控制随批次/灯箱重挂载
  const nowRef = useRef(Date.now());
  const check = useMemo(
    () => checkCalibration(box, calibration, tile, nowRef.current),
    [box, calibration, tile]
  );

  const envValid =
    Number.isFinite(temperature) &&
    temperature >= 10 &&
    temperature <= 40 &&
    Number.isFinite(humidity) &&
    humidity >= 20 &&
    humidity <= 90;

  if (!batch) {
    return (
      <section className="panel">
        <div className="heading">
          <div>
            <p>双人复评</p>
            <h2>评色登记</h2>
          </div>
        </div>
        <p className="empty">请先在左侧批次列表选择一块小样。</p>
      </section>
    );
  }

  const draftToReading = (d: AssessorDraft): AssessorReading => {
    const auto = buildReading(d.name, d.lab, batch.target);
    // ΔE 超限硬约束：手工改判不能覆盖仪器结果
    if (d.manual && auto.conclusion === "pass") {
      return { ...auto, conclusion: d.conclusion };
    }
    return auto;
  };

  const r1 = draftToReading(a1);
  const r2 = draftToReading(a2);
  // 预判：ΔE 数值始终来自测量；ΔE>0.8 时评色员无权改判通过。
  // 手工只允许在 ΔE≤0.8 时将「通过」改判为「不通过」。
  const previewVerdict = combineVerdict(check, [r1, r2]);
  const gated = check.state !== "ok";

  const patchA = (
    which: 1 | 2,
    lab: Lab,
    setter: (d: AssessorDraft) => void
  ) => {
    const de = deltaE00(batch.target, lab);
    setter({
      name: which === 1 ? a1.name : a2.name,
      lab,
      manual: false,
      conclusion: de <= DE_LIMIT ? "pass" : "fail",
    });
  };

  const submit = () => {
    const override: ["pass" | "fail", "pass" | "fail"] | undefined =
      a1.manual || a2.manual ? [r1.conclusion, r2.conclusion] : undefined;
    const session = actions.registerSession({
      batch,
      box,
      tileReading: tile,
      temperature,
      humidity,
      assessorLabs: [a1.lab, a2.lab],
      conclusionsOverride: override,
      at: Date.now(),
    });
    setFlash(
      `已登记 ${formatTime(session.at)} 的评色（${box.code}）：${
        session.verdict === "pending-calibration"
          ? "待校色，不给通过结论"
          : verdictText(session.verdict)
      }`
    );
    setA1((d) => ({ ...d, lab: { ...batch.target }, manual: false }));
    setA2((d) => ({ ...d, lab: { ...batch.target }, manual: false }));
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>双人复评 · {box.code} {box.name}</p>
          <h2>评色登记 — {batch.id}</h2>
        </div>
        <Swatch lab={batch.target} label="标准板" />
      </div>

      <div className="assess-grid">
        <div className="subpanel">
          <h3>① 标准板读数与环境</h3>
          <div className="env-row">
            <label>
              <span>白板读数 Lab</span>
              <LabInputs value={tile} onChange={setTile} compact />
            </label>
          </div>
          <div className="env-row two">
            <label>
              <span>环境温度 ℃（10–40）</span>
              <input
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </label>
            <label>
              <span>相对湿度 %（20–90）</span>
              <input
                type="number"
                step="1"
                value={humidity}
                onChange={(e) => setHumidity(Number(e.target.value))}
              />
            </label>
          </div>
          {check.state === "ok" ? (
            <Note tone="ok">✓ {check.message}</Note>
          ) : (
            <Note tone="block">⛔ {check.message} 本次只登记「待校色」。</Note>
          )}
          {!envValid && <Note tone="warn">温湿度超出实验室登记范围，请核对后再提交。</Note>}
        </div>

        <AssessorCard
          index={1}
          draft={a1}
          batch={batch}
          reading={r1}
          onLab={(lab) => patchA(1, lab, setA1)}
          onManual={(manual, conclusion) =>
            setA1((d) => ({ ...d, manual, conclusion }))
          }
        />
        <AssessorCard
          index={2}
          draft={a2}
          batch={batch}
          reading={r2}
          onLab={(lab) => patchA(2, lab, setA2)}
          onManual={(manual, conclusion) =>
            setA2((d) => ({ ...d, manual, conclusion }))
          }
        />
      </div>

      <div className="verdict-preview">
        <div>
          <span>本次预判结论</span>
          <VerdictBadge verdict={previewVerdict} />
          {gated && <small>校准门槛未过，两名评色员数据照实留存。</small>}
          {!gated && previewVerdict === "arbitration" && (
            <small>两份结论不一致，将进入仲裁并保留两份原始记录。</small>
          )}
          {!gated && previewVerdict === "passed" && (
            <small>两人 ΔE 均 ≤ {DE_LIMIT} 且结论一致方可通过。</small>
          )}
        </div>
        <button className="primary" disabled={!envValid} onClick={submit}>
          登记本次评色
        </button>
      </div>

      {flash && <Note tone="ok">{flash}</Note>}
    </section>
  );
}

function AssessorCard({
  index,
  draft,
  batch,
  reading,
  onLab,
  onManual,
}: {
  index: number;
  draft: AssessorDraft;
  batch: BatchState;
  reading: AssessorReading;
  onLab: (lab: Lab) => void;
  onManual: (manual: boolean, conclusion: "pass" | "fail") => void;
}) {
  const over = reading.de > DE_LIMIT;
  return (
    <div className="subpanel assessor">
      <h3>
        {index === 1 ? "②" : "③"} {draft.name}
        <span className="same-box">同灯箱独立测量</span>
      </h3>
      <div className="assessor-row">
        <LabInputs value={draft.lab} onChange={onLab} compact />
        <Swatch lab={draft.lab} />
        <Swatch lab={batch.target} />
      </div>
      <div className={`de-readout${over ? " over" : " ok"}`}>
        ΔE<sub>00</sub> = <b>{reading.de.toFixed(2)}</b>
        <em>{over ? `> ${DE_LIMIT} 超限` : `≤ ${DE_LIMIT}`}</em>
      </div>
      <label className="manual-line">
        <span>评色结论</span>
        <select
          value={reading.conclusion}
          disabled={over}
          onChange={(e) =>
            onManual(true, e.target.value as "pass" | "fail")
          }
        >
          <option value="pass">通过（ΔE≤0.8）</option>
          <option value="fail">不通过（评色员改判）</option>
        </select>
        {over ? (
          <small className="manual-flag">ΔE 超限，仪器判定不通过</small>
        ) : !draft.manual ? (
          <small>按 ΔE 自动判定</small>
        ) : (
          <small className="manual-flag">评色员手工改判</small>
        )}
      </label>
    </div>
  );
}

function verdictText(v: string): string {
  switch (v) {
    case "passed":
      return "两人结论一致，通过";
    case "rejected":
      return "两人一致不通过";
    case "arbitration":
      return "结论不一致，进入仲裁";
    default:
      return v;
  }
}
