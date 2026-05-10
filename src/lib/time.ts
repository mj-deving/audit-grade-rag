export type Clock = {
  now(): number;
};

export const systemClock: Clock = {
  now: () => Date.now(),
};

export function isoFromMs(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function parseIsoTimestamp(value: string, field: string): number {
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return timestampMs;
}
