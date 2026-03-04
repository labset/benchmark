import { exec } from '../util/exec.js';
import { getLogger } from '../util/logger.js';

function composeArgs(composeFile, args) {
  return ['-f', composeFile, ...args];
}

export async function composeBuild(projectDir, options = {}) {
  const log = getLogger();
  const { composeFile = 'docker-compose.yml', noCache = true } = options;

  const args = composeArgs(composeFile, ['build']);
  if (noCache) args.push('--no-cache');

  log.info({ projectDir, noCache }, 'building docker compose project');
  return exec('docker', ['compose', ...args], {
    cwd: projectDir,
    stdio: 'inherit',
  });
}

export async function composeUp(projectDir, options = {}) {
  const log = getLogger();
  const { composeFile = 'docker-compose.yml' } = options;

  const args = composeArgs(composeFile, ['up', '-d', '--wait']);

  log.info({ projectDir }, 'starting docker compose project');
  return exec('docker', ['compose', ...args], {
    cwd: projectDir,
    stdio: 'inherit',
  });
}

export async function composeDown(projectDir, options = {}) {
  const log = getLogger();
  const { composeFile = 'docker-compose.yml', volumes = true } = options;

  const args = composeArgs(composeFile, ['down']);
  if (volumes) args.push('-v');

  log.info({ projectDir }, 'stopping docker compose project');
  return exec('docker', ['compose', ...args], {
    cwd: projectDir,
    stdio: 'inherit',
  });
}

export async function composePs(projectDir, options = {}) {
  const { composeFile = 'docker-compose.yml' } = options;
  const args = composeArgs(composeFile, ['ps', '--format', 'json']);

  const result = await exec('docker', ['compose', ...args], {
    cwd: projectDir,
  });

  if (!result.stdout.trim()) return [];

  // docker compose ps --format json outputs one JSON object per line
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}
