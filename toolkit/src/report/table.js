import Table from 'cli-table3';
import chalk from 'chalk';

function fmt(value, decimals = 1) {
  if (value === undefined || value === null) return '-';
  return typeof value === 'number' ? value.toFixed(decimals) : String(value);
}

function highlight(value, bestValue) {
  if (value === undefined || bestValue === undefined) return fmt(value);
  const formatted = fmt(value);
  return value === bestValue ? chalk.green(formatted) : formatted;
}

export function renderComparisonTable({ rows, best }) {
  const table = new Table({
    head: [
      chalk.bold('Target'),
      chalk.bold('Tag'),
      chalk.bold('Build (ms)'),
      chalk.bold('Deploy (ms)'),
      chalk.bold('Reqs/s'),
      chalk.bold('Avg (ms)'),
      chalk.bold('p90 (ms)'),
      chalk.bold('p95 (ms)'),
      chalk.bold('p99 (ms)'),
      chalk.bold('Error %'),
    ],
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push([
      row.target,
      row.tag ?? '-',
      highlight(row.buildMs, best.buildMs),
      highlight(row.deployMs, best.deployMs),
      highlight(row.reqsPerSec, best.reqsPerSec),
      highlight(row.avgMs, best.avgMs),
      highlight(row.p90Ms, best.p90Ms),
      highlight(row.p95Ms, best.p95Ms),
      highlight(row.p99Ms, best.p99Ms),
      row.errorRate !== undefined ? fmt(row.errorRate * 100) : '-',
    ]);
  }

  return table.toString();
}
