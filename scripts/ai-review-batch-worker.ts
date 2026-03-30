import { randomUUID } from "crypto";
import { prisma } from "../lib/db/prisma";
import {
    recoverAiReviewStrategyBatchRuns,
    runAiReviewStrategyBatchWorkerOnce,
} from "../lib/ai/review-strategy-batches";

const workerId = `ai-review-batch-worker-${randomUUID()}`;
const idleDelayMs = 2000;
const busyDelayMs = 200;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    let stopped = false;

    const shutdown = async () => {
        stopped = true;
        await prisma.$disconnect().catch(() => undefined);
        process.exit(0);
    };

    process.on("SIGINT", () => {
        void shutdown();
    });
    process.on("SIGTERM", () => {
        void shutdown();
    });

    await recoverAiReviewStrategyBatchRuns(workerId);
    console.log(`[ai-review-batch-worker] started: ${workerId}`);

    while (!stopped) {
        try {
            const handled = await runAiReviewStrategyBatchWorkerOnce(workerId);
            await sleep(handled ? busyDelayMs : idleDelayMs);
        } catch (error) {
            console.error("[ai-review-batch-worker] loop failed", error);
            await sleep(idleDelayMs);
        }
    }
}

void main();
