/**
 * Gateway auto-connect utility (legacy)
 *
 * Deprecated: use MultiGatewayService.loadAndConnectAll() instead.
 * Kept for backward compatibility.
 */

import { multiGatewayService } from "./MultiGatewayService";

export async function tryConnectGateway(): Promise<void> {
  await multiGatewayService.loadAndConnectAll();
}
