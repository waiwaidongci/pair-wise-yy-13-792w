import { labToHex } from "../lab/color";
import type { Lab } from "../lab/types";

/** Lab 色块预览：标准板/试样并排看颜色差异 */
export function Swatch({ lab, label, size = 46 }: { lab: Lab; label?: string; size?: number }) {
  return (
    <span className="swatch" title={label ?? `L ${lab.L} a ${lab.a} b ${lab.b}`}>
      <i
        style={{
          width: size,
          height: size,
          background: labToHex(lab),
          display: "inline-block",
          borderRadius: 6,
          border: "1px solid rgba(15,23,42,.18)",
        }}
      />
      {label ? <em>{label}</em> : null}
    </span>
  );
}
