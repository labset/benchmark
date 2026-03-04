export function parseK6Summary(raw) {
  const metrics = raw.metrics || {};

  const httpReqDuration = metrics.http_req_duration?.values || {};
  const httpReqs = metrics.http_reqs?.values || {};
  const httpReqFailed = metrics.http_req_failed?.values || {};
  const checks = metrics.checks?.values || {};
  const iterations = metrics.iterations?.values || {};
  const dataReceived = metrics.data_received?.values || {};
  const dataSent = metrics.data_sent?.values || {};

  return {
    httpReqs: httpReqs.count ?? 0,
    httpReqsPerSec: httpReqs.rate ?? 0,
    httpReqDuration: {
      avg: httpReqDuration.avg ?? 0,
      min: httpReqDuration.min ?? 0,
      med: httpReqDuration.med ?? 0,
      max: httpReqDuration.max ?? 0,
      p90: httpReqDuration['p(90)'] ?? 0,
      p95: httpReqDuration['p(95)'] ?? 0,
      p99: httpReqDuration['p(99)'] ?? 0,
    },
    httpReqFailed: httpReqFailed.rate ?? 0,
    iterations: iterations.count ?? 0,
    iterationsPerSec: iterations.rate ?? 0,
    dataReceived: dataReceived.count ?? 0,
    dataSent: dataSent.count ?? 0,
    checksPassRate: checks.rate ?? 0,
  };
}
