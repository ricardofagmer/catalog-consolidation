import { randomUUID } from "node:crypto";

// Same `service` value as the Python formatter so log pipelines keep one key across both stacks.
const SERVICE_NAME = "catalog_consolidation";

interface LogEventArgs {
  readonly level: "info" | "error";
  readonly event: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export function newCorrelationId(): string {
  return randomUUID().replaceAll("-", "");
}

// Monotonic clock: wall-clock adjustments must not produce negative durations.
export function startTimer(): number {
  return performance.now();
}

export function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

// One JSON object per line on stderr (spec 5.6); stdout stays reserved for the frozen command output.
export function logEvent({ level, event, fields }: LogEventArgs): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    event,
    ...fields,
  };
  process.stderr.write(JSON.stringify(payload) + "\n");
}
