import { Command } from 'commander';
import { loadResults, compareResults } from '../../report/compare.js';
import { renderComparisonTable } from '../../report/table.js';
import { getLogger } from '../../util/logger.js';

export function compareCommand() {
  return new Command('compare')
    .description('compare benchmark results across targets')
    .argument('<targets...>', 'result file paths to compare')
    .action(async (targets) => {
      const log = getLogger();

      log.info({ files: targets.length }, 'loading results for comparison');
      const results = await loadResults(targets);
      const comparison = compareResults(results);

      console.log('\n' + renderComparisonTable(comparison) + '\n');
    });
}
