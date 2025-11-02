export function toUsd(n: number | null | undefined): string {
  const v = Number(n || 0);
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
