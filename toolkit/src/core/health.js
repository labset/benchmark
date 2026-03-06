import { getLogger } from '../util/logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForHealthy(target) {
  const log = getLogger();
  const { readinessProbe, port } = target;
  const { initialDelayMs, intervalMs, timeoutMs } = readinessProbe;

  if (!readinessProbe.httpGet) {
    log.info({ msg: 'no readiness probe configured, skipping health check' });
    return;
  }

  const { path, expectedStatus = 200 } = readinessProbe.httpGet;
  const probePort = readinessProbe.httpGet.port ?? port;
  const url = `http://localhost:${probePort}${path}`;

  log.info({ url, timeoutMs, msg: 'waiting for service to be healthy' });

  await sleep(initialDelayMs);

  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === expectedStatus) {
        log.info({ url, status: response.status, msg: 'service is healthy' });
        return;
      }
      lastError = new Error(`unexpected status: ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    log.debug({ url, error: lastError.message, msg: 'health check failed, retrying' });
    await sleep(intervalMs);
  }

  throw new Error(`service failed to become healthy within ${timeoutMs}ms: ${lastError?.message}`);
}
