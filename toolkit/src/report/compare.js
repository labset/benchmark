import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function loadResults(paths) {
  const results = [];
  for (const p of paths) {
    const content = await readFile(resolve(p), 'utf-8');
    results.push(JSON.parse(content));
  }
  return results;
}

export function compareResults(results) {
  const rows = results.map((r) => {
    const row = {
      target: r.target,
      tag: r.tag,
      timestamp: r.timestamp,
    };

    if (r.metrics.build) {
      row.buildMs = r.metrics.build.durationMs;
    }

    if (r.metrics.deploy) {
      row.deployMs = r.metrics.deploy.durationMs;
    }

    if (r.metrics.loadtest) {
      const s = r.metrics.loadtest.summary;
      row.reqsPerSec = s.httpReqsPerSec;
      row.avgMs = s.httpReqDuration.avg;
      row.p90Ms = s.httpReqDuration.p90;
      row.p95Ms = s.httpReqDuration.p95;
      row.p99Ms = s.httpReqDuration.p99;
      row.errorRate = s.httpReqFailed;
    }

    return row;
  });

  // Find best values for highlighting
  const best = {};
  const numericKeys = ['buildMs', 'deployMs', 'avgMs', 'p90Ms', 'p95Ms', 'p99Ms', 'errorRate'];
  const higherIsBetter = ['reqsPerSec'];

  for (const key of numericKeys) {
    const values = rows.map((r) => r[key]).filter((v) => v !== undefined);
    if (values.length > 0) best[key] = Math.min(...values);
  }

  for (const key of higherIsBetter) {
    const values = rows.map((r) => r[key]).filter((v) => v !== undefined);
    if (values.length > 0) best[key] = Math.max(...values);
  }

  return { rows, best };
}
