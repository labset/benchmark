import { execa } from 'execa';
import { getLogger } from './logger.js';

export async function exec(command, args = [], options = {}) {
  const log = getLogger();
  log.debug({ command, args, cwd: options.cwd, msg: 'executing command' });

  return await execa(command, args, {
    stdio: options.stdio ?? 'pipe',
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout,
  });
}
