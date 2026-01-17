/**
 * UUID sharing component
 * Allows users to copy or display QR code of their UUID
 */

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '../stores/authStore';

export function UUIDShare() {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const identity = useAuthStore(state => state.identity);

  if (!identity) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(identity.userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = identity.userId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="uuid-share">
      <h3>Your Chat Address</h3>
      <p className="subtitle">
        Share this with people you want to chat with.
        They'll need it to start a conversation with you.
      </p>

      <div className="uuid-display">
        <code>{identity.userId}</code>
        <button
          onClick={handleCopy}
          className="copy-button"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <button
        onClick={() => setShowQR(!showQR)}
        className="toggle-qr-button"
      >
        {showQR ? 'Hide QR Code' : 'Show QR Code'}
      </button>

      {showQR && (
        <div className="qr-container">
          <QRCodeSVG
            value={identity.userId}
            size={200}
            level="M"
            includeMargin={true}
            bgColor="#ffffff"
            fgColor="#000000"
          />
          <p className="qr-hint">Scan to get UUID</p>
        </div>
      )}

      <div className="warning">
        <strong>Important:</strong> Only share your UUID with people you trust.
        Anyone with your UUID can send you messages.
      </div>
    </div>
  );
}
