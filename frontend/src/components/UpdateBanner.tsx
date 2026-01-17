/**
 * Update available notification
 */

import React, { useState, useEffect } from 'react';
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
    <div className="update-banner">
      <span>A new version is available</span>
      <button onClick={applyUpdate} className="update-button">
        Update Now
      </button>
    </div>
  );
}
