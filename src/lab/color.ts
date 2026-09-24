// 色差计算（CIE Lab）：ΔE00（CIEDE2000）为主，附 Lab→sRGB 预览色。
import type { Lab } from "./types";

/** ΔE*ab（CIE76），只在需要粗略对照时使用 */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt(
    (a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2
  );
}

/**
 * CIEDE2000 色差，参考 Sharma et al., Color Research and Application 2005
 * 标准测试向量见 verify: scripts/verify-de.mjs（R01…R05）。
 * kL=kC=kH=1（纺织目视评级常规条件）。
 */
export function deltaE00(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;

  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);

  const hp1 = hueAngle(b1, ap1);
  const hp2 = hueAngle(b2, ap2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;

  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    const diff = hp2 - hp1;
    if (diff > 180) dhp = diff - 360;
    else if (diff < -180) dhp = diff + 360;
    else dhp = diff;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * Math.PI) / 360);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (Cp1 + Cp2) / 2;

  let hbarp = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) {
      hbarp = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
    } else {
      hbarp = (hp1 + hp2) / 2;
    }
  }

  const T =
    1 -
    0.17 * Math.cos(deg(hbarp - 30)) +
    0.24 * Math.cos(deg(2 * hbarp)) +
    0.32 * Math.cos(deg(3 * hbarp + 6)) -
    0.20 * Math.cos(deg(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const SL =
    1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(deg(2 * dTheta)) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH)
  );
}

function hueAngle(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  let h = (Math.atan2(b, ap) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

function deg(radInput: number): number {
  return (radInput * Math.PI) / 180;
}

export function sameLab(a: Lab | null, b: Lab | null): boolean {
  if (!a || !b) return false;
  return a.L === b.L && a.a === b.a && a.b === b.b;
}

/** Lab → sRGB hex，用于在页面上预览标准板与试样颜色（越界色按色域裁剪） */
export function labToHex({ L, a, b }: Lab): string {
  // D65 白点
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const x = Xn * finv(fx);
  const y = Yn * finv(fy);
  const z = Zn * finv(fz);

  // XYZ → linear sRGB
  let r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  let g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  let bl = 0.0557 * x - 0.204 * y + 1.057 * z;

  r = clamp01(r);
  g = clamp01(g);
  bl = clamp01(bl);

  const to255 = (v: number) =>
    Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);

  const [R, G, B] = [to255(r), to255(g), to255(bl)];
  return (
    "#" +
    [R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}

function finv(t: number): number {
  const d = 6 / 29;
  return t > d ? t ** 3 : 3 * d * d * (t - 4 / 29);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return v > 1 ? 1 : v;
}
