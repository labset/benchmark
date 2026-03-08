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
    'benchmark.target': results.target,
    'benchmark.tag': results.tag,
    'host.os': results.environment.os,
    'host.arch': results.environment.arch,
  });

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

  // Build metrics
  if (results.metrics.build) {
    meter
      .createGauge('benchmark.build.duration', { unit: 'ms' })
      .record(results.metrics.build.durationMs);
  }

  // Deploy metrics
  if (results.metrics.deploy) {
    meter
      .createGauge('benchmark.deploy.duration', { unit: 'ms' })
      .record(results.metrics.deploy.durationMs);
  }

  // Load test metrics
  if (results.metrics.loadtest) {
    const s = results.metrics.loadtest.summary;

    meter.createGauge('benchmark.reqs', { unit: '1' }).record(s.reqs);
    meter.createGauge('benchmark.reqs_per_sec', { unit: '1/s' }).record(s.reqsPerSec);
    meter.createGauge('benchmark.req_failed_rate', { unit: '1' }).record(s.reqFailedRate);
    meter.createGauge('benchmark.req.duration.avg', { unit: 'ms' }).record(s.reqDuration.avg);
    meter.createGauge('benchmark.req.duration.min', { unit: 'ms' }).record(s.reqDuration.min);
    meter.createGauge('benchmark.req.duration.med', { unit: 'ms' }).record(s.reqDuration.med);
    meter.createGauge('benchmark.req.duration.max', { unit: 'ms' }).record(s.reqDuration.max);
    meter.createGauge('benchmark.req.duration.p90', { unit: 'ms' }).record(s.reqDuration.p90);
    meter.createGauge('benchmark.req.duration.p95', { unit: 'ms' }).record(s.reqDuration.p95);
    meter.createGauge('benchmark.req.duration.p99', { unit: 'ms' }).record(s.reqDuration.p99);
    meter.createGauge('benchmark.checks_pass_rate', { unit: '1' }).record(s.checksPassRate);
    meter.createGauge('benchmark.iterations', { unit: '1' }).record(s.iterations);
    meter.createGauge('benchmark.iterations_per_sec', { unit: '1/s' }).record(s.iterationsPerSec);
  }

  await meterProvider.forceFlush();
  await meterProvider.shutdown();

  log.info({ target: results.target, msg: 'published to Grafana Cloud' });
}
