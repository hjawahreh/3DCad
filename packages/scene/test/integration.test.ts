import { describe, expect, it } from 'vitest';
import {
  SceneProjectionEngine,
  asDocumentRevisionId,
  asDomainEntityId,
  createDocumentEntity,
  createDocumentRevision,
  translate
} from '../src/index.js';

describe('scene integration', () => {
  it('runs full pipeline: diff → map → bounds → visibility → picking → snapshot', () => {
    const engine = new SceneProjectionEngine({ now: () => 10 });
    const v1 = engine.project(
      createDocumentRevision(asDocumentRevisionId(1), [
        createDocumentEntity({
          id: asDomainEntityId('root'),
          kind: 'assembly',
          transform: translate(0, 0, 0),
          geometryRef: 'g1'
        })
      ])
    );
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;

    const pickingId = v1.value.snapshot.renderables[0]?.pickingId;
    expect(pickingId).toBeDefined();

    const v2 = engine.project(
      createDocumentRevision(asDocumentRevisionId(2), [
        createDocumentEntity({
          id: asDomainEntityId('root'),
          kind: 'assembly',
          visible: false,
          transform: translate(2, 0, 0),
          geometryRef: 'g1'
        }),
        createDocumentEntity({
          id: asDomainEntityId('child'),
          kind: 'mesh',
          layer: 'world',
          geometryRef: 'g2'
        })
      ])
    );
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;

    const root = v2.value.snapshot.renderables.find((r) => r.domainEntityId === 'root');
    expect(root?.pickingId).toBe(pickingId);
    expect(root?.visibility.visible).toBe(false);
    expect(root?.selectionProxy.selectable).toBe(false);
    expect(v2.value.snapshot.renderables).toHaveLength(2);
    expect(engine.currentSnapshot()?.sceneRevision).toBe(2);
    expect(engine.getLifecyclePhase()).toBe('ready');
    engine.dispose();
  });
});
