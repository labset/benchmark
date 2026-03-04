import Table from 'cli-table3';
import chalk from 'chalk';

function fmt(value, decimals = 1) {
  if (value === undefined || value === null) return '-';
  return typeof value === 'number' ? value.toFixed(decimals) : String(value);
}

function highlight(value, bestValue, lowerIsBetter = true) {
  if (value === undefined || bestValue === undefined) return fmt(value);
  const formatted = fmt(value);
  if (lowerIsBetter) {
    return value === bestValue ? chalk.green(formatted) : formatted;
  }
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
      highlight(row.buildMs, best.buildMs, true),
      highlight(row.deployMs, best.deployMs, true),
      highlight(row.reqsPerSec, best.reqsPerSec, false),
      highlight(row.avgMs, best.avgMs, true),
      highlight(row.p90Ms, best.p90Ms, true),
      highlight(row.p95Ms, best.p95Ms, true),
      highlight(row.p99Ms, best.p99Ms, true),
      highlight(row.errorRate, best.errorRate, true),
    ]);
  }

  return table.toString();
}
