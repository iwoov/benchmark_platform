type LogLevel = "INFO" | "WARN" | "ERROR";

function safeSerialize(meta?: Record<string, unknown>) {
    if (!meta) {
        return undefined;
    }

    try {
        return JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
    } catch {
        return {
            note: "meta_not_serializable",
        } satisfies Record<string, unknown>;
    }
}

function write(level: LogLevel, event: string, meta?: Record<string, unknown>) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        event,
        ...safeSerialize(meta),
    };

    const line = JSON.stringify(payload);

    if (level === "ERROR") {
        console.error(line);
        return;
    }

    if (level === "WARN") {
        console.warn(line);
        return;
    }

    console.info(line);
}

export function logInfo(event: string, meta?: Record<string, unknown>) {
    write("INFO", event, meta);
}

export function logWarn(event: string, meta?: Record<string, unknown>) {
    write("WARN", event, meta);
}

export function logError(event: string, meta?: Record<string, unknown>) {
    write("ERROR", event, meta);
}
