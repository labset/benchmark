import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadConfig, resolveTarget } from '../../config/loader.js';
import { composeBuild, composeUp, composeDown } from '../../core/docker.js';
import { waitForHealthy } from '../../core/health.js';
import { runK6 } from '../../core/k6.js';
import { startTimer } from '../../core/timer.js';
import { parseBuildStages } from '../../metrics/build-parser.js';
import { parseK6Summary } from '../../metrics/k6-parser.js';
import { collectResults } from '../../metrics/collector.js';
import { writeResults } from '../../report/json.js';
import { getLogger } from '../../util/logger.js';

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
    .option('--cache', 'allow docker build cache', false)
    .action(async (targetName, options, command) => {
      const log = getLogger();
      const globalOpts = command.parent.opts();
      const config = await loadConfig(globalOpts.config);
      const target = resolveTarget(config, targetName);
      const projectDir = resolve(target.path);
      const outputDir = resolve(globalOpts.output ?? config.output.dir);

      let buildResult = null;
      let deployResult = null;
      let loadtestResult = null;

      try {
        // --- Build phase ---
        if (!options.skipBuild) {
          log.info({ target: targetName, msg: 'phase: build' });
          const timer = startTimer();
          const buildOutput = await composeBuild(projectDir, {
            composeFile: target.composeFile,
            noCache: !options.cache,
          });
          const { durationMs } = timer.stop();
          const stages = parseBuildStages(buildOutput.stderr);
          buildResult = { durationMs, cached: options.cache, stages };
          log.info({ durationMs, stages, msg: 'build completed' });
        }

        // --- Deploy phase ---
        log.info({ target: targetName, msg: 'phase: deploy' });
        const deployTimer = startTimer();
        const startedAt = new Date().toISOString();

        await composeUp(projectDir, {
          composeFile: target.composeFile,
        });
        await waitForHealthy(target);

        const readyAt = new Date().toISOString();
        const { durationMs: deployMs } = deployTimer.stop();
        deployResult = { durationMs: deployMs, startedAt, readyAt };
        log.info({ durationMs: deployMs, msg: 'deploy completed' });

        // --- Load test phase ---
        if (!options.skipLoadtest) {
          log.info({ target: targetName, msg: 'phase: loadtest' });
          const scriptPath = resolve(target.k6.script);
          const vus = options.k6Vus ? parseInt(options.k6Vus, 10) : target.k6.vus;
          const duration = options.k6Duration ?? target.k6.duration;

          const env = {
            ...target.k6.env,
            BASE_URL: target.k6.env.BASE_URL ?? `http://localhost:${target.port}`,
          };

          const rawSummary = await runK6(scriptPath, { vus, duration, env });
          const summary = parseK6Summary(rawSummary);
          loadtestResult = {
            config: { vus, duration, script: target.k6.script },
            summary,
          };
          log.info({
            reqsPerSec: summary.reqsPerSec.toFixed(1),
            p95: summary.reqDuration.p95.toFixed(1),
            msg: 'loadtest completed',
          });
        }

        // --- Collect results ---
        const results = await collectResults({
          target,
          tag: options.tag,
          build: buildResult,
          deploy: deployResult,
          loadtest: loadtestResult,
        });

        const filepath = await writeResults(results, outputDir);
        log.info({ filepath, msg: 'benchmark run completed' });

        // --- Publish (if requested) ---
        if (options.publish) {
          const { publishResults } = await import('../../publish/otlp.js');
          await publishResults(results);
        }
      } finally {
        // --- Cleanup (only if deploy was attempted) ---
        if (deployResult) {
          log.info({ target: targetName, msg: 'phase: cleanup' });
          try {
            await composeDown(projectDir, { composeFile: target.composeFile });
          } catch (err) {
            log.error({ err: err.message, msg: 'cleanup failed' });
          }
        }
      }
    });
}
