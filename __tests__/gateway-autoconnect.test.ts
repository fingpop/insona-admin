import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('instrumentation gateway auto-connect', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear any cached env vars
    delete process.env.GATEWAY_IP;
    delete process.env.GATEWAY_PORT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects to gateway when GATEWAY_IP is set', async () => {
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    const mockGatewayService = { connect: mockConnect };

    // Mock the GatewayService module
    vi.doMock('@/lib/gateway/GatewayService', () => ({
      gatewayService: mockGatewayService,
    }));

    // Mock the scheduler
    vi.doMock('@/lib/scheduler/BackgroundScheduler', () => ({
      startScheduler: vi.fn(),
    }));

    process.env.GATEWAY_IP = '192.168.1.100';
    process.env.GATEWAY_PORT = '8091';

    const { tryConnectGateway } = await import('@/lib/gateway/autoConnect');

    await tryConnectGateway();

    expect(mockConnect).toHaveBeenCalledWith('192.168.1.100', 8091);
  });

  it('skips connection and warns when GATEWAY_IP is not set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockConnect = vi.fn();
    vi.doMock('@/lib/gateway/GatewayService', () => ({
      gatewayService: { connect: mockConnect },
    }));

    vi.doMock('@/lib/scheduler/BackgroundScheduler', () => ({
      startScheduler: vi.fn(),
    }));

    // GATEWAY_IP not set
    delete process.env.GATEWAY_IP;

    const { tryConnectGateway } = await import('@/lib/gateway/autoConnect');

    await tryConnectGateway();

    expect(mockConnect).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GATEWAY_IP')
    );
  });

  it('catches connection errors without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockConnect = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.doMock('@/lib/gateway/GatewayService', () => ({
      gatewayService: { connect: mockConnect },
    }));

    vi.doMock('@/lib/scheduler/BackgroundScheduler', () => ({
      startScheduler: vi.fn(),
    }));

    process.env.GATEWAY_IP = '192.168.1.100';

    const { tryConnectGateway } = await import('@/lib/gateway/autoConnect');

    // Should NOT throw
    await expect(tryConnectGateway()).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('网关连接失败')
    );
  });

  it('uses default port 8091 when GATEWAY_PORT is not set', async () => {
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/gateway/GatewayService', () => ({
      gatewayService: { connect: mockConnect },
    }));

    vi.doMock('@/lib/scheduler/BackgroundScheduler', () => ({
      startScheduler: vi.fn(),
    }));

    process.env.GATEWAY_IP = '192.168.1.100';
    delete process.env.GATEWAY_PORT;

    const { tryConnectGateway } = await import('@/lib/gateway/autoConnect');

    await tryConnectGateway();

    expect(mockConnect).toHaveBeenCalledWith('192.168.1.100', 8091);
  });
});
