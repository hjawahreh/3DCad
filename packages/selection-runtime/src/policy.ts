import type { SelectionConfiguration } from './configuration.js';
import type { SelectionTargetId, SelectionMode } from './types.js';
import { asSelectionTargetId, selectionFailure, selectionSuccess, type SelectionResult } from './types.js';

export interface FilterResult {
  readonly accepted: readonly SelectionTargetId[];
  readonly rejected: readonly string[];
  readonly duplicatesSuppressed: number;
}

/**
 * Validates and normalizes opaque target identifiers.
 * No picking / geometry — string identity only.
 */
export class SelectionFilter {
  public constructor(private readonly configuration: SelectionConfiguration) {}

  public filter(rawIds: readonly string[]): SelectionResult<FilterResult> {
    const accepted: SelectionTargetId[] = [];
    const rejected: string[] = [];
    const seen = new Set<string>();
    let duplicatesSuppressed = 0;

    for (const raw of rawIds) {
      if (this.configuration.rejectEmptyIds && raw.trim().length === 0) {
        rejected.push(raw);
        continue;
      }
      if (this.configuration.suppressDuplicates && seen.has(raw)) {
        duplicatesSuppressed += 1;
        continue;
      }
      seen.add(raw);
      accepted.push(asSelectionTargetId(raw));
    }

    return selectionSuccess(
      Object.freeze({
        accepted: Object.freeze(accepted),
        rejected: Object.freeze(rejected),
        duplicatesSuppressed
      })
    );
  }
}

export interface PolicyApplication {
  readonly ids: readonly SelectionTargetId[];
  readonly violations: readonly string[];
}

/**
 * Configurable selection policies: single/multi, max size, replace/add/subtract/toggle.
 * Range selection is contract-only (mode `range-reserved` rejected for application).
 */
export class SelectionPolicy {
  public constructor(private readonly configuration: SelectionConfiguration) {}

  public apply(input: {
    readonly current: readonly SelectionTargetId[];
    readonly incoming: readonly SelectionTargetId[];
    readonly mode: SelectionMode;
  }): SelectionResult<PolicyApplication> {
    if (input.mode === 'range-reserved') {
      return selectionFailure(
        'policy',
        'Range selection is reserved (contract only) in COD-011'
      );
    }

    const violations: string[] = [];
    let next: SelectionTargetId[];

    switch (input.mode) {
      case 'replace':
        next = [...input.incoming];
        break;
      case 'add': {
        const set = new Set<string>(input.current.map((id) => id as string));
        next = [...input.current];
        for (const id of input.incoming) {
          if (!set.has(id as string)) {
            set.add(id as string);
            next.push(id);
          }
        }
        break;
      }
      case 'subtract': {
        const remove = new Set<string>(input.incoming.map((id) => id as string));
        next = input.current.filter((id) => !remove.has(id as string));
        break;
      }
      case 'toggle': {
        const set = new Set<string>(input.current.map((id) => id as string));
        next = [...input.current];
        for (const id of input.incoming) {
          if (set.has(id as string)) {
            set.delete(id as string);
            next = next.filter((x) => x !== id);
          } else {
            set.add(id as string);
            next.push(id);
          }
        }
        break;
      }
      default: {
        const _never: never = input.mode;
        return selectionFailure('invalid', `Unknown mode: ${String(_never)}`);
      }
    }

    if (this.configuration.policyMode === 'single' && next.length > 1) {
      violations.push('single-select');
      next = next.length === 0 ? [] : [next[next.length - 1]!];
    }

    if (next.length > this.configuration.maxSelectionSize) {
      violations.push('max-selection-size');
      next = next.slice(0, this.configuration.maxSelectionSize);
    }

    // Deterministic order: stable insertion order for add/toggle/replace; subtract preserves order.
    return selectionSuccess(
      Object.freeze({
        ids: Object.freeze(next),
        violations: Object.freeze(violations)
      })
    );
  }
}
