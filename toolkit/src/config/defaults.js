export const defaults = {
  k6: {
    vus: 50,
    duration: '30s',
  },
  readinessProbe: {
    initialDelayMs: 2000,
    intervalMs: 1000,
    timeoutMs: 120_000,
  },
  output: {
    dir: './results',
  },
};
