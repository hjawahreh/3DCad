# Quality Gates and CI Evidence

No pull request merges unless formatting, linting, type checking, dependency rules, architecture documentation validation, unit tests, integration tests, security analysis, and required performance checks pass. Required checks are branch-protection rules, not reviewer convention.

Performance thresholds use versioned benchmark corpora and reference environments. A regression requires an approved ADR or a baseline update that states the cause, affected hardware, and remediation owner. Flaky tests are quarantined only with an issue, owner, expiry date, and a non-blocking replacement signal; they cannot silently disappear.

Documentation validation verifies Markdown syntax, links, required package documents, and ADR metadata. Security validation includes dependency audit, secret scanning, static analysis, and artifact/SBOM generation on release paths.
