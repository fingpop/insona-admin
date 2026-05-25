import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('instrumentation gateway auto-connect', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.GATEWAY_IP;
    delete process.env.GATEWAY_PORT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls loadAndConnectAll on MultiGatewayService', async () => {
    const mockLoadAndConnectAll = vi.fn().mockResolvedValue(undefined);

    vi.doMock('@/lib/gateway/MultiGatewayService', () => ({
      multiGatewayService: { loadAndConnectAll: mockLoadAndConnectAll },
    }));

    const { tryConnectGateway } = await import('@/lib/gateway/autoConnect');

    await tryConnectGateway();

    expect(mockLoadAndConnectAll).toHaveBeenCalled();
  });

  it('resolves without throwing on connection failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@/lib/gateway/MultiGatewayService', () => ({
      multiGatewayService: {
        loadAndConnectAll: vi.fn().mockRejectedValue(new Error('Connection refused')),
      },
    }));

    const { tryConnectGateway } = await import('@/lib/gateway/autoConnect');

    // Should NOT throw
    await expect(tryConnectGateway()).resolves.not.toThrow();

    errorSpy.mockRestore();
  });
});
