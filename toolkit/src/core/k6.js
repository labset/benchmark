import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { exec } from '../util/exec.js';
import { getLogger } from '../util/logger.js';

export async function runK6(scriptPath, options = {}) {
  const log = getLogger();
  const { vus = 50, duration = '30s', env = {} } = options;

  const summaryFile = join(tmpdir(), `benchmark-k6-${randomUUID()}.json`);

  const args = [
    'run',
    '--summary-export',
    summaryFile,
    '--vus',
    String(vus),
    '--duration',
    duration,
    scriptPath,
  ];

  log.info({ scriptPath, vus, duration }, 'running k6 load test');

  await exec('k6', args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  const raw = await readFile(summaryFile, 'utf-8');
  return JSON.parse(raw);
}
