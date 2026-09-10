import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';
import { ViewportHostController } from './ViewportHostController.js';

export interface ViewportHostProps {
  readonly root: StudioCompositionRoot;
  readonly showGrid: boolean;
}

export const ViewportHost = ({ root, showGrid: _showGrid }: ViewportHostProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const host = new ViewportHostController(root);
    let cancelled = false;
    void host.mount(canvas).then((ok) => {
      if (cancelled) {
        return;
      }
      setReady(ok);
      if (!ok) {
        setError('Viewport failed to attach');
      }
    });
    return () => {
      cancelled = true;
      host.unmount();
    };
  }, [root]);

  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block',
    background: 'transparent'
  };

  return (
    <div className="viewport-host" data-ready={ready ? 'true' : 'false'}>
      <canvas ref={canvasRef} className="viewport-canvas" style={style} aria-label="Viewport" />
      {error !== undefined ? <div className="viewport-error">{error}</div> : null}
      {!ready && error === undefined ? <div className="viewport-loading">Initializing viewport…</div> : null}
    </div>
  );
};
