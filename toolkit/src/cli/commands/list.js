import { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { getLogger } from '../../util/logger.js';

export function listCommand() {
  return new Command('list')
    .description('list configured benchmark targets')
    .action(async (options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);

      const targets = Object.entries(config.targets);
      if (targets.length === 0) {
        log.info({ msg: 'no targets configured' });
        return;
      }

      console.log(`\nConfigured targets (${targets.length}):\n`);
      for (const [name, target] of targets) {
        const tags = Object.entries(target.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        console.log(`  ${name}`);
        console.log(`    path:     ${target.path}`);
        console.log(`    service:  ${target.service}:${target.port}`);
        console.log(`    protocol: ${target.protocol}`);
        if (tags) console.log(`    tags:     ${tags}`);
        console.log();
      }
    });
}
