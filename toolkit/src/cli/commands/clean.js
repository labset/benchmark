import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadConfig, resolveTarget } from '../../config/loader.js';
import { composeDown } from '../../core/docker.js';
import { getLogger } from '../../util/logger.js';

export function cleanCommand() {
  return new Command('clean')
    .description('tear down a target (docker compose down)')
    .argument('<target>', 'target name from config')
    .option('--no-volumes', 'keep volumes')
    .action(async (targetName, options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);
      const target = resolveTarget(config, targetName);

      const projectDir = resolve(target.path);
      await composeDown(projectDir, {
        composeFile: target.composeFile,
        volumes: options.volumes,
      });

      log.info({ target: targetName }, 'clean completed');
    });
}
