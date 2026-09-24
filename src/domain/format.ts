const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function recipeSummary(recipe: { dye: string; percent: number }[]): string {
  return recipe.map((p) => `${p.dye} ${p.percent}%`).join("、");
}
