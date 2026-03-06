export function startTimer() {
  const start = process.hrtime.bigint();
  return {
    stop() {
      const end = process.hrtime.bigint();
      const durationNs = end - start;
      return {
        durationMs: Number(durationNs / 1_000_000n),
        durationSec: Number(durationNs / 1_000_000_000n),
      };
    },
  };
}
