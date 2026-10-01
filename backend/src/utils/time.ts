export const HOUR_MS = 3_600_000;

/** Index of the fixed UTC hour window containing `ts`. */
export function hourWindow(ts: number): number {
  return Math.floor(ts / HOUR_MS);
}

/** Epoch ms at which the hour window after the one containing `ts` begins. */
export function nextHourWindowStart(ts: number): number {
  return (hourWindow(ts) + 1) * HOUR_MS;
}
