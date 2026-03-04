import { Command } from 'commander';

export function listCommand() {
  return new Command('list')
    .description('list configured benchmark targets')
    .action(async (options, command) => {
      console.log('list command not yet implemented');
    });
}
