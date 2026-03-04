import { Command } from 'commander';

export function buildCommand() {
  return new Command('build')
    .description('run docker compose build and capture build time')
    .argument('<target>', 'target name from config')
    .action(async (target, options, command) => {
      console.log(`build command not yet implemented for target: ${target}`);
    });
}
