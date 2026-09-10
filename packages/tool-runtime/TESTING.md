# Testing

## Suites

- `lifecycle.test.ts` — preview → kernel → commit / cancel / deny  
- `workflow-gate.test.ts` — advance requires token  
- `architecture.test.ts` — kinds, concurrency, preview opacity  
- `subsystems.test.ts` — registry, validation, retry, metrics  
- `constitution.test.ts` — ADR / §17 invariants  

## Command

`pnpm --filter @cad-studio/tool-runtime test`
