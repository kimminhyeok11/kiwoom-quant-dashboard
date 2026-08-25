export type DatedObservation = { symbol: string; capturedAt: Date | string };

export function selectLatestObservations<T extends DatedObservation>(observations: T[]): T[] {
  const latest = new Map<string, T>();
  for (const observation of observations) {
    const current = latest.get(observation.symbol);
    if (!current || new Date(observation.capturedAt).getTime() > new Date(current.capturedAt).getTime()) latest.set(observation.symbol, observation);
  }
  return Array.from(latest.values()).sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime());
}
