#!/bin/bash
#
# scripts/build-push.sh — 多架构构建 & 推送到阿里云 Container Registry
#
# 用法:
#   bash scripts/build-push.sh                    # 推送 latest
#   bash scripts/build-push.sh v1.0.0             # 推送指定标签
#   bash scripts/build-push.sh v1.0.0 --no-push   # 仅构建，不推送
#
# 前置条件:
#   - Docker Buildx 已安装 (Docker Desktop 默认包含)
#   - 已登录阿里云 Registry: docker login --username=xxx registry.cn-hangzhou.aliyuncs.com
#
# 配置镜像仓库地址 (修改为实际的 ACR 地址):
#   export REGISTRY=registry.cn-hangzhou.aliyuncs.com/your-namespace

set -e

# ─── 配置 ───
REGISTRY="${REGISTRY:-registry.cn-hangzhou.aliyuncs.com/insona}"
IMAGE_NAME="insona-admin"
PLATFORMS="linux/amd64,linux/arm64"
TAG="${1:-latest}"
PUSH_FLAG="${2:-}"

# 读取项目版本号
VERSION=$(cat VERSION 2>/dev/null | tr -d '[:space:]')
if [[ -n "$VERSION" && "$TAG" == "latest" ]]; then
    TAG="$VERSION"
    echo "[INFO] 使用项目版本号作为标签: $TAG"
fi

FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo "============================================"
echo "  inSona Admin — 多架构构建"
echo "============================================"
echo ""
echo "  镜像:  ${FULL_IMAGE}"
echo "  平台:  ${PLATFORMS}"
echo ""

# ─── Step 1: 确保 Buildx builder 存在 ───
echo "[1/4] 检查 Buildx builder..."
if ! docker buildx inspect multiarch >/dev/null 2>&1; then
    echo "  创建 multiarch builder..."
    docker buildx create --name multiarch --use --driver docker-container
else
    docker buildx use multiarch
fi
echo "  OK"

# ─── Step 2: 检查登录状态 ───
echo "[2/4] 检查 Registry 登录..."
if ! docker login --username="${ALIYUN_REGISTRY_USER:-}" --password-stdin registry.cn-hangzhou.aliyuncs.com <<< "${ALIYUN_REGISTRY_PASSWORD:-}" 2>/dev/null; then
    echo "  [WARN] 未登录阿里云 Registry"
    echo "  请先执行: docker login --username=YOUR_USER registry.cn-hangzhou.aliyuncs.com"
    if [[ "${SKIP_LOGIN_CHECK:-0}" != "1" ]]; then
        read -p "  是否继续构建？(y/N): " confirm
        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            exit 1
        fi
    fi
fi

# ─── Step 3: 构建 & 推送 ───
echo "[3/4] 构建镜像..."
if [[ "$PUSH_FLAG" == "--no-push" ]]; then
    echo "  [INFO] 仅构建，不推送"
    docker buildx build \
        --platform "$PLATFORMS" \
        --load \
        -t "${IMAGE_NAME}:${TAG}" \
        .
else
    echo "  构建并推送到 ${FULL_IMAGE}..."
    docker buildx build \
        --platform "$PLATFORMS" \
        --push \
        -t "$FULL_IMAGE" \
        -t "${REGISTRY}/${IMAGE_NAME}:latest" \
        .
fi
echo "  OK"

# ─── Step 4: 验证 ───
if [[ "$PUSH_FLAG" != "--no-push" ]]; then
    echo "[4/4] 验证推送..."
    echo "  拉取 manifest 验证:"
    docker buildx imagetools inspect "$FULL_IMAGE" | head -10
    echo ""
    echo "============================================"
    echo "  构建完成!"
    echo "============================================"
    echo ""
    echo "  目标镜像:"
    echo "    ${FULL_IMAGE}"
    echo "    ${REGISTRY}/${IMAGE_NAME}:latest"
    echo ""
    echo "  部署到目标设备:"
    echo "    docker run -d -p 3000:3000 --name insona-admin ${FULL_IMAGE}"
    echo ""
else
    echo ""
    echo "============================================"
    echo "  本地构建完成!"
    echo "============================================"
    echo ""
    echo "  本地镜像: ${IMAGE_NAME}:${TAG}"
    echo "  测试运行: docker run -d -p 3000:3000 ${IMAGE_NAME}:${TAG}"
    echo ""
fi
