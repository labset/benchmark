import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { exec } from '../util/exec.js';
import { getLogger } from '../util/logger.js';

const K6_IMAGE = 'grafana/k6:1.6.1';

export async function runK6(scriptPath, options = {}) {
  const log = getLogger();
  const { vus = 50, duration = '30s', env = {} } = options;

  const workDir = resolve('.');
  const summaryName = `benchmark-k6-${randomUUID()}.json`;
  const summaryDir = tmpdir();
  const summaryFile = join(summaryDir, summaryName);

  const toContainerPath = (hostPath) => {
    const abs = resolve(hostPath);
    return `/workspace/${relative(workDir, abs)}`;
  };

  const isLinux = process.platform === 'linux';

  const dockerArgs = [
    'run',
    '--rm',
    '--network',
    'host',
    '-v',
    `${workDir}:/workspace:ro`,
    '-v',
    `${summaryDir}:/results`,
  ];

  for (const [key, value] of Object.entries(env)) {
    let mapped = value.startsWith('./') ? toContainerPath(value) : value;
    // Docker Desktop (macOS/Windows): --network host still works but localhost
    // inside the container resolves to the VM, not the macOS host.
    // Rewrite localhost to host.docker.internal so k6 can reach published ports.
    if (!isLinux) {
      mapped = mapped.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
    }
    dockerArgs.push('-e', `${key}=${mapped}`);
  }

  dockerArgs.push(
    K6_IMAGE,
    'run',
    '--summary-export',
    `/results/${summaryName}`,
    '--vus',
    String(vus),
    '--duration',
    duration,
    toContainerPath(scriptPath)
  );

  log.info({ scriptPath, vus, duration, msg: 'running k6 load test' });

  await exec('docker', dockerArgs, { stdio: 'inherit' });

  try {
    const raw = await readFile(summaryFile, 'utf-8');
    return JSON.parse(raw);
  } finally {
    await unlink(summaryFile).catch(() => {});
  }
}
