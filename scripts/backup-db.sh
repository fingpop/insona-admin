#!/bin/bash
# 数据库本地备份脚本
# 用法: bash scripts/backup-db.sh [保留天数，默认7]

set -e

DB_PATH="prisma/dev.db"
BACKUP_DIR="data/backups"
KEEP_DAYS="${1:-7}"

if [ ! -f "$DB_PATH" ]; then
  echo "❌ 数据库文件不存在: $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/dev.db.$TIMESTAMP"

# 使用 SQLite 的 .backup 命令确保一致性（避免复制时数据损坏）
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
  # 回退：直接复制（开发环境可接受）
  cp "$DB_PATH" "$BACKUP_FILE"
fi

# 压缩
gzip "$BACKUP_FILE"

SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "✅ 备份完成: ${BACKUP_FILE}.gz ($SIZE)"

# 清理过期备份
DELETED=$(find "$BACKUP_DIR" -name "dev.db.*.gz" -mtime +"$KEEP_DAYS" -delete -print | wc -l | tr -d ' ')
if [ "$DELETED" -gt 0 ]; then
  echo "🗑  已清理 $DELETED 个超过 ${KEEP_DAYS} 天的旧备份"
fi

# 显示当前所有备份
echo ""
echo "当前备份列表："
ls -lh "$BACKUP_DIR"/dev.db.*.gz 2>/dev/null | awk '{print "  " $5 "  " $9}'
