export function parseK6Summary(raw) {
  const metrics = raw.metrics || {};

  // Support both HTTP and gRPC protocols.
  const reqDuration = metrics.http_req_duration || metrics.grpc_req_duration || {};
  const reqs = metrics.http_reqs || {};
  const reqFailed = metrics.http_req_failed || {};
  const checks = metrics.checks || {};
  const iterations = metrics.iterations || {};
  const dataReceived = metrics.data_received || {};
  const dataSent = metrics.data_sent || {};

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
    checksPassRate: checks.value ?? 0,
  };
}
