import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../config/loader.js';
import { publishToGrafanaCloud } from '../../publish/grafana-cloud.js';
import { getLogger } from '../../util/logger.js';

export function publishCommand() {
  return new Command('publish')
    .description('publish benchmark results to Grafana Cloud')
    .argument('<results...>', 'path(s) to results JSON file(s)')
    .action(async (resultsPaths, options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);

      for (const resultsPath of resultsPaths) {
        const absolutePath = resolve(resultsPath);
        const content = await readFile(absolutePath, 'utf-8');
        const results = JSON.parse(content);

        log.info({ file: absolutePath, target: results.target, msg: 'publishing results' });
        await publishToGrafanaCloud(results, config);
        log.info({ target: results.target, msg: 'published' });
      }

      log.info({ count: resultsPaths.length, msg: 'publish completed' });
    });
}
