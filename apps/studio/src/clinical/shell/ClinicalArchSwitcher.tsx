import type { ClinicalArchRole } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalArchVisibilityMode } from './ClinicalArchContext.js';

export interface ClinicalArchSwitcherProps {
  readonly active: ClinicalArchVisibilityMode | ClinicalArchRole | undefined;
  readonly hasUpper: boolean;
  readonly hasLower: boolean;
  readonly disabled?: boolean;
  /** Called with UPPER / LOWER / BOTH. */
  readonly onSelect: (mode: ClinicalArchVisibilityMode) => void;
  /** Optional test id prefix (default: clinical-arch-switcher). */
  readonly testId?: string;
  /** When false, hide BOTH (legacy tool-only switchers). Default true. */
  readonly showBoth?: boolean;
}

/**
 * Shared Upper / Both / Lower arch switcher.
 * Presentation-only — callers own isolation / tool targeting via ClinicalArchContext.
 */
export const ClinicalArchSwitcher = ({
  active,
  hasUpper,
  hasLower,
  disabled = false,
  onSelect,
  testId = 'clinical-arch-switcher',
  showBoth = true
}: ClinicalArchSwitcherProps): React.JSX.Element => (
  <div
    className="clinical-arch-switcher"
    data-testid={testId}
    role="group"
    aria-label="Arch visibility"
    onPointerDown={(e) => e.stopPropagation()}
  >
    <button
      type="button"
      className={
        active === 'upper'
          ? 'clinical-arch-switcher__btn clinical-arch-switcher__btn--active'
          : 'clinical-arch-switcher__btn'
      }
      data-testid={`${testId}-upper`}
      disabled={disabled || !hasUpper}
      aria-pressed={active === 'upper'}
      onClick={() => onSelect('upper')}
    >
      UPPER
    </button>
    {showBoth ? (
      <button
        type="button"
        className={
          active === 'both'
            ? 'clinical-arch-switcher__btn clinical-arch-switcher__btn--active'
            : 'clinical-arch-switcher__btn'
        }
        data-testid={`${testId}-both`}
        disabled={disabled || !hasUpper || !hasLower}
        aria-pressed={active === 'both'}
        onClick={() => onSelect('both')}
      >
        BOTH
      </button>
    ) : null}
    <button
      type="button"
      className={
        active === 'lower'
          ? 'clinical-arch-switcher__btn clinical-arch-switcher__btn--active'
          : 'clinical-arch-switcher__btn'
      }
      data-testid={`${testId}-lower`}
      disabled={disabled || !hasLower}
      aria-pressed={active === 'lower'}
      onClick={() => onSelect('lower')}
    >
      LOWER
    </button>
  </div>
);
