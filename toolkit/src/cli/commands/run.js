import { Command } from 'commander';

export function runCommand() {
  return new Command('run')
    .description('run the full benchmark pipeline: build, deploy, loadtest, collect')
    .argument('<target>', 'target name from config')
    .option('--skip-build', 'skip the build step')
    .option('--skip-loadtest', 'skip the k6 load test step')
    .option('--k6-vus <n>', 'override virtual users count')
    .option('--k6-duration <d>', 'override test duration')
    .option('--tag <label>', 'tag this run for comparison')
    .option('--publish', 'publish results to Grafana Cloud after run')
    .action(async (target, options, command) => {
      console.log(`run command not yet implemented for target: ${target}`);
    });
}
