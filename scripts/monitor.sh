#!/bin/bash
# 能耗监控系统管理工具

PROJECT_DIR="/Volumes/VM/AICODING/商照管理后台"
PID_FILE="/tmp/nextjs_dev.pid"

show_status() {
  echo "📊 系统状态"
  echo "────────────────────────────────────────"

  # 服务状态
  if [ -f "$PID_FILE" ] && ps -p "$(cat $PID_FILE)" > /dev/null 2>&1; then
    PID=$(cat "$PID_FILE")
    echo "✅ 服务运行中 (PID: $PID)"
  else
    echo "❌ 服务未运行"
  fi

  # 网关状态
  GATEWAY_STATUS=$(sqlite3 "$PROJECT_DIR/prisma/dev.db" "SELECT status FROM Gateway WHERE id='default';" 2>/dev/null)
  if [ -n "$GATEWAY_STATUS" ]; then
    echo "🔌 网关状态: $GATEWAY_STATUS"
  fi

  # 能耗记录统计
  if [ -f "$PROJECT_DIR/energy_events.log" ]; then
    COUNT=$(wc -l < "$PROJECT_DIR/energy_events.log" | tr -d ' ')
    echo "📝 能耗记录数: $COUNT"

    # 最新记录时间
    LAST_LINE=$(tail -1 "$PROJECT_DIR/energy_events.log")
    TIME=$(echo "$LAST_LINE" | grep -oE '\[([0-9:]+)\]' | head -1)
    echo "🕐 最新记录: $TIME"
  else
    echo "⚠️  能耗日志不存在"
  fi

  echo ""
}

show_logs() {
  echo "📋 最近能耗记录"
  echo "────────────────────────────────────────"
  if [ -f "$PROJECT_DIR/energy_events.log" ]; then
    tail -5 "$PROJECT_DIR/energy_events.log"
  else
    echo "日志文件不存在"
  fi
  echo ""
}

analyze_data() {
  echo "📈 数据分析"
  echo "────────────────────────────────────────"
  node "$PROJECT_DIR/scripts/analyze_energy_log.js"
}

restart_service() {
  echo "🔄 重启服务"
  echo "────────────────────────────────────────"

  # 停止
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
      kill "$OLD_PID"
      echo "已停止旧进程 (PID: $OLD_PID)"
    fi
  fi

  # 启动
  cd "$PROJECT_DIR"
  nohup npm run dev > "$PROJECT_DIR/dev.log" 2>&1 &
  NEW_PID=$!
  echo "$NEW_PID" > "$PID_FILE"
  echo "已启动新进程 (PID: $NEW_PID)"

  sleep 5
  if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ 服务重启成功"
  else
    echo "❌ 服务启动失败"
  fi
  echo ""
}

case "$1" in
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  analyze)
    analyze_data
    ;;
  restart)
    restart_service
    ;;
  *)
    echo "能耗监控系统管理工具"
    echo ""
    echo "用法: $0 {status|logs|analyze|restart}"
    echo ""
    echo "命令说明:"
    echo "  status   - 查看系统状态"
    echo "  logs     - 查看最近能耗记录"
    echo "  analyze  - 分析数据完整性"
    echo "  restart  - 重启服务"
    echo ""
    show_status
    ;;
esac