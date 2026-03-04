import { Command } from 'commander';

export function loadtestCommand() {
  return new Command('loadtest')
    .description('run k6 load test against a running target')
    .argument('<target>', 'target name from config')
    .action(async (target, options, command) => {
      console.log(`loadtest command not yet implemented for target: ${target}`);
    });
}
