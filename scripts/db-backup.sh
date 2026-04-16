#!/bin/bash

# PostgreSQL 数据库备份和恢复脚本
# 用法:
#   ./scripts/db-backup.sh backup    - 备份数据库
#   ./scripts/db-backup.sh restore <backup_file>   - 恢复数据库

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 从 .env 文件加载配置
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
elif [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
else
    echo -e "${RED}错误: 找不到 .env 文件${NC}"
    exit 1
fi

# 从 DATABASE_URL 解析数据库连接信息
parse_database_url() {
    # 格式: postgresql://user:password@host:port/database?schema=public
    local url="$1"

    # 提取用户名
    DB_USER=$(echo "$url" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')

    # 提取密码
    DB_PASSWORD=$(echo "$url" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

    # 提取主机
    DB_HOST=$(echo "$url" | sed -n 's/.*@\([^:]*\):.*/\1/p')

    # 提取端口
    DB_PORT=$(echo "$url" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

    # 提取数据库名
    DB_NAME=$(echo "$url" | sed -n 's/.*\/\([^?]*\).*/\1/p')
}

# 解析数据库连接信息
if [ -n "$DATABASE_URL" ]; then
    parse_database_url "$DATABASE_URL"
else
    echo -e "${RED}错误: DATABASE_URL 未设置${NC}"
    exit 1
fi

# 备份目录
BACKUP_DIR="/mnt/d/Data/benchmark_platform_bk"
mkdir -p "$BACKUP_DIR"

# 备份函数
backup_database() {
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${BACKUP_DIR}/${DB_NAME}_${timestamp}.backup"

    echo -e "${YELLOW}开始备份数据库: ${DB_NAME}${NC}"
    echo -e "主机: ${DB_HOST}:${DB_PORT}"
    echo -e "用户: ${DB_USER}"

    # 使用 pg_dump 创建自定义格式备份（支持选择性恢复）
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -F c \
        -f "$backup_file"

    if [ $? -eq 0 ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        echo -e "${GREEN}备份成功!${NC}"
        echo -e "备份文件: ${backup_file}"
        echo -e "文件大小: ${size}"

        # 同时生成 SQL 文本格式（可选，方便查看）
        local sql_file="${BACKUP_DIR}/${DB_NAME}_${timestamp}.sql"
        PGPASSWORD="$DB_PASSWORD" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -f "$sql_file"

        echo -e "SQL 文件: ${sql_file}"
    else
        echo -e "${RED}备份失败!${NC}"
        exit 1
    fi
}

# 恢复函数
restore_database() {
    local backup_file="$1"

    if [ -z "$backup_file" ]; then
        echo -e "${RED}错误: 请指定备份文件${NC}"
        echo "用法: $0 restore <backup_file>"
        echo ""
        echo "可用的备份文件:"
        ls -la "${BACKUP_DIR}"/*.backup 2>/dev/null || echo "  (无备份文件)"
        exit 1
    fi

    if [ ! -f "$backup_file" ]; then
        echo -e "${RED}错误: 备份文件不存在: ${backup_file}${NC}"
        exit 1
    fi

    echo -e "${YELLOW}警告: 这将覆盖当前数据库 '${DB_NAME}' 的所有数据!${NC}"
    read -p "确定要继续吗? (y/N): " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "操作已取消"
        exit 0
    fi

    echo -e "${YELLOW}开始恢复数据库: ${DB_NAME}${NC}"
    echo -e "从文件: ${backup_file}"

    # 如果是 .backup 文件（自定义格式）
    if [[ "$backup_file" == *.backup ]]; then
        PGPASSWORD="$DB_PASSWORD" pg_restore \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --clean \
            --if-exists \
            -v \
            "$backup_file"
    # 如果是 .sql 文件
    elif [[ "$backup_file" == *.sql ]]; then
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -f "$backup_file"
    else
        echo -e "${RED}错误: 不支持的备份文件格式${NC}"
        exit 1
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}恢复成功!${NC}"
    else
        echo -e "${RED}恢复过程中出现错误${NC}"
        exit 1
    fi
}

# 列出备份
list_backups() {
    echo -e "${YELLOW}可用的备份文件:${NC}"
    echo ""
    if [ -d "$BACKUP_DIR" ]; then
        ls -la "${BACKUP_DIR}"/*.backup 2>/dev/null || echo "  (无 .backup 文件)"
        echo ""
        ls -la "${BACKUP_DIR}"/*.sql 2>/dev/null || echo "  (无 .sql 文件)"
    else
        echo "  备份目录不存在"
    fi
}

# 帮助信息
show_help() {
    echo "PostgreSQL 数据库备份和恢复工具"
    echo ""
    echo "用法:"
    echo "  $0 backup              备份数据库"
    echo "  $0 restore <file>      从备份文件恢复数据库"
    echo "  $0 list                列出所有备份文件"
    echo ""
    echo "示例:"
    echo "  $0 backup"
    echo "  $0 restore /mnt/d/Data/benchmark_platform_bk/benchmark_platform_20240101_120000.backup"
    echo ""
    echo "环境变量 (从 .env 文件读取):"
    echo "  DATABASE_URL   数据库连接字符串"
}

# 主程序
case "$1" in
    backup)
        backup_database
        ;;
    restore)
        restore_database "$2"
        ;;
    list)
        list_backups
        ;;
    *)
        show_help
        ;;
esac
