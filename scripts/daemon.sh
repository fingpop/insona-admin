#!/bin/bash
# 能耗监控系统守护脚本
# 定期检查服务状态，自动重启

PROJECT_DIR="/Volumes/VM/AICODING/商照管理后台"
LOG_DIR="$PROJECT_DIR"
PID_FILE="/tmp/nextjs_dev.pid"
LOG_FILE="$LOG_DIR/daemon.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_service() {
  # 检查进程是否存在
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      return 0  # 进程运行中
    fi
  fi
  return 1  # 进程不存在
}

check_health() {
  # 检查HTTP服务是否响应
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    return 0
  fi
  return 1
}

start_service() {
  log "正在启动服务..."
  cd "$PROJECT_DIR"

  # 停止旧进程
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
      kill "$OLD_PID" 2>/dev/null
      sleep 2
    fi
  fi

  # 启动新进程
  nohup npm run dev > "$LOG_DIR/dev.log" 2>&1 &
  NEW_PID=$!
  echo "$NEW_PID" > "$PID_FILE"

  sleep 5

  if check_health; then
    log "✅ 服务启动成功 (PID: $NEW_PID)"
    return 0
  else
    log "❌ 服务启动失败"
    return 1
  fi
}

check_energy_logging() {
  # 检查能耗日志是否在更新
  ENERGY_LOG="$PROJECT_DIR/energy_events.log"

  if [ ! -f "$ENERGY_LOG" ]; then
    log "⚠️  能耗日志文件不存在"
    return 1
  fi

  # 检查最近5分钟是否有新数据
  LAST_MOD=$(stat -f %m "$ENERGY_LOG" 2>/dev/null || stat -c %Y "$ENERGY_LOG" 2>/dev/null)
  CURRENT_TIME=$(date +%s)
  AGE=$((CURRENT_TIME - LAST_MOD))

  if [ $AGE -gt 300 ]; then
    log "⚠️  能耗日志超过5分钟未更新"
    return 1
  fi

  return 0
}

# 主循环
log "============================================================"
log "能耗监控守护进程启动"
log "============================================================"

while true; do
  # 每分钟检查一次
  sleep 60

  # 检查服务状态
  if ! check_service; then
    log "⚠️  服务进程不存在，正在重启..."
    start_service
    continue
  fi

  if ! check_health; then
    log "⚠️  服务无响应，正在重启..."
    start_service
    continue
  fi

  # 检查能耗日志
  if ! check_energy_logging; then
    log "⚠️  能耗记录可能异常"
  fi

  # 记录状态（每小时一次）
  MINUTE=$(date +%M)
  if [ "$MINUTE" == "00" ]; then
    ENERGY_COUNT=$(wc -l < "$PROJECT_DIR/energy_events.log" 2>/dev/null || echo 0)
    log "📊 状态正常 | 能耗记录数: $ENERGY_COUNT"
  fi
done