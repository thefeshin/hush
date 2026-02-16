/**
 * Update available notification
 */

import { useState, useEffect } from 'react';
import { onUpdateAvailable, applyUpdate } from '../services/serviceWorker';

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    onUpdateAvailable(() => {
      setUpdateAvailable(true);
    });
  }, []);

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center gap-4 bg-accent px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-white">
      <span>A new version is available</span>
      <button onClick={applyUpdate} className="cursor-pointer rounded border-0 bg-white px-3 py-1 font-semibold text-accent transition-colors hover:bg-slate-200">
        Update Now
      </button>
    </div>
  );
}
