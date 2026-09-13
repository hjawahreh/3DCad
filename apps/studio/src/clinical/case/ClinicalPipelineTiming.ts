/**
 * Lightweight end-to-end pipeline timing smoke (Phase 9).
 * Not a CI gate — records durations for certification docs.
 */

export interface PipelineTimingRow {
  readonly stage: string;
  readonly ms: number;
  readonly ok: boolean;
  readonly note: string;
}

export const createPipelineTimingCollector = () => {
  const rows: PipelineTimingRow[] = [];
  return {
    async measure(
      stage: string,
      fn: () => Promise<boolean> | boolean,
      note = ''
    ): Promise<boolean> {
      const t0 = performance.now();
      let ok = false;
      try {
        ok = await fn();
      } catch {
        ok = false;
      }
      rows.push(
        Object.freeze({
          stage,
          ms: performance.now() - t0,
          ok,
          note
        })
      );
      return ok;
    },
    snapshot(): readonly PipelineTimingRow[] {
      return Object.freeze([...rows]);
    }
  };
};
