import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configSchema } from './schema.js';
import { getLogger } from '../util/logger.js';

function interpolateEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)}/g, (_, name) => process.env[name] ?? '');
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, interpolateEnvVars(value)])
    );
  }
  return obj;
}

export async function loadConfig(configPath) {
  const log = getLogger();
  const absolutePath = resolve(configPath);
  log.debug({ path: absolutePath }, 'loading config');

  let raw;
  try {
    const content = await readFile(absolutePath, 'utf-8');
    raw = JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`config file not found: ${absolutePath}`, { cause: err });
    }
    throw new Error(`failed to parse config file: ${err.message}`, { cause: err });
  }

  const interpolated = interpolateEnvVars(raw);
  const result = configSchema.safeParse(interpolated);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`invalid config:\n${issues}`);
  }

  log.debug({ targets: Object.keys(result.data.targets) }, 'config loaded');
  return result.data;
}

function deepMerge(defaults, overrides) {
  const result = { ...defaults, ...overrides };
  for (const key of Object.keys(result)) {
    const defVal = defaults[key];
    const ovrVal = overrides[key];
    if (
      defVal &&
      ovrVal &&
      typeof defVal === 'object' &&
      typeof ovrVal === 'object' &&
      !Array.isArray(defVal) &&
      !Array.isArray(ovrVal)
    ) {
      result[key] = deepMerge(defVal, ovrVal);
    }
  }
  return result;
}

export function resolveTarget(config, targetName) {
  const target = config.targets[targetName];
  if (!target) {
    const available = Object.keys(config.targets).join(', ');
    throw new Error(`target "${targetName}" not found. available: ${available}`);
  }
  const merged = deepMerge(config.defaults ?? {}, target);
  return { name: targetName, ...merged };
}
