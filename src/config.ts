import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().default(9222),
  binary: z.string().optional(),
  outputMaxChars: z.coerce.number().min(100).default(8000),
  outputMaxElements: z.coerce.number().min(1).default(50),
  defaultTimeout: z.coerce.number().min(1000).default(15000),
  logBufferMax: z.coerce.number().min(10).default(500),
  domainAllowlist: z.array(z.string()).default([]).transform(arr => arr.map(s => s.toLowerCase())),
  domainBlocklist: z.array(z.string()).default([]).transform(arr => arr.map(s => s.toLowerCase())),
  cdpRetryAttempts: z.coerce.number().min(1).default(3),
  cdpRetryDelayMs: z.coerce.number().min(100).default(1000),
  batchMaxUrls: z.coerce.number().min(1).max(50).default(10),
  cdpWsUrl: z.string().optional(),
  evaluateEnabled: z.preprocess(
    (v) => v === 'true' ? true : v === 'false' ? false : v,
    z.boolean().default(false)
  ),
  debug: z.preprocess(
    (v) => v === 'true' ? true : v === 'false' ? false : v,
    z.boolean().default(false)
  ),
});

export type Config = z.infer<typeof ConfigSchema> & { cdpEndpoint: string };

let _cached: Config | null = null;

export function setConfig(c: Config): void {
  _cached = c;
}

function loadJsonConfig(): Record<string, unknown> {
  const configPath = join(homedir(), '.pandabridge', 'config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function getConfig(): Config {
  if (_cached) return _cached;

  const jsonConfig = loadJsonConfig();

  // Env vars take precedence over JSON file
  const raw: Record<string, unknown> = {
    ...jsonConfig,
    ...(process.env.LIGHTPANDA_HOST && { host: process.env.LIGHTPANDA_HOST }),
    ...(process.env.LIGHTPANDA_PORT && { port: process.env.LIGHTPANDA_PORT }),
    ...(process.env.LIGHTPANDA_BINARY && { binary: process.env.LIGHTPANDA_BINARY }),
    ...(process.env.PANDABRIDGE_OUTPUT_MAX_CHARS && { outputMaxChars: process.env.PANDABRIDGE_OUTPUT_MAX_CHARS }),
    ...(process.env.PANDABRIDGE_OUTPUT_MAX_ELEMENTS && { outputMaxElements: process.env.PANDABRIDGE_OUTPUT_MAX_ELEMENTS }),
    ...(process.env.PANDABRIDGE_DEFAULT_TIMEOUT && { defaultTimeout: process.env.PANDABRIDGE_DEFAULT_TIMEOUT }),
    ...(process.env.PANDABRIDGE_LOG_BUFFER_MAX && { logBufferMax: process.env.PANDABRIDGE_LOG_BUFFER_MAX }),
    ...(process.env.PANDABRIDGE_CDP_RETRY_ATTEMPTS && { cdpRetryAttempts: process.env.PANDABRIDGE_CDP_RETRY_ATTEMPTS }),
    ...(process.env.PANDABRIDGE_CDP_RETRY_DELAY_MS && { cdpRetryDelayMs: process.env.PANDABRIDGE_CDP_RETRY_DELAY_MS }),
    ...(process.env.PANDABRIDGE_BATCH_MAX_URLS && { batchMaxUrls: process.env.PANDABRIDGE_BATCH_MAX_URLS }),
    ...(process.env.LIGHTPANDA_CDP_WS_URL && { cdpWsUrl: process.env.LIGHTPANDA_CDP_WS_URL }),
    ...(process.env.PANDABRIDGE_EVALUATE_ENABLED != null && process.env.PANDABRIDGE_EVALUATE_ENABLED !== '' && { evaluateEnabled: process.env.PANDABRIDGE_EVALUATE_ENABLED }),
    ...(process.env.PANDABRIDGE_DEBUG != null && process.env.PANDABRIDGE_DEBUG !== '' && { debug: process.env.PANDABRIDGE_DEBUG }),
    ...(process.env.PANDABRIDGE_DOMAIN_ALLOWLIST && {
      domainAllowlist: process.env.PANDABRIDGE_DOMAIN_ALLOWLIST.split(',').map(s => s.trim()).filter(Boolean)
    }),
    ...(process.env.PANDABRIDGE_DOMAIN_BLOCKLIST && {
      domainBlocklist: process.env.PANDABRIDGE_DOMAIN_BLOCKLIST.split(',').map(s => s.trim()).filter(Boolean)
    }),
  };

  const parsed: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(ConfigSchema.shape)) {
    const fieldResult = (schema as z.ZodTypeAny).safeParse(raw[key]);
    if (fieldResult.success) {
      parsed[key] = fieldResult.data;
    } else {
      const defaultResult = (schema as z.ZodTypeAny).safeParse(undefined);
      parsed[key] = defaultResult.success ? defaultResult.data : undefined;
      process.stderr.write(
        `[pandabridge] Config warning: field "${key}" is invalid (${JSON.stringify(raw[key])}), using default.\n`
      );
    }
  }
  const config = parsed as z.infer<typeof ConfigSchema>;

  // Validate CDP WebSocket URL scheme if provided
  if (config.cdpWsUrl && !/^wss?:\/\//.test(config.cdpWsUrl)) {
    process.stderr.write(
      `[pandabridge] Config warning: cdpWsUrl must start with ws:// or wss://, got "${config.cdpWsUrl}". Ignoring.\n`
    );
    config.cdpWsUrl = undefined;
  }

  const cdpEndpoint = config.cdpWsUrl ?? `http://${config.host}:${config.port}`;
  const fullConfig = { ...config, cdpEndpoint } as Config;
  _cached = fullConfig;
  return fullConfig;
}
