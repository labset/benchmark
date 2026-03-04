import { Command } from 'commander';

export function compareCommand() {
  return new Command('compare')
    .description('compare benchmark results across targets')
    .argument('<targets...>', 'result file paths or target names to compare')
    .action(async (targets, options, command) => {
      console.log(`compare command not yet implemented for targets: ${targets.join(', ')}`);
    });
}
