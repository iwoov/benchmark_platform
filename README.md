# Benchmark Platform

## 本地开发

1. 准备本地 PostgreSQL，并确保 `5432` 可访问
2. 复制环境变量模板并按需修改
3. 执行 Prisma migration 与 seed
4. 启动开发服务器

```bash
cp .env.example .env
pnpm prisma:migrate --name init
pnpm seed
pnpm dev
```

## 文档

- `docs/requirements.md`
- `docs/tech_selection.md`
- `docs/database_design.md`
- `docs/admin_navigation.md`
- `docs/permission-model.md`

## 超级管理员账号

超级管理员账号由 `.env` 控制：

```env
ADMIN_NAME="Platform Admin"
ADMIN_USERNAME="admin"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123456"
```

`pnpm seed` 会根据这些环境变量创建或更新超级管理员账号。

## 检查与排错

如果 IDE 里出现 Prisma 字段类型没有同步、`@/...` 路径识别异常或旧的 TypeScript 报错，可以先执行：

```bash
pnpm prisma:generate
pnpm typecheck
pnpm lint
```

如果命令行已经通过，但 IDE 还显示旧报错，通常是本地 TypeScript Server 或 Prisma 类型缓存未刷新。此时建议：

1. 重启 IDE 的 TypeScript Server
2. 重新打开项目目录
3. 再启动开发服务 `pnpm dev`
