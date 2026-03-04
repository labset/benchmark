import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadConfig, resolveTarget } from '../../config/loader.js';
import { composeBuild } from '../../core/docker.js';
import { startTimer } from '../../core/timer.js';
import { getLogger } from '../../util/logger.js';

export function buildCommand() {
  return new Command('build')
    .description('run docker compose build and capture build time')
    .argument('<target>', 'target name from config')
    .option('--cache', 'allow docker build cache', false)
    .action(async (targetName, options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);
      const target = resolveTarget(config, targetName);

      const projectDir = resolve(target.path);
      const timer = startTimer();

      await composeBuild(projectDir, {
        composeFile: target.composeFile,
        noCache: !options.cache,
      });

      const { durationMs, durationSec } = timer.stop();
      log.info({ target: targetName, durationMs, durationSec }, 'build completed');

      return { durationMs, cached: options.cache };
    });
}
