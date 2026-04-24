#!/bin/bash
#
# deploy/update.sh — 服务器端在线升级脚本
#
# 用途: 在部署目标服务器上拉取最新镜像并更新容器
# 用法:
#   bash deploy/update.sh                    # 使用默认配置
#   REGISTRY=xxx bash deploy/update.sh       # 指定镜像仓库
#

set -e

# ─── 配置 ───
REGISTRY="${REGISTRY:-registry.cn-hangzhou.aliyuncs.com/your-namespace}"
IMAGE_NAME="${IMAGE_NAME:-insona-admin}"
TAG="${TAG:-latest}"
DEPLOY_DIR="${DEPLOY_DIR:-.}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$DEPLOY_DIR"

echo "============================================"
echo "  inSona Admin — 在线升级"
echo "============================================"
echo ""

# ─── Step 1: 检查前置 ───
command -v docker >/dev/null 2>&1 || { echo "[ERROR] Docker 未安装"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "[ERROR] Docker Compose 未安装"; exit 1; }

echo "[1/4] 当前版本:"
CURRENT_VERSION=$(docker exec insona-admin-nodejs-1 node -e "try{console.log(require('./VERSION'))}catch{console.log('unknown')}" 2>/dev/null || echo "unknown")
echo "  当前版本: $CURRENT_VERSION"

# ─── Step 2: 备份数据库 ───
echo "[2/4] 备份数据库..."
if [[ -f "data/dev.db" ]]; then
    BACKUP_FILE="data/dev.db.backup.$(date +%Y%m%d_%H%M%S)"
    cp data/dev.db "$BACKUP_FILE"
    echo "  已备份: $BACKUP_FILE"
else
    echo "  [WARN] 未找到数据库文件，跳过备份"
fi

# ─── Step 3: 拉取最新镜像 ───
echo "[3/4] 拉取最新镜像..."
docker compose -f "$COMPOSE_FILE" pull
echo "  OK"

# ─── Step 4: 重启容器 ───
echo "[4/4] 重启容器..."
docker compose -f "$COMPOSE_FILE" up -d
echo "  OK"

echo ""
echo "============================================"
echo "  升级完成!"
echo "============================================"
echo ""
echo "  等待服务就绪..."
sleep 5
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "  查看日志: docker compose -f $COMPOSE_FILE logs --tail=30"
