import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CODE = "review_common";
const DEFAULT_NAME = "审核策略-通用";
const LEGACY_USERNAME = "wuyun";
const LEGACY_CODE = "QUESTION_QUALITY_CHECK";

function isAdminRole(role) {
  return role === "SUPER_ADMIN" || role === "PLATFORM_ADMIN";
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function updateEmbeddedStrategy(value, strategy) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const next = cloneJson(value);

  if (next.strategy && typeof next.strategy === "object" && !Array.isArray(next.strategy)) {
    next.strategy.id = strategy.id;
    next.strategy.code = strategy.code;
    next.strategy.name = strategy.name;
    if ("definition" in next.strategy) {
      next.strategy.definition = cloneJson(strategy.definition);
    }
  }

  return next;
}

function resolveAdminScopeFromUser(user) {
  if (!user) {
    return null;
  }

  if (isAdminRole(user.platformRole)) {
    return user.id;
  }

  return user.ownerAdminId ?? null;
}

async function loadLegacyStrategy() {
  const legacyAdmin = await prisma.user.findFirst({
    where: {
      username: LEGACY_USERNAME,
      platformRole: "PLATFORM_ADMIN",
    },
    select: {
      id: true,
      username: true,
      name: true,
    },
  });

  if (!legacyAdmin) {
    throw new Error(`未找到历史管理员 ${LEGACY_USERNAME}`);
  }

  const strategy = await prisma.aiReviewStrategy.findFirst({
    where: {
      scopeAdminId: legacyAdmin.id,
      code: {
        in: [LEGACY_CODE, DEFAULT_CODE],
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (!strategy) {
    throw new Error("未找到历史通用策略。");
  }

  return {
    legacyAdmin,
    strategy,
  };
}

async function ensureCommonStrategyForAdmin(admin, templateStrategy, execute) {
  const existing = await prisma.aiReviewStrategy.findFirst({
    where: {
      scopeAdminId: admin.id,
      code: DEFAULT_CODE,
    },
  });

  if (existing) {
    return existing;
  }

  if (!execute) {
    return {
      id: `dryrun-${admin.username ?? admin.id}`,
      scopeAdminId: admin.id,
      createdById: admin.id,
      code: DEFAULT_CODE,
      name: DEFAULT_NAME,
      description: "DRY_RUN",
      enabled: true,
      projectIds: templateStrategy.projectIds,
      datasourceIds: templateStrategy.datasourceIds,
      questionTypes: templateStrategy.questionTypes,
      definition: templateStrategy.definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return prisma.aiReviewStrategy.create({
    data: {
      scopeAdminId: admin.id,
      createdById: admin.id,
      code: DEFAULT_CODE,
      name: DEFAULT_NAME,
      description:
        templateStrategy.description ??
        "管理员域默认通用审核策略，由历史通用策略迁移生成。",
      enabled: templateStrategy.enabled,
      projectIds: cloneJson(templateStrategy.projectIds),
      datasourceIds: cloneJson(templateStrategy.datasourceIds),
      questionTypes: cloneJson(templateStrategy.questionTypes),
      definition: cloneJson(templateStrategy.definition),
    },
  });
}

async function main() {
  const execute = process.argv.includes("--execute");
  const { legacyAdmin, strategy: legacyStrategy } = await loadLegacyStrategy();

  const admins = await prisma.user.findMany({
    where: {
      platformRole: {
        in: ["SUPER_ADMIN", "PLATFORM_ADMIN"],
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      platformRole: true,
    },
  });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      platformRole: true,
      ownerAdminId: true,
    },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));

  const projectMap = new Map(
    (
      await prisma.project.findMany({
        select: {
          id: true,
          createdById: true,
        },
      })
    ).map((project) => [project.id, project]),
  );

  let templateStrategy = legacyStrategy;

  if (
    legacyStrategy.code !== DEFAULT_CODE ||
    legacyStrategy.name !== DEFAULT_NAME
  ) {
    if (execute) {
      templateStrategy = await prisma.aiReviewStrategy.update({
        where: {
          id: legacyStrategy.id,
        },
        data: {
          code: DEFAULT_CODE,
          name: DEFAULT_NAME,
          description:
            legacyStrategy.description ??
            "管理员域默认通用审核策略，由历史通用策略迁移生成。",
        },
      });
    } else {
      templateStrategy = {
        ...legacyStrategy,
        code: DEFAULT_CODE,
        name: DEFAULT_NAME,
        description:
          legacyStrategy.description ??
          "管理员域默认通用审核策略，由历史通用策略迁移生成。",
      };
    }
  }

  const targetStrategies = new Map();
  for (const admin of admins) {
    const strategy =
      admin.id === legacyAdmin.id
        ? templateStrategy
        : await ensureCommonStrategyForAdmin(admin, templateStrategy, execute);
    targetStrategies.set(admin.id, strategy);
  }

  const legacyRuns = await prisma.aiReviewStrategyRun.findMany({
    where: {
      strategyId: legacyStrategy.id,
    },
    select: {
      id: true,
      strategyId: true,
      triggeredById: true,
      requestPayload: true,
      parsedResult: true,
      question: {
        select: {
          id: true,
          projectId: true,
        },
      },
      triggeredBy: {
        select: {
          id: true,
          platformRole: true,
          ownerAdminId: true,
        },
      },
    },
  });

  const legacyBatchRuns = await prisma.aiReviewStrategyBatchRun.findMany({
    where: {
      strategyId: legacyStrategy.id,
    },
    select: {
      id: true,
      strategyId: true,
      requestPayload: true,
      projectId: true,
      createdBy: {
        select: {
          id: true,
          platformRole: true,
          ownerAdminId: true,
        },
      },
    },
  });

  const orphanUserFixes = new Map();
  const runMoves = [];
  const batchMoves = [];

  for (const run of legacyRuns) {
    let targetAdminId = resolveAdminScopeFromUser(run.triggeredBy);
    if (!targetAdminId) {
      const project = projectMap.get(run.question.projectId);
      targetAdminId = project?.createdById ?? legacyAdmin.id;
      if (run.triggeredBy?.platformRole === "USER") {
        orphanUserFixes.set(run.triggeredBy.id, targetAdminId);
      }
    }

    const targetStrategy = targetStrategies.get(targetAdminId);
    if (!targetStrategy) {
      throw new Error(`未找到管理员 ${targetAdminId} 的通用策略`);
    }

    runMoves.push({
      runId: run.id,
      fromStrategyId: run.strategyId,
      toStrategyId: targetStrategy.id,
      targetAdminId,
      requestPayload: updateEmbeddedStrategy(run.requestPayload, targetStrategy),
      parsedResult: updateEmbeddedStrategy(run.parsedResult, targetStrategy),
    });
  }

  for (const batchRun of legacyBatchRuns) {
    let targetAdminId = resolveAdminScopeFromUser(batchRun.createdBy);
    if (!targetAdminId) {
      const project = projectMap.get(batchRun.projectId);
      targetAdminId = project?.createdById ?? legacyAdmin.id;
      if (batchRun.createdBy?.platformRole === "USER") {
        orphanUserFixes.set(batchRun.createdBy.id, targetAdminId);
      }
    }

    const targetStrategy = targetStrategies.get(targetAdminId);
    if (!targetStrategy) {
      throw new Error(`未找到管理员 ${targetAdminId} 的通用策略`);
    }

    batchMoves.push({
      batchRunId: batchRun.id,
      fromStrategyId: batchRun.strategyId,
      toStrategyId: targetStrategy.id,
      targetAdminId,
      requestPayload: updateEmbeddedStrategy(
        batchRun.requestPayload,
        targetStrategy,
      ),
    });
  }

  const runMoveSummary = {};
  for (const item of runMoves) {
    const key = item.targetAdminId;
    runMoveSummary[key] = (runMoveSummary[key] ?? 0) + 1;
  }

  const batchMoveSummary = {};
  for (const item of batchMoves) {
    const key = item.targetAdminId;
    batchMoveSummary[key] = (batchMoveSummary[key] ?? 0) + 1;
  }

  const report = {
    mode: execute ? "execute" : "dry-run",
    legacyStrategy: {
      id: legacyStrategy.id,
      scopeAdminId: legacyStrategy.scopeAdminId,
      fromCode: legacyStrategy.code,
      toCode: DEFAULT_CODE,
      fromName: legacyStrategy.name,
      toName: DEFAULT_NAME,
    },
    commonStrategies: admins.map((admin) => {
      const strategy = targetStrategies.get(admin.id);
      return {
        adminId: admin.id,
        username: admin.username,
        platformRole: admin.platformRole,
        strategyId: strategy?.id,
        strategyCode: strategy?.code,
        strategyName: strategy?.name,
      };
    }),
    runMoveSummary,
    batchMoveSummary,
    orphanUserFixes: Array.from(orphanUserFixes.entries()).map(
      ([userId, ownerAdminId]) => ({
        userId,
        username: userMap.get(userId)?.username ?? null,
        ownerAdminId,
        ownerAdminUsername: userMap.get(ownerAdminId)?.username ?? null,
      }),
    ),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!execute) {
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const [userId, ownerAdminId] of orphanUserFixes.entries()) {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          ownerAdminId,
        },
      });
    }

    for (const move of runMoves) {
      await tx.aiReviewStrategyRun.update({
        where: {
          id: move.runId,
        },
        data: {
          strategyId: move.toStrategyId,
          requestPayload: cloneJson(move.requestPayload),
          parsedResult:
            move.parsedResult == null ? move.parsedResult : cloneJson(move.parsedResult),
        },
      });
    }

    for (const move of batchMoves) {
      await tx.aiReviewStrategyBatchRun.update({
        where: {
          id: move.batchRunId,
        },
        data: {
          strategyId: move.toStrategyId,
          requestPayload: cloneJson(move.requestPayload),
        },
      });
    }
  }, {
    maxWait: 10_000,
    timeout: 120_000,
  });

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
