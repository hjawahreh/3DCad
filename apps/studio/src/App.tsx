import { useEffect, useMemo, useState } from 'react';
import { ClinicalApplication } from './clinical/ClinicalApplication.js';
import { ClinicalShell } from './clinical/shell/ClinicalShell.js';
import type { ClinicalWorkspace } from './clinical/workspace/ClinicalWorkspace.js';

export const App = (): React.JSX.Element => {
  const app = useMemo(() => new ClinicalApplication(), []);
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const forceMock =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('mockViewport') === '1';
      const started = app.start({
        forceMockViewportBackend: forceMock,
        configuration: {
          forceMockViewportBackend: forceMock
        }
      });
      setWorkspace(started.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clinical bootstrap failed');
    }
    return () => {
      void app.shutdown();
    };
  }, [app]);

  if (error !== undefined) {
    return <div className="boot-error">Startup failed: {error}</div>;
  }
  if (workspace === undefined) {
    return <div className="boot-loading">Starting CAD Studio Clinical…</div>;
  }
  return <ClinicalShell workspace={workspace} />;
};
