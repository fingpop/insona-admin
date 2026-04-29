#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/data/runtime"
LOG_DIR="$PROJECT_DIR/data/logs"
SUPERVISOR_PID_FILE="$RUNTIME_DIR/dev-keepalive.pid"
APP_PID_FILE="$RUNTIME_DIR/dev-app.pid"
OUT_LOG="$LOG_DIR/dev-keepalive.out.log"
ERR_LOG="$LOG_DIR/dev-keepalive.err.log"
DEFAULT_PORT="${PORT:-3000}"
RESTART_DELAY="${RESTART_DELAY:-3}"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  echo "[$(timestamp)] $*" | tee -a "$OUT_LOG"
}

is_pid_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [ -f "$file" ]; then
    tr -d '[:space:]' < "$file"
  fi
}

stop_app_process() {
  local pid
  pid="$(read_pid "$APP_PID_FILE")"

  if [ -n "${pid:-}" ] && is_pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      if ! is_pid_running "$pid"; then
        break
      fi
      sleep 1
    done
    if is_pid_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$APP_PID_FILE"
}

run_loop() {
  echo "$$" > "$SUPERVISOR_PID_FILE"
  trap 'log "收到停止信号，准备退出"; stop_app_process; rm -f "$SUPERVISOR_PID_FILE"; exit 0' INT TERM

  cd "$PROJECT_DIR" || exit 1
  log "dev 保活进程启动，项目目录: $PROJECT_DIR，端口: $DEFAULT_PORT"

  while true; do
    log "启动 npm run dev"
    PORT="$DEFAULT_PORT" npm run dev >> "$OUT_LOG" 2>> "$ERR_LOG" &
    local app_pid=$!
    echo "$app_pid" > "$APP_PID_FILE"
    wait "$app_pid"
    local exit_code=$?

    rm -f "$APP_PID_FILE"

    if [ ! -f "$SUPERVISOR_PID_FILE" ]; then
      exit 0
    fi

    log "npm run dev 已退出，退出码: $exit_code，${RESTART_DELAY}s 后重启"
    sleep "$RESTART_DELAY"
  done
}

start_background() {
  local supervisor_pid
  supervisor_pid="$(read_pid "$SUPERVISOR_PID_FILE")"

  if [ -n "${supervisor_pid:-}" ] && is_pid_running "$supervisor_pid"; then
    echo "dev 保活进程已在运行，PID: $supervisor_pid"
    exit 0
  fi

  nohup "$0" run >/dev/null 2>&1 &
  sleep 1

  supervisor_pid="$(read_pid "$SUPERVISOR_PID_FILE")"
  if [ -n "${supervisor_pid:-}" ] && is_pid_running "$supervisor_pid"; then
    echo "dev 保活进程已启动，PID: $supervisor_pid"
  else
    echo "dev 保活进程启动失败，请检查日志: $OUT_LOG / $ERR_LOG" >&2
    exit 1
  fi
}

stop_background() {
  local supervisor_pid
  supervisor_pid="$(read_pid "$SUPERVISOR_PID_FILE")"

  if [ -z "${supervisor_pid:-}" ] || ! is_pid_running "$supervisor_pid"; then
    stop_app_process
    rm -f "$SUPERVISOR_PID_FILE"
    echo "dev 保活进程未运行"
    exit 0
  fi

  kill "$supervisor_pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! is_pid_running "$supervisor_pid"; then
      break
    fi
    sleep 1
  done
  if is_pid_running "$supervisor_pid"; then
    kill -9 "$supervisor_pid" 2>/dev/null || true
  fi

  stop_app_process
  rm -f "$SUPERVISOR_PID_FILE"
  echo "dev 保活进程已停止"
}

show_status() {
  local supervisor_pid app_pid
  supervisor_pid="$(read_pid "$SUPERVISOR_PID_FILE")"
  app_pid="$(read_pid "$APP_PID_FILE")"

  if [ -n "${supervisor_pid:-}" ] && is_pid_running "$supervisor_pid"; then
    echo "Supervisor: running (PID: $supervisor_pid)"
  else
    echo "Supervisor: stopped"
  fi

  if [ -n "${app_pid:-}" ] && is_pid_running "$app_pid"; then
    echo "App: running (PID: $app_pid)"
  else
    echo "App: stopped"
  fi

  echo "Out log: $OUT_LOG"
  echo "Err log: $ERR_LOG"
  echo "Port: $DEFAULT_PORT"
}

show_logs() {
  tail -f "$OUT_LOG" "$ERR_LOG"
}

case "${1:-}" in
  start)
    start_background
    ;;
  stop)
    stop_background
    ;;
  restart)
    stop_background
    start_background
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  run)
    run_loop
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status|logs|run}"
    exit 1
    ;;
esac
