#!/bin/bash
# 能耗上报1小时监控脚本
# 监控设备 ECC57FB5134F00 的能耗上报情况

LOG_FILE="/Volumes/VM/AICODING/商照管理后台/energy_test.log"
DEVICE_ID="ECC57FB5134F00"
DURATION=3600  # 1小时（秒）

echo "=== 能耗上报测试开始 ===" | tee "$LOG_FILE"
echo "设备ID: $DEVICE_ID" | tee -a "$LOG_FILE"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "测试时长: 1小时" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 启动时间
START_TIME=$(date +%s)
COUNT=0
TOTAL_KWH=0

# 监控 Next.js 开发服务器的日志输出
# 通过 grep 过滤该设备的能耗上报
tail -f /dev/stdin 2>/dev/null | while read -r line; do
    if [[ "$line" == *"[ENERGY API]"* ]] && [[ "$line" == *"ECC57FB5134F00"* ]]; then
        # 记录上报
        COUNT=$((COUNT + 1))
        echo "[$(date '+%H:%M:%S')] 上报 #$COUNT: $line" | tee -a "$LOG_FILE"

        # 提取 energyKwh 值（从日志中）
        ENERGY_KWH=$(echo "$line" | grep -oP 'energyKwh[=:]\s*\K[\d.]+')
        if [[ -n "$ENERGY_KWH" ]]; then
            TOTAL_KWH=$(awk "BEGIN {print $TOTAL_KWH + $ENERGY_KWH}")
        fi

        # 检查是否超时
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        if [[ $ELAPSED -ge $DURATION ]]; then
            echo "" | tee -a "$LOG_FILE"
            echo "=== 测试结束 ===" | tee -a "$LOG_FILE"
            echo "结束时间: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
            echo "总上报次数: $COUNT" | tee -a "$LOG_FILE"
            echo "累计能耗: $TOTAL_KWH kWh" | tee -a "$LOG_FILE"
            exit 0
        fi
    fi
done

# 简化版：直接监控数据库变化
echo "等待能耗上报..." | tee -a "$LOG_FILE"
for i in {1..60}; do
    sleep 60
    RESULT=$(sqlite3 /Volumes/VM/AICODING/商照管理后台/prisma/dev.db \
        "SELECT COUNT(*), SUM(kwh), MAX(peakWatts) FROM EnergyRecord WHERE deviceId='$DEVICE_ID' AND date='$(date +%Y-%m-%d)';")
    echo "[分钟 $i] 数据库状态: $RESULT" | tee -a "$LOG_FILE"

    if [[ $i -eq 60 ]]; then
        echo "" | tee -a "$LOG_FILE"
        echo "=== 1小时测试完成 ===" | tee -a "$LOG_FILE"
        echo "结束时间: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
        sqlite3 -header -column /Volumes/VM/AICODING/商照管理后台/prisma/dev.db \
            "SELECT * FROM EnergyRecord WHERE deviceId='$DEVICE_ID' ORDER BY date DESC;" | tee -a "$LOG_FILE"
    fi
done