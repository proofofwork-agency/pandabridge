import type { Config } from '../config.js';

export async function createReconnectFresh(config: Config): Promise<void> {
  const { reconnectFresh } = await import('../browser/connection.js');
  await reconnectFresh(config);
}
