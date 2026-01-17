/**
 * PWA install banner
 */

import React, { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  if (dismissed || isInstalled || !canInstall) {
    return null;
  }

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (!installed) {
      setDismissed(true);
    }
  };

  return (
    <div className="install-banner">
      <div className="install-content">
        <span className="install-icon">+</span>
        <div className="install-text">
          <strong>Install HUSH</strong>
          <span>Add to home screen for the best experience</span>
        </div>
      </div>
      <div className="install-actions">
        <button onClick={() => setDismissed(true)} className="dismiss-button">
          Later
        </button>
        <button onClick={handleInstall} className="install-button">
          Install
        </button>
      </div>
    </div>
  );
}
