import { Command } from 'commander';

export function publishCommand() {
  return new Command('publish')
    .description('publish benchmark results to Grafana Cloud')
    .argument('<results>', 'path to results JSON file')
    .action(async (results, options, command) => {
      console.log(`publish command not yet implemented for results: ${results}`);
    });
}
