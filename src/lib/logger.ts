type LogLevel = "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

function normalizeMeta(meta: LogMeta): LogMeta {
  const normalized: LogMeta = {};

  for (const [key, value] of Object.entries(meta)) {
    if (value instanceof Error) {
      normalized[key] = {
        name: value.name,
        message: value.message,
      };
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function write(level: LogLevel, event: string, meta: LogMeta = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...normalizeMeta(meta),
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info: (event: string, meta?: LogMeta) => write("info", event, meta),
  warn: (event: string, meta?: LogMeta) => write("warn", event, meta),
  error: (event: string, meta?: LogMeta) => write("error", event, meta),
};
