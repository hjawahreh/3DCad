module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'domain-inward-only',
      severity: 'error',
      from: { path: '^packages/app-domain' },
      to: { path: '^(apps|packages/(app-ui|viewport|viewport-runtime|interaction-runtime|camera-runtime|selection-runtime|project-runtime|import-runtime|scene|tool-runtime))' }
    },
    {
      name: 'ui-no-viewport-internals',
      severity: 'error',
      from: { path: '^packages/app-ui' },
      to: { path: '^packages/viewport/(?!public)' }
    }
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'tsconfig.json' } }
};
