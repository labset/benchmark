import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../util/logger.js';

export async function writeResults(results, outputDir) {
  const log = getLogger();
  await mkdir(outputDir, { recursive: true });

  const timestamp = results.timestamp.replace(/[:.]/g, '-');
  const safeName = results.target.replace(/\//g, '-');
  const filename = `${safeName}-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  await writeFile(filepath, JSON.stringify(results, null, 2), 'utf-8');
  log.info({ filepath, msg: 'results written' });

  return filepath;
}
