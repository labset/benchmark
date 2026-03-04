import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadConfig, resolveTarget } from '../../config/loader.js';
import { composeUp } from '../../core/docker.js';
import { waitForHealthy } from '../../core/health.js';
import { startTimer } from '../../core/timer.js';
import { getLogger } from '../../util/logger.js';

export function deployCommand() {
  return new Command('deploy')
    .description('run docker compose up and capture deploy/start time')
    .argument('<target>', 'target name from config')
    .action(async (targetName, options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);
      const target = resolveTarget(config, targetName);

      const projectDir = resolve(target.path);
      const startedAt = new Date().toISOString();
      const timer = startTimer();

      await composeUp(projectDir, {
        composeFile: target.composeFile,
      });

      await waitForHealthy(target);

      const readyAt = new Date().toISOString();
      const { durationMs, durationSec } = timer.stop();
      log.info({ target: targetName, durationMs, durationSec }, 'deploy completed');

      return { durationMs, startedAt, readyAt };
    });
}
