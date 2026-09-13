/**
 * Structured case-validation result for clinical import UI.
 * Shows ERROR / WARNING / INFO without internal implementation details.
 */

import type { ClinicalCaseValidationReport } from '../case/ClinicalCaseValidation.js';
import {
  clinicalFindingLabel,
  clinicalFindingMessage,
  clinicalVerdictSummary
} from './ClinicalImportPresentation.js';

export const ClinicalCaseValidationPanel = ({
  report,
  compact
}: {
  readonly report: ClinicalCaseValidationReport;
  readonly compact?: boolean;
}): React.JSX.Element => {
  const errors = report.findings.filter((f) => f.severity === 'ERROR');
  const warnings = report.findings.filter((f) => f.severity === 'WARNING');
  const infos = report.findings.filter((f) => f.severity === 'INFO');
  const visible =
    compact === true
      ? [...errors, ...warnings]
      : [...errors, ...warnings, ...infos];

  const verdictClass =
    report.verdict === 'PASS'
      ? 'clinical-case-validation__verdict clinical-case-validation__verdict--pass'
      : report.verdict === 'FAIL'
        ? 'clinical-case-validation__verdict clinical-case-validation__verdict--fail'
        : 'clinical-case-validation__verdict clinical-case-validation__verdict--warning';

  return (
    <section
      className="clinical-case-validation"
      data-testid="clinical-case-validation"
      aria-label="Import validation"
    >
      <p className={verdictClass} data-testid="clinical-case-validation-verdict">
        <strong>{report.verdict}</strong>
        <span>{clinicalVerdictSummary(report)}</span>
      </p>
      {visible.length > 0 ? (
        <ul className="clinical-case-validation__list" data-testid="clinical-case-validation-findings">
          {visible.map((finding, index) => (
            <li
              key={`${finding.id}-${String(index)}`}
              className={`clinical-case-validation__item clinical-case-validation__item--${finding.severity.toLowerCase()}`}
            >
              <strong>{clinicalFindingLabel(finding)}</strong>
              <span>{clinicalFindingMessage(finding)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No additional findings.</p>
      )}
      {compact === true && infos.length > 0 ? (
        <p className="muted clinical-case-validation__info-count">
          {String(infos.length)} informational note(s) recorded.
        </p>
      ) : null}
    </section>
  );
};
