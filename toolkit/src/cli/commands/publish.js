import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { publishResults } from '../../publish/otlp.js';
import { getLogger } from '../../util/logger.js';

export function publishCommand() {
  return new Command('publish')
    .description('publish benchmark results to Grafana Cloud')
    .argument('<results...>', 'path(s) to results JSON file(s)')
    .action(async (resultsPaths) => {
      const log = getLogger();

      for (const resultsPath of resultsPaths) {
        const absolutePath = resolve(resultsPath);
        const content = await readFile(absolutePath, 'utf-8');
        const results = JSON.parse(content);

        log.info({ file: absolutePath, target: results.target, msg: 'publishing results' });
        await publishResults(results);
      }

      log.info({ count: resultsPaths.length, msg: 'publish completed' });
    });
}
