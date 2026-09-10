export interface ImportProgress {
  readonly completed: number;
  readonly total: number | undefined;
  readonly ratio: number;
  readonly message: string | undefined;
  readonly stage: string;
  readonly updatedAt: number;
}

export const createImportProgress = (input: {
  readonly completed: number;
  readonly total?: number;
  readonly message?: string;
  readonly stage: string;
  readonly updatedAt: number;
}): ImportProgress => {
  const total = input.total;
  const ratio =
    total !== undefined && total > 0
      ? Math.min(1, Math.max(0, input.completed / total))
      : 0;
  return Object.freeze({
    completed: input.completed,
    total,
    ratio,
    message: input.message,
    stage: input.stage,
    updatedAt: input.updatedAt
  });
};

export type ImportProgressReporter = (progress: ImportProgress) => void;
