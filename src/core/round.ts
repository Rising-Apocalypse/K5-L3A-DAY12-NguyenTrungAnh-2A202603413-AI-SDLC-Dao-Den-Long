/** Round to 3 decimals for output only (and turn -0 into 0). Internal state keeps full precision. */
export function round3(x: number): number {
  const r = Math.round(x * 1000) / 1000;
  return r === 0 ? 0 : r;
}
