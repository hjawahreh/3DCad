# Materials

`MaterialRegistry` stores generic material descriptors independent of scene objects.

Supported kinds: `pbr`, `unlit`, `wireframe`, `points`, `lines`, `transparent`, `custom`. Each kind has frozen default parameters (`defaultParams`).

`create` merges caller params over defaults and assigns version `1`. `createInstance` clones a parent with optional overrides and records `parentId`. `update` merges params and increments `version`. `list` / `remove` / `clear` manage registry membership.

Materials hold parameter bags only. They do not upload GPU state; binding to pipelines and shaders is a higher-layer concern outside product logic in this package.
