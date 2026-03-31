#!/usr/bin/env node
/**
 * 能耗数据分析脚本
 * 检查 ECC57FB5134F00 设备的能耗上报序号是否连续
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'energy_events.log');

if (!fs.existsSync(LOG_FILE)) {
  console.log('❌ 日志文件不存在:', LOG_FILE);
  process.exit(1);
}

const content = fs.readFileSync(LOG_FILE, 'utf8');
const lines = content.trim().split('\n').filter(line => line.trim());

console.log('='.repeat(80));
console.log('能耗数据分析报告');
console.log('='.repeat(80));
console.log(`日志文件: ${LOG_FILE}`);
console.log(`总记录数: ${lines.length}`);
console.log('');

// 解析所有记录
const records = [];
let prevLatestSeq = null;
let gaps = [];

lines.forEach((line, idx) => {
  // 提取时间戳
  const timeMatch = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/);
  const timestamp = timeMatch ? timeMatch[1] : 'unknown';

  // 提取 JSON 数据
  const jsonMatch = line.match(/\{.*\}/);
  if (!jsonMatch) return;

  try {
    const data = JSON.parse(jsonMatch[0]);
    const energy = data.energy;

    if (energy && Array.isArray(energy)) {
      // 提取所有序号
      const sequences = [];
      for (let i = 0; i < energy.length; i += 2) {
        sequences.push({
          seq: energy[i],
          percent: energy[i + 1]
        });
      }

      // 提取最新序号（数组第一个）
      const latestSeq = sequences[0]?.seq;

      if (latestSeq !== undefined) {
        records.push({
          time: timestamp,
          line: idx + 1,
          uuid: data.uuid,
          latestSeq,
          allSequences: sequences
        });

        // 检查最新序号的连续性（跨上报）
        if (prevLatestSeq !== null && latestSeq !== prevLatestSeq + 1) {
          const gap = latestSeq - prevLatestSeq - 1;
          if (gap > 0) {
            gaps.push({
              time: timestamp,
              line: idx + 1,
              from: prevLatestSeq,
              to: latestSeq,
              missing: gap
            });
          }
        }
        prevLatestSeq = latestSeq;
      }
    }
  } catch (err) {
    console.error(`解析失败 (行 ${idx + 1}):`, err.message);
  }
});

// 统计信息
console.log('📊 统计信息');
console.log('-'.repeat(80));
console.log(`解析成功: ${records.length} 条`);
if (records.length > 0) {
  const firstSeq = records[0].latestSeq;
  const lastSeq = records[records.length - 1].latestSeq;
  console.log(`最新序号范围: ${firstSeq} → ${lastSeq}`);
  console.log(`序号增量: ${lastSeq - firstSeq} (预期: ${records.length - 1})`);
  console.log(`上报周期: 约3分钟/次`);
  console.log(`每次包含: 9个历史数据点`);
}
console.log('');

// 显示丢失数据
if (gaps.length > 0) {
  console.log('⚠️  检测到数据丢失');
  console.log('-'.repeat(80));
  console.log(`丢失次数: ${gaps.length}`);
  console.log(`丢失总数: ${gaps.reduce((sum, g) => sum + g.missing, 0)} 条`);
  console.log('');

  console.log('丢失详情:');
  gaps.slice(0, 20).forEach((gap, idx) => {
    console.log(`  [${idx + 1}] 时间: ${gap.time}, 行号: ${gap.line}`);
    console.log(`      序号 ${gap.from} → ${gap.to}, 丢失 ${gap.missing} 条`);
  });

  if (gaps.length > 20) {
    console.log(`  ... 还有 ${gaps.length - 20} 条丢失记录未显示`);
  }
} else {
  console.log('✅ 未检测到数据丢失，所有序号连续');
}

console.log('');

// 显示最近10条记录
console.log('📋 最近10条记录');
console.log('-'.repeat(80));
records.slice(-10).forEach((rec, idx) => {
  const seqStr = rec.allSequences.slice(0, 3).map(s => `${s.seq}(${s.percent}%)`).join(', ');
  console.log(`[${rec.time}] UUID:${rec.uuid} 最新序号:${rec.latestSeq}`);
  console.log(`  前3个: [${seqStr}${rec.allSequences.length > 3 ? ', ...' : ''}] (共${rec.allSequences.length}个)`);
});

console.log('');
console.log('='.repeat(80));