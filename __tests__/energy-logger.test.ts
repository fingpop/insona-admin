import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('EnergyLogger', () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'energy-log-test-'));
    logFile = path.join(tmpDir, 'energy.log');
    process.env.LOG_PATH = logFile;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.LOG_PATH;
    vi.restoreAllMocks();
  });

  it('writes one JSON line per call', async () => {
    const { logEnergyEvent } = await import('@/lib/gateway/EnergyLogger');

    logEnergyEvent({ did: 'ABC123', power: 100, percent: 50, period: 5, energy: [1, 80, 2, 90] });

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
  });

  it('writes valid JSON parseable with JSON.parse', async () => {
    const { logEnergyEvent } = await import('@/lib/gateway/EnergyLogger');

    logEnergyEvent({ did: 'ABC123', power: 100, percent: 50, period: 5, energy: [1, 80] });

    const content = fs.readFileSync(logFile, 'utf8').trim();
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('deviceId', 'ABC123');
    expect(parsed).toHaveProperty('power', 100);
    expect(parsed).toHaveProperty('percent', 50);
    expect(parsed).toHaveProperty('period', 5);
    expect(parsed).toHaveProperty('energy', [1, 80]);
  });

  it('creates log directory automatically if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'logs');
    const nestedFile = path.join(nestedDir, 'energy.log');
    process.env.LOG_PATH = nestedFile;
    vi.resetModules();

    const { logEnergyEvent } = await import('@/lib/gateway/EnergyLogger');

    logEnergyEvent({ did: 'XYZ', power: 50, percent: 100 });

    expect(fs.existsSync(nestedFile)).toBe(true);
  });

  it('appends multiple calls as separate lines', async () => {
    const { logEnergyEvent } = await import('@/lib/gateway/EnergyLogger');

    logEnergyEvent({ did: 'DEV1', power: 100 });
    logEnergyEvent({ did: 'DEV2', power: 200 });

    const content = fs.readFileSync(logFile, 'utf8').trim();
    const lines = content.split('\n');
    expect(lines.length).toBe(2);

    const line1 = JSON.parse(lines[0]);
    const line2 = JSON.parse(lines[1]);
    expect(line1.deviceId).toBe('DEV1');
    expect(line2.deviceId).toBe('DEV2');
  });

  it('handles write errors gracefully without throwing', async () => {
    // Set an invalid path to trigger write error
    process.env.LOG_PATH = '/dev/null/impossible/path/energy.log';
    vi.resetModules();

    const { logEnergyEvent } = await import('@/lib/gateway/EnergyLogger');

    // Should not throw even when write fails
    expect(() => logEnergyEvent({ did: 'TEST', power: 100 })).not.toThrow();
  });
});
