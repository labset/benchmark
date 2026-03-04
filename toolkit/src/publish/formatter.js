function makeAttribute(key, value) {
  if (typeof value === 'number') {
    return { key, value: { intValue: String(Math.round(value)) } };
  }
  return { key, value: { stringValue: String(value) } };
}

function makeGauge(name, unit, value, timeUnixNano, attributes) {
  const dataPoint = {
    timeUnixNano: String(timeUnixNano),
    attributes,
  };

  if (Number.isInteger(value)) {
    dataPoint.asInt = String(value);
  } else {
    dataPoint.asDouble = value;
  }

  return {
    name,
    unit,
    gauge: {
      dataPoints: [dataPoint],
    },
  };
}

export function formatAsOtlpMetrics(results) {
  const timeUnixNano = BigInt(new Date(results.timestamp).getTime()) * 1_000_000n;

  const resourceAttributes = [
    makeAttribute('benchmark.target', results.target),
    makeAttribute('benchmark.tag', results.tag),
    makeAttribute('host.os', results.environment.os),
    makeAttribute('host.arch', results.environment.arch),
  ];

  // Add target tags as resource attributes
  if (results.metrics.loadtest?.config) {
    const { vus, duration } = results.metrics.loadtest.config;
    resourceAttributes.push(makeAttribute('benchmark.k6.vus', vus));
    resourceAttributes.push(makeAttribute('benchmark.k6.duration', duration));
  }

  const metricAttributes = [
    makeAttribute('benchmark.target', results.target),
    makeAttribute('benchmark.tag', results.tag),
  ];

  const metrics = [];

  // Build metrics
  if (results.metrics.build) {
    metrics.push(
      makeGauge(
        'benchmark.build.duration',
        'ms',
        results.metrics.build.durationMs,
        timeUnixNano,
        metricAttributes
      )
    );
  }

  // Deploy metrics
  if (results.metrics.deploy) {
    metrics.push(
      makeGauge(
        'benchmark.deploy.duration',
        'ms',
        results.metrics.deploy.durationMs,
        timeUnixNano,
        metricAttributes
      )
    );
  }

  // Load test metrics
  if (results.metrics.loadtest) {
    const { summary } = results.metrics.loadtest;

    metrics.push(
      makeGauge('benchmark.http_reqs', '1', summary.httpReqs, timeUnixNano, metricAttributes),
      makeGauge(
        'benchmark.http_reqs_per_sec',
        '1/s',
        summary.httpReqsPerSec,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req_failed_rate',
        '1',
        summary.httpReqFailed,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.avg',
        'ms',
        summary.httpReqDuration.avg,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.min',
        'ms',
        summary.httpReqDuration.min,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.med',
        'ms',
        summary.httpReqDuration.med,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.max',
        'ms',
        summary.httpReqDuration.max,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.p90',
        'ms',
        summary.httpReqDuration.p90,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.p95',
        'ms',
        summary.httpReqDuration.p95,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.http_req.duration.p99',
        'ms',
        summary.httpReqDuration.p99,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge(
        'benchmark.checks_pass_rate',
        '1',
        summary.checksPassRate,
        timeUnixNano,
        metricAttributes
      ),
      makeGauge('benchmark.iterations', '1', summary.iterations, timeUnixNano, metricAttributes),
      makeGauge(
        'benchmark.iterations_per_sec',
        '1/s',
        summary.iterationsPerSec,
        timeUnixNano,
        metricAttributes
      )
    );
  }

  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttributes },
        scopeMetrics: [
          {
            scope: { name: '@labset/benchmark-toolkit', version: '1.0.0' },
            metrics,
          },
        ],
      },
    ],
  };
}
