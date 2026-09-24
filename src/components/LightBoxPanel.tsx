import { useState } from "react";
import { calibrationState, formatTime } from "../lab/decide";
import { actions } from "../lab/store";
import type { Calibration, LightBox } from "../lab/types";
import { CalibrationBadge } from "./badges";
import { LabInputs } from "./LabInputs";

interface Props {
  boxes: LightBox[];
  calibrations: Calibration[];
  selectedBoxId: string;
  onSelect: (id: string) => void;
}

export function LightBoxPanel({ boxes, calibrations, selectedBoxId, onSelect }: Props) {
  const now = Date.now();
  const [recalId, setRecalId] = useState<string | null>(null);
  const [reading, setReading] = useState({ L: 96.5, a: -0.4, b: 1.2 });

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>评色前置</p>
          <h2>灯箱与标准板</h2>
        </div>
      </div>
      <p className="hint">每次评色先选灯箱；校准过期或标准板读数越限时只能留待校色。</p>

      <div className="box-list">
        {boxes.map((box) => {
          const calib = calibrations.find((c) => c.boxId === box.id);
          const cal = calibrationState(box, calib, now);
          return (
            <article
              key={box.id}
              className={`box-card${selectedBoxId === box.id ? " selected" : ""} cal-${cal.state}`}
            >
              <button className="box-pick" onClick={() => onSelect(box.id)}>
                <div>
                  <h3>{box.code}</h3>
                  <p>{box.name}</p>
                </div>
                <CalibrationBadge state={cal.state} />
              </button>
              <dl className="cal-meta">
                <dt>白板允差</dt>
                <dd>|ΔE| ≤ {box.tileTolerance}</dd>
                <dt>有效期至</dt>
                <dd>{cal.expiresAt ? formatTime(cal.expiresAt) : "未登记"}</dd>
              </dl>
              <button className="link-btn" onClick={() => { setRecalId(recalId === box.id ? null : box.id); setReading(box.tile); }}>
                {recalId === box.id ? "收起校准登记" : "登记重新校准"}
              </button>
              {recalId === box.id && (
                <div className="recal-form">
                  <LabInputs value={reading} onChange={setReading} compact />
                  <button
                    className="primary sm"
                    onClick={() => {
                      actions.recalibrate(box.id, reading, Date.now());
                      setRecalId(null);
                    }}
                  >
                    保存校准读数
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
