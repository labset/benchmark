import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getLogger } from '../util/logger.js';

export async function publishResults(results) {
  const log = getLogger();

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is not set. Configure it in your .env file.');
  }

  const resource = resourceFromAttributes({
    'service.name': '@labset/benchmark-toolkit',
    'service.version': '1.0.0',
  });

  // Data point attributes become Prometheus labels directly.
  // Resource attributes only appear as labels if promoted by Grafana Cloud,
  // and custom attributes like benchmark.target are not in the default promoted list.
  const attributes = {
    'benchmark.target': results.target,
    'benchmark.tag': results.tag,
    'host.os': results.environment.os,
    'host.arch': results.environment.arch,
  };

  const exporter = new OTLPMetricExporter();
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: 60_000,
      }),
    ],
  });

  const meter = meterProvider.getMeter('benchmark');

  // Helper to record a gauge with shared attributes.
  // Units are omitted to avoid Grafana Cloud appending suffixes
  // (e.g. _milliseconds, _ratio) which vary by configuration.
  const gauge = (name, value) => {
    meter.createGauge(name).record(value, attributes);
  };

  // Build metrics
  if (results.metrics.build) {
    gauge('benchmark.build.duration', results.metrics.build.durationMs);

    // Per-stage build durations
    const stages = results.metrics.build.stages;
    if (stages) {
      const stageGauge = meter.createGauge('benchmark.build.stage.duration');
      for (const [stage, durationMs] of Object.entries(stages)) {
        stageGauge.record(durationMs, { ...attributes, 'benchmark.build.stage': stage });
      }
    }
  }

  // Deploy metrics
  if (results.metrics.deploy) {
    gauge('benchmark.deploy.duration', results.metrics.deploy.durationMs);
  }

  // Load test metrics
  if (results.metrics.loadtest) {
    const s = results.metrics.loadtest.summary;

    gauge('benchmark.reqs', s.reqs);
    gauge('benchmark.reqs_per_sec', s.reqsPerSec);
    gauge('benchmark.req_failed_rate', s.reqFailedRate);
    gauge('benchmark.req.duration.avg', s.reqDuration.avg);
    gauge('benchmark.req.duration.min', s.reqDuration.min);
    gauge('benchmark.req.duration.med', s.reqDuration.med);
    gauge('benchmark.req.duration.max', s.reqDuration.max);
    gauge('benchmark.req.duration.p90', s.reqDuration.p90);
    gauge('benchmark.req.duration.p95', s.reqDuration.p95);
    gauge('benchmark.req.duration.p99', s.reqDuration.p99);
    gauge('benchmark.checks_pass_rate', s.checksPassRate);
    gauge('benchmark.iterations', s.iterations);
    gauge('benchmark.iterations_per_sec', s.iterationsPerSec);
  }

  await meterProvider.forceFlush();
  await meterProvider.shutdown();

  log.info({ target: results.target, msg: 'published to Grafana Cloud' });
}
