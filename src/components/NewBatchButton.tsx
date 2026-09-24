import { useState } from "react";
import { actions } from "../lab/store";
import type { Lab } from "../lab/types";
import { LabInputs } from "./LabInputs";

export function NewBatchButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [fabric, setFabric] = useState("");
  const [weight, setWeight] = useState(120);
  const [recipe, setRecipe] = useState("");
  const [finishing, setFinishing] = useState("");
  const [orderId, setOrderId] = useState("");
  const [target, setTarget] = useState<Lab>({ L: 60, a: 0, b: 0 });

  const valid = id.trim() && fabric.trim() && recipe.trim() && orderId.trim();

  const save = () => {
    const batchId = id.trim().toUpperCase();
    actions.addBatch({
      id: batchId,
      fabric: fabric.trim(),
      weight,
      recipe: recipe.trim(),
      liquorRatio: "1:10",
      temperatureCurve: "待补充",
      holdTime: "待补充",
      finishing: finishing.trim() || "未定",
      target,
      orderId: orderId.trim(),
      createdAt: Date.now(),
    });
    setOpen(false);
    setId("");
    setFabric("");
    setRecipe("");
    setFinishing("");
    setOrderId("");
    onCreated(batchId);
  };

  if (!open) {
    return (
      <button className="primary sm full" onClick={() => setOpen(true)}>
        + 登记新到小样
      </button>
    );
  }

  return (
    <div className="new-batch">
      <h4>新到小样</h4>
      <div className="new-grid">
        <label>
          <span>批次号</span>
          <input placeholder="LAB-629M" value={id} onChange={(e) => setId(e.target.value)} />
        </label>
        <label>
          <span>面料成分</span>
          <input placeholder="100%棉 平纹" value={fabric} onChange={(e) => setFabric(e.target.value)} />
        </label>
        <label>
          <span>克重 g/m²</span>
          <input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
        </label>
        <label>
          <span>客户订单</span>
          <input placeholder="SO-2431 客户" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        </label>
        <label className="wide">
          <span>染料配方</span>
          <input value={recipe} onChange={(e) => setRecipe(e.target.value)} />
        </label>
        <label className="wide">
          <span>后整理方式</span>
          <input value={finishing} onChange={(e) => setFinishing(e.target.value)} />
        </label>
        <label className="wide">
          <span>标准板 Lab</span>
          <LabInputs value={target} onChange={setTarget} compact />
        </label>
      </div>
      <div className="new-actions">
        <button onClick={() => setOpen(false)}>取消</button>
        <button className="primary" disabled={!valid} onClick={save}>
          建档并选中
        </button>
      </div>
    </div>
  );
}
