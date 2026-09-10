import { useSyncExternalStore } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';

export const NotificationHostView = ({
  root
}: {
  readonly root: StudioCompositionRoot;
}): React.JSX.Element => {
  const items = useSyncExternalStore(
    (onChange) => root.notifications.subscribe(() => onChange()),
    () => root.notifications.list(),
    () => root.notifications.list()
  );

  if (items.length === 0) {
    return <div className="notification-host" aria-live="polite" />;
  }

  return (
    <div className="notification-host" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`notification notification--${item.kind}`}>
          <div className="notification__title">{item.title}</div>
          <div className="notification__message">{item.message}</div>
          {item.progress !== undefined ? (
            <div className="notification__progress">
              <div style={{ width: `${String(Math.round(item.progress * 100))}%` }} />
            </div>
          ) : null}
          <button
            type="button"
            className="notification__dismiss"
            onClick={() => root.notifications.dismiss(item.id)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
};
