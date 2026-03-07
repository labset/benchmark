import { arch, cpus, totalmem, platform } from 'node:os';
import { exec } from '../util/exec.js';

async function getVersion(command, args) {
  try {
    const result = await exec(command, args);
    return result.stdout.trim();
  } catch {
    return 'unknown';
  }
}

async function collectEnvironment() {
  const [dockerVersion, nodeVersion, k6Version] = await Promise.all([
    getVersion('docker', ['--version']),
    getVersion('node', ['--version']),
    getVersion('docker', ['run', '--rm', 'grafana/k6:latest', 'version']),
  ]);

  return {
    os: platform(),
    arch: arch(),
    cpus: cpus().length,
    memoryGb: Math.round(totalmem() / (1024 * 1024 * 1024)),
    dockerVersion,
    nodeVersion,
    k6Version,
  };
}

export async function collectResults({ target, tag, build, deploy, loadtest }) {
  const environment = await collectEnvironment();

  return {
    target: target.name,
    tag: tag ?? target.name,
    timestamp: new Date().toISOString(),
    environment,
    metrics: {
      build: build ?? null,
      deploy: deploy ?? null,
      loadtest: loadtest ?? null,
    },
  };
}
