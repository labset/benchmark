import { formatAsOtlpMetrics } from './formatter.js';
import { getLogger } from '../util/logger.js';

export async function publishToGrafanaCloud(results, config) {
  const log = getLogger();

  if (!config.grafana) {
    throw new Error('grafana config is required for publishing');
  }

  const { endpoint, instanceId, apiKey } = config.grafana;

  if (!instanceId || !apiKey) {
    throw new Error(
      'grafana instanceId and apiKey are required. Set GRAFANA_INSTANCE_ID and GRAFANA_API_KEY environment variables.'
    );
  }

  const body = formatAsOtlpMetrics(results);
  const url = `${endpoint}/v1/metrics`;
  const auth = Buffer.from(`${instanceId}:${apiKey}`).toString('base64');

  log.debug({
    url,
    metricsCount: body.resourceMetrics[0].scopeMetrics[0].metrics.length,
    msg: 'publishing to Grafana Cloud',
  });

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        log.info({
          status: response.status,
          target: results.target,
          msg: 'published to Grafana Cloud',
        });
        return;
      }

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        log.warn({ retryAfter, attempt, msg: 'rate limited, retrying' });
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      const responseText = await response.text();
      lastError = new Error(`Grafana Cloud returned ${response.status}: ${responseText}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        log.warn({ error: err.message, attempt, msg: 'publish failed, retrying' });
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}
