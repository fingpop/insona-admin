#!/usr/bin/env node
/**
 * 简单的调度脚本 - 每分钟调用 /api/scheduler/tick
 *
 * 使用方法：
 * 1. 确保开发服务器已启动 (npm run dev)
 * 2. 运行此脚本: node scripts/scheduler.js
 *
 * 或者在 package.json 中添加：
 * "scripts": {
 *   "scheduler": "node scripts/scheduler.js"
 * }
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function tick() {
  const now = new Date().toLocaleString('zh-CN');
  try {
    const res = await fetch(`${BASE_URL}/api/scheduler/tick`);
    const data = await res.json();
    console.log(`[${now}] Tick: executed=${data.executed}, errors=${data.errors}, skipped=${data.skipped}`);
  } catch (err) {
    console.error(`[${now}] Tick failed:`, err.message);
  }
}

// 立即执行一次
tick();

// 每分钟执行一次
setInterval(tick, 60_000);

console.log(`Scheduler started. Calling ${BASE_URL}/api/scheduler/tick every minute...`);
console.log('Press Ctrl+C to stop.');