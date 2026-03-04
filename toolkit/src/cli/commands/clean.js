import { Command } from 'commander';

export function cleanCommand() {
  return new Command('clean')
    .description('tear down a target (docker compose down)')
    .argument('<target>', 'target name from config')
    .action(async (target, options, command) => {
      console.log(`clean command not yet implemented for target: ${target}`);
    });
}
