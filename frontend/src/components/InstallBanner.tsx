/**
 * PWA install banner
 */

import { useState } from 'react';
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
    <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between border-t border-border bg-bg-secondary p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-slide-up">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-2xl font-bold text-white">+</span>
        <div className="flex flex-col">
          <strong className="text-sm">Install HUSH</strong>
          <span className="text-xs text-text-secondary">Add to home screen for the best experience</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setDismissed(true)} className="cursor-pointer rounded border border-border bg-transparent px-4 py-2 text-text-secondary hover:bg-bg-tertiary">
          Later
        </button>
        <button onClick={handleInstall} className="cursor-pointer rounded border-0 bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover">
          Install
        </button>
      </div>
    </div>
  );
}
