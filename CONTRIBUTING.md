# Contributing to CAD Studio

All contributions begin with an approved work item and must preserve `ARCHITECTURE.md`.

## Workflow

1. Branch from `main` using `type/short-description`: `feature`, `fix`, `docs`, `build`, `chore`, `perf`, `refactor`, or `test`.
2. Keep commits in Conventional Commit form: `type(scope): imperative summary`.
3. Run `pnpm check` and the relevant Rust/C++ checks before opening a pull request.
4. Describe architectural impact, tests, performance impact, and contract/version changes in the pull request.
5. Obtain required CODEOWNERS approval. Merge is squash-only after required checks pass.

`main` is protected and always releasable. Release branches are cut only for stabilization (`release/x.y`); urgent fixes use `hotfix/x.y.z`. No direct pushes, force pushes, or unreviewed dependency updates are allowed on protected branches.

## Definition of done

The change has a single owner, tests at the lowest useful boundary, documentation for public behavior, no unapproved dependency-rule change, and a migration/rollback statement if it changes a durable contract.
