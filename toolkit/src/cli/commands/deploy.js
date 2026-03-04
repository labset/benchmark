import { Command } from 'commander';

export function deployCommand() {
  return new Command('deploy')
    .description('run docker compose up and capture deploy/start time')
    .argument('<target>', 'target name from config')
    .action(async (target, options, command) => {
      console.log(`deploy command not yet implemented for target: ${target}`);
    });
}
