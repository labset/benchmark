/**
 * Parse Docker BuildKit --progress=plain output to extract per-stage durations.
 *
 * BuildKit output format:
 *   #5 [generate 2/8] RUN apk add --no-cache git
 *   #5 DONE 1.2s
 *
 * Returns an object mapping stage names to total duration in milliseconds,
 * e.g. { generate: 5200, builder: 12300, runtime: 800 }
 */
export function parseBuildStages(output) {
  const stepStage = new Map();
  const stageDurations = {};

  const stagePattern = /#(\d+) \[(\S+)\s+\d+\/\d+\]/;
  const donePattern = /#(\d+) DONE (\d+\.?\d*)s/;

  for (const line of output.split('\n')) {
    const stageMatch = line.match(stagePattern);
    if (stageMatch) {
      stepStage.set(stageMatch[1], stageMatch[2]);
    }

    const doneMatch = line.match(donePattern);
    if (doneMatch) {
      const stage = stepStage.get(doneMatch[1]);
      if (stage && stage !== 'internal') {
        const durationMs = Math.round(parseFloat(doneMatch[2]) * 1000);
        stageDurations[stage] = (stageDurations[stage] ?? 0) + durationMs;
      }
    }
  }

  return stageDurations;
}
