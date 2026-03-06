import pino from 'pino';

let logger;

export function createLogger(verbose = false) {
  logger = pino({
    level: verbose ? 'debug' : 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'HH:mm:ss',
      },
    },
  });
  return logger;
}

export function getLogger() {
  if (!logger) {
    return createLogger();
  }
  return logger;
}
