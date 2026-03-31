#!/bin/bash

LOG_FILE="/Volumes/VM/AICODING/商照管理后台/energy_test_$(date +%Y%m%d_%H%M%S).log"
DEVICE_ID="ECC57FB5134F00"

echo "=== 能耗上报1小时监控测试 ===" > "$LOG_FILE"
echo "设备ID: $DEVICE_ID" >> "$LOG_FILE"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
echo "测试时长: 60分钟" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

for minute in {1..60}; do
    sleep 60
    
    # 查询当前数据
    RESULT=$(sqlite3 /Volumes/VM/AICODING/商照管理后台/prisma/dev.db \
        "SELECT kwh, peakWatts FROM EnergyRecord WHERE deviceId='$DEVICE_ID' AND date='$(date +%Y-%m-%d)';")
    
    if [[ -n "$RESULT" ]]; then
        KWH=$(echo "$RESULT" | cut -d'|' -f1)
        PEAK=$(echo "$RESULT" | cut -d'|' -f2)
        echo "[分钟 $minute] $(date '+%H:%M:%S') | 累计能耗: $KWH kWh | 峰值功率: $PEAK W" >> "$LOG_FILE"
    else
        echo "[分钟 $minute] $(date '+%H:%M:%S') | 无数据上报" >> "$LOG_FILE"
    fi
done

echo "" >> "$LOG_FILE"
echo "=== 测试结束 ===" >> "$LOG_FILE"
echo "结束时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"

# 最终统计
echo "" >> "$LOG_FILE"
echo "=== 最终数据 ===" >> "$LOG_FILE"
sqlite3 -header -column /Volumes/VM/AICODING/商照管理后台/prisma/dev.db \
    "SELECT deviceId, date, kwh, peakWatts FROM EnergyRecord WHERE deviceId='$DEVICE_ID';" >> "$LOG_FILE"

echo "" >> "$LOG_FILE"
echo "日志已保存到: $LOG_FILE" >> "$LOG_FILE"
