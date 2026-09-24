import { useMemo, useState } from "react";
import "./styles.css";
import { AssessmentPanel } from "./components/AssessmentPanel";
import { BatchDetail } from "./components/BatchDetail";
import { BatchList } from "./components/BatchList";
import { LightBoxPanel } from "./components/LightBoxPanel";
import { MetricsBar } from "./components/MetricsBar";
import { NewBatchButton } from "./components/NewBatchButton";
import { actions, useStation } from "./lab/store";

function App() {
  const state = useStation();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    state.batches[0]?.id ?? null
  );
  const [selectedBoxId, setSelectedBoxId] = useState<string>(
    state.boxes[0]?.id ?? "box-d65"
  );

  const boxIdMap = useMemo(
    () => Object.fromEntries(state.boxes.map((b) => [b.id, b])),
    [state.boxes]
  );

  const selectedBatch =
    state.batches.find((b) => b.id === selectedBatchId) ?? null;
  const selectedBox = boxIdMap[selectedBoxId] ?? state.boxes[0];
  const selectedCalibration = state.calibrations.find(
    (c) => c.boxId === selectedBox?.id
  );

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 染整实验室 · 色差复评台</p>
        <h1>色差复评台</h1>
        <span>
          连续评样流程：选灯箱 → 登记标准板读数与温湿度（校准过期/读数越限只留待校色）→
          两名评色员同灯箱分别测量，ΔE 均 ≤ 0.8 且结论一致才通过；不一致进入仲裁，两份原始记录均保留。
          配方 / 后整理 / 克重修改后通过状态自动重判，历史版本完整可查。
        </span>
      </section>

      <MetricsBar batches={state.batches} />

      <section className="workspace">
        <aside className="side">
          <LightBoxPanel
            boxes={state.boxes}
            calibrations={state.calibrations}
            selectedBoxId={selectedBox?.id}
            onSelect={setSelectedBoxId}
          />
        </aside>

        <div className="main-col">
          {/* key 同时绑定批次与灯箱：切换即清空草稿，避免把上一块布的数据带进新评色 */}
          <AssessmentPanel
            key={`${selectedBatch?.id ?? "none"}-${selectedBox?.id}`}
            batch={selectedBatch}
            box={selectedBox}
            calibration={selectedCalibration}
          />
          {selectedBatch && (
            <BatchDetail batch={selectedBatch} boxIdMap={boxIdMap} />
          )}
        </div>

        <aside className="side">
          <BatchList
            batches={state.batches}
            selectedId={selectedBatchId}
            onSelect={setSelectedBatchId}
          />
          <div className="panel">
            <NewBatchButton onCreated={setSelectedBatchId} />
            <button
              className="link-btn reset"
              onClick={() => {
                if (window.confirm("恢复演示台账？当前改动将被清除。")) {
                  actions.resetDemo();
                  setSelectedBatchId(null);
                }
              }}
            >
              恢复演示数据
            </button>
          </div>
        </aside>
      </section>

      <footer className="foot">
        判定规则（src/lab/decide.ts）、存档与版本（src/lab/archive.ts）、页面交互（src/components）分层独立；
        批次列表、超限数、Lab 对比均由同一份台账派生，写入后同步更新。
      </footer>
    </main>
  );
}

export default App;
