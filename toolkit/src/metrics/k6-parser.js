export function parseK6Summary(raw) {
  const metrics = raw.metrics || {};

  // Support both HTTP and gRPC protocols.
  // k6 --summary-export nests metric data under a .values object.
  const reqDuration = metrics.http_req_duration?.values || metrics.grpc_req_duration?.values || {};
  const reqs = metrics.http_reqs?.values || {};
  const reqFailed = metrics.http_req_failed?.values || {};
  const checks = metrics.checks?.values || {};
  const iterations = metrics.iterations?.values || {};
  const dataReceived = metrics.data_received?.values || {};
  const dataSent = metrics.data_sent?.values || {};

  return {
    reqs: reqs.count ?? iterations.count ?? 0,
    reqsPerSec: reqs.rate ?? iterations.rate ?? 0,
    reqDuration: {
      avg: reqDuration.avg ?? 0,
      min: reqDuration.min ?? 0,
      med: reqDuration.med ?? 0,
      max: reqDuration.max ?? 0,
      p90: reqDuration['p(90)'] ?? 0,
      p95: reqDuration['p(95)'] ?? 0,
      p99: reqDuration['p(99)'] ?? 0,
    },
    reqFailedRate: reqFailed.rate ?? 0,
    iterations: iterations.count ?? 0,
    iterationsPerSec: iterations.rate ?? 0,
    dataReceived: dataReceived.count ?? 0,
    dataSent: dataSent.count ?? 0,
    checksPassRate: checks.rate ?? 0,
  };
}
