import { useState } from "react";
import { exportSessionsCsv, recalibrate, resetDemo, useStore } from "./archive/store";
import { deltaE76 } from "./domain/color";
import { effectiveStatus } from "./domain/rules";
import type { LightBoxId } from "./domain/types";
import { BatchList } from "./ui/BatchList";
import { BatchDetail } from "./ui/BatchDetail";
import { ReevalConsole } from "./ui/ReevalConsole";
import { MetricsBar, Sidebar, type Filters } from "./ui/Sidebar";
import { LabFields } from "./ui/controls";

const DEFAULT_FILTERS: Filters = { composition: "全部", orderOnly: false, status: "全部" };

function RecalibrateModal(props: { boxId: LightBoxId; onClose: () => void }) {
  const box = useStore((s) => s.calibrations.find((c) => c.boxId === props.boxId)!);
  const [measured, setMeasured] = useState({ ...box.nominal });
  const de = deltaE76(box.nominal, measured);
  const valid = de <= box.tileToleranceDE;

  return (
    <div className="modal-mask" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>重新校准 {box.boxId}</h2>
        <p className="side-note">登记本次白度板实测读数，校准有效期从今天重新起算。</p>
        <LabFields label="白度板实测 Lab" value={measured} onValue={setMeasured} compact />
        <p className={valid ? "de-ok" : "de-over"} style={{ fontWeight: 700 }}>
          与标称值 ΔE {de.toFixed(2)}，允差 {box.tileToleranceDE}
          {valid ? "，读数合格" : "，读数仍越限"}
        </p>
        <div className="revise-actions">
          <button onClick={props.onClose}>取消</button>
          <button
            className="primary"
            disabled={!valid}
            onClick={() => {
              recalibrate(box.boxId, measured);
              props.onClose();
            }}
          >
            确认校准
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const batches = useStore((s) => s.batches);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState(batches[0]?.id ?? "");
  const [calBox, setCalBox] = useState<LightBoxId | null>(null);

  const selected = batches.find((b) => b.id === selectedId) ?? batches[0];

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62012 · 源提示词7 · Port 62012</p>
        <h1>纺织染整 · 色差复评台</h1>
        <span>
          先选灯箱并登记标准板读数与环境温湿度；校准过期或读数越限只留待校色。两名评色员同箱分别测量，色差均不高于
          0.8 且结论一致方可通过，结论不一致进入仲裁并保留两份原始记录。配方、后整理或克重修改后通过状态自动重新判定，历史版本随时可查。
        </span>
      </section>

      <MetricsBar />

      <section className="workspace work-layout">
        <Sidebar
          filters={filters}
          onChange={setFilters}
          onReset={resetDemo}
          onRecalibrate={(id) => setCalBox(id)}
        />
        <div className="main-col">
          <BatchList
            filters={filters}
            selectedId={selected?.id ?? ""}
            onSelect={setSelectedId}
            onExport={exportSessionsCsv}
          />
          {selected ? (
            <>
              <ReevalConsole key={selected.id} batch={selected} />
              <BatchDetail batch={selected} />
            </>
          ) : (
            <section className="panel">
              <p className="empty-hint">当前筛选下没有批次。</p>
            </section>
          )}
        </div>
      </section>

      <footer className="foot">
        判定（领域规则）· 存档（状态与历史版本）· 页面交互三层分离 · 批次列表、超限数与 Lab 对比随登记/改版同步更新
      </footer>

      {calBox ? <RecalibrateModal boxId={calBox} onClose={() => setCalBox(null)} /> : null}
    </main>
  );
}

export default App;
