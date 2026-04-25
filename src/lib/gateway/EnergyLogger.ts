import fs from 'fs';
import path from 'path';

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'data', 'logs', 'energy.log')
const LOG_PATH = process.env.LOG_PATH || DEFAULT_LOG_PATH
const LOG_DIR = path.dirname(LOG_PATH)

// Ensure log directory exists (runs once on module import)
try {
  fs.mkdirSync(LOG_DIR, { recursive: true })
} catch {
}

/**
 * Append one energy event to the log file in JSON-lines format.
 * Each call produces one line of valid JSON.
 * On write failure, logs to console.error instead of throwing.
 */
export function logEnergyEvent(msg: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    deviceId: msg.did,
    power: msg.power,
    percent: msg.percent,
    period: msg.period,
    meshid: msg.meshid,
    energy: msg.energy
  }

  const line = JSON.stringify(entry) + '\n'

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_PATH, line, 'utf8')
  } catch (err) {
    console.error('[EnergyLogger] Write failed:', err)
  }
}
