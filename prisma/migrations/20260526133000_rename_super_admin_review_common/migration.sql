WITH duplicate_shared_strategy AS (
    SELECT
        old_strategy.id AS old_id,
        shared_strategy.id AS shared_id
    FROM "AiReviewStrategy" old_strategy
    INNER JOIN "User" scope_admin
        ON scope_admin.id = old_strategy."scopeAdminId"
    INNER JOIN "AiReviewStrategy" shared_strategy
        ON shared_strategy."scopeAdminId" = old_strategy."scopeAdminId"
        AND shared_strategy.code = 'review_common_admin'
    WHERE old_strategy.code = 'review_common'
        AND scope_admin."platformRole" = 'SUPER_ADMIN'
)
UPDATE "AiReviewStrategyRun" run
SET "strategyId" = duplicate_shared_strategy.shared_id
FROM duplicate_shared_strategy
WHERE run."strategyId" = duplicate_shared_strategy.old_id;

WITH duplicate_shared_strategy AS (
    SELECT
        old_strategy.id AS old_id,
        shared_strategy.id AS shared_id
    FROM "AiReviewStrategy" old_strategy
    INNER JOIN "User" scope_admin
        ON scope_admin.id = old_strategy."scopeAdminId"
    INNER JOIN "AiReviewStrategy" shared_strategy
        ON shared_strategy."scopeAdminId" = old_strategy."scopeAdminId"
        AND shared_strategy.code = 'review_common_admin'
    WHERE old_strategy.code = 'review_common'
        AND scope_admin."platformRole" = 'SUPER_ADMIN'
)
UPDATE "AiReviewStrategyBatchRun" batch_run
SET "strategyId" = duplicate_shared_strategy.shared_id
FROM duplicate_shared_strategy
WHERE batch_run."strategyId" = duplicate_shared_strategy.old_id;

WITH duplicate_shared_strategy AS (
    SELECT old_strategy.id AS old_id
    FROM "AiReviewStrategy" old_strategy
    INNER JOIN "User" scope_admin
        ON scope_admin.id = old_strategy."scopeAdminId"
    INNER JOIN "AiReviewStrategy" shared_strategy
        ON shared_strategy."scopeAdminId" = old_strategy."scopeAdminId"
        AND shared_strategy.code = 'review_common_admin'
    WHERE old_strategy.code = 'review_common'
        AND scope_admin."platformRole" = 'SUPER_ADMIN'
)
DELETE FROM "AiReviewStrategy" old_strategy
USING duplicate_shared_strategy
WHERE old_strategy.id = duplicate_shared_strategy.old_id;

UPDATE "AiReviewStrategy" strategy
SET
    code = 'review_common_admin',
    name = CASE
        WHEN strategy.name = '审核策略-通用' THEN '审核策略-通用(admin)'
        ELSE strategy.name
    END,
    description = COALESCE(
        strategy.description,
        '超级管理员共享通用审核策略，可供普通审核用户跨管理员域查看和执行。'
    )
FROM "User" scope_admin
WHERE scope_admin.id = strategy."scopeAdminId"
    AND scope_admin."platformRole" = 'SUPER_ADMIN'
    AND strategy.code = 'review_common';
