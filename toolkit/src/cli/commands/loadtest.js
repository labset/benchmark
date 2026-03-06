import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadConfig, resolveTarget } from '../../config/loader.js';
import { runK6 } from '../../core/k6.js';
import { parseK6Summary } from '../../metrics/k6-parser.js';
import { getLogger } from '../../util/logger.js';

export function loadtestCommand() {
  return new Command('loadtest')
    .description('run k6 load test against a running target')
    .argument('<target>', 'target name from config')
    .option('--k6-vus <n>', 'override virtual users count')
    .option('--k6-duration <d>', 'override test duration')
    .action(async (targetName, options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);
      const target = resolveTarget(config, targetName);

      const scriptPath = resolve(target.k6.script);
      const vus = options.k6Vus ? parseInt(options.k6Vus, 10) : target.k6.vus;
      const duration = options.k6Duration ?? target.k6.duration;

      const env = {
        ...target.k6.env,
        BASE_URL: target.k6.env.BASE_URL ?? `http://localhost:${target.port}`,
      };

      const rawSummary = await runK6(scriptPath, { vus, duration, env });
      const summary = parseK6Summary(rawSummary);

      log.info({
        target: targetName,
        reqsPerSec: summary.httpReqsPerSec.toFixed(1),
        p95: summary.httpReqDuration.p95.toFixed(1),
        errorRate: summary.httpReqFailed.toFixed(4),
        msg: 'load test completed',
      });

      return {
        config: { vus, duration, script: target.k6.script },
        summary,
      };
    });
}
