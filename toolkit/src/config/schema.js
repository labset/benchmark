import { z } from 'zod';

const readinessProbeSchema = z.object({
  httpGet: z
    .object({
      path: z.string().default('/health'),
      port: z.number().int().positive().optional(),
      expectedStatus: z.number().int().default(200),
    })
    .optional(),
  initialDelayMs: z.number().int().nonnegative().default(2000),
  intervalMs: z.number().int().positive().default(1000),
  timeoutMs: z.number().int().positive().default(120_000),
});

const k6ConfigSchema = z.object({
  script: z.string().default('toolkit/k6/scripts/default-http.js'),
  vus: z.number().int().positive().default(50),
  duration: z.string().default('30s'),
  env: z.record(z.string()).default({}),
});

const targetSchema = z.object({
  path: z.string(),
  composeFile: z.string().default('docker-compose.yml'),
  service: z.string(),
  port: z.number().int().positive(),
  protocol: z.enum(['http', 'grpc']).default('http'),
  readinessProbe: readinessProbeSchema.default({}),
  k6: k6ConfigSchema.default({}),
  tags: z.record(z.string()).default({}),
});

const grafanaSchema = z.object({
  endpoint: z.string().url(),
  instanceId: z.string(),
  apiKey: z.string(),
});

export const configSchema = z.object({
  targets: z.record(targetSchema),
  defaults: z
    .object({
      k6: k6ConfigSchema.partial().default({}),
      readinessProbe: readinessProbeSchema.partial().default({}),
    })
    .default({}),
  grafana: grafanaSchema.optional(),
  output: z
    .object({
      dir: z.string().default('./results'),
    })
    .default({}),
});
