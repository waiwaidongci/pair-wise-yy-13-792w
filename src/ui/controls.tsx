import type { ReactNode } from "react";
import type { Lab } from "../domain/types";

export function Panel(props: {
  title: string;
  kicker?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${props.className ?? ""}`}>
      <div className="heading">
        <div>
          {props.kicker ? <p>{props.kicker}</p> : null}
          <h2>{props.title}</h2>
        </div>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

const TONE_CLASS: Record<string, string> = {
  ok: "badge-ok",
  bad: "badge-bad",
  warn: "badge-warn",
  hold: "badge-hold",
  neutral: "badge-neutral",
};

export function Badge({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASS[tone] ?? "badge-neutral"}`}>{children}</span>;
}

export function NumField(props: {
  label: string;
  value: number;
  step?: number;
  suffix?: string;
  invalid?: boolean;
  onValue: (n: number) => void;
}) {
  return (
    <label className={props.invalid ? "field-invalid" : undefined}>
      <span>
        {props.label}
        {props.suffix ? <em>{props.suffix}</em> : null}
      </span>
      <input
        type="number"
        step={props.step ?? 0.1}
        value={Number.isFinite(props.value) ? props.value : ""}
        onChange={(e) => props.onValue(e.target.value === "" ? NaN : Number(e.target.value))}
      />
    </label>
  );
}

export function LabFields(props: {
  label: string;
  value: Lab;
  onValue: (lab: Lab) => void;
  compact?: boolean;
}) {
  const set = (key: keyof Lab, n: number) => props.onValue({ ...props.value, [key]: n });
  return (
    <div className={`lab-fields ${props.compact ? "compact" : ""}`}>
      <span className="lab-label">{props.label}</span>
      <div className="lab-inputs">
        {(["L", "a", "b"] as const).map((k) => (
          <label key={k}>
            <span>
              {k === "L" ? "L*" : `${k}*`}
            </span>
            <input
              type="number"
              step={0.01}
              value={Number.isFinite(props.value[k]) ? props.value[k] : ""}
              onChange={(e) => set(k, e.target.value === "" ? NaN : Number(e.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="empty-hint">{children}</p>;
}
