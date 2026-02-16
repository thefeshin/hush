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
    <div className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center gap-4 bg-zinc-700 px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-zinc-100">
      <span>A new version is available</span>
      <button onClick={applyUpdate} className="cursor-pointer rounded border-0 bg-zinc-100 px-3 py-1 font-semibold text-zinc-900 transition-colors hover:bg-white">
        Update Now
      </button>
    </div>
  );
}
