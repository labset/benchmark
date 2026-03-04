import { Command } from 'commander';
import { createLogger } from '../util/logger.js';
import { buildCommand } from './commands/build.js';
import { deployCommand } from './commands/deploy.js';
import { loadtestCommand } from './commands/loadtest.js';
import { runCommand } from './commands/run.js';
import { publishCommand } from './commands/publish.js';
import { compareCommand } from './commands/compare.js';
import { listCommand } from './commands/list.js';
import { cleanCommand } from './commands/clean.js';

export function createProgram() {
  const program = new Command();

  program
    .name('benchmark')
    .description('API benchmark toolkit - capture build, deploy, and load test metrics')
    .version('1.0.0')
    .option('-c, --config <path>', 'path to benchmark config file', 'benchmark.config.json')
    .option('-o, --output <dir>', 'directory for results output', './results')
    .option('-v, --verbose', 'enable verbose logging', false)
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      createLogger(opts.verbose);
    });

  program.addCommand(buildCommand());
  program.addCommand(deployCommand());
  program.addCommand(loadtestCommand());
  program.addCommand(runCommand());
  program.addCommand(publishCommand());
  program.addCommand(compareCommand());
  program.addCommand(listCommand());
  program.addCommand(cleanCommand());

  return program;
}
