import type { Lab } from "../lab/types";

interface Props {
  value: Lab;
  onChange: (lab: Lab) => void;
  compact?: boolean;
}

/** Lab 三通道输入，ΔE 复评中两名评色员与仲裁人共用 */
export function LabInputs({ value, onChange, compact }: Props) {
  const set = (key: keyof Lab, raw: string) => {
    const n = Number(raw);
    onChange({ ...value, [key]: Number.isFinite(n) ? n : 0 });
  };

  return (
    <div className={`lab-inputs${compact ? " compact" : ""}`}>
      {(["L", "a", "b"] as const).map((key) => (
        <label key={key}>
          <span>{key}</span>
          <input
            type="number"
            step="0.01"
            value={Number.isFinite(value[key]) ? value[key] : 0}
            onChange={(e) => set(key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

export function emptyLab(): Lab {
  return { L: 0, a: 0, b: 0 };
}
