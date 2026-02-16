/**
 * Application entry point with PWA support
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './services/serviceWorker';
import './styles/tailwind.css';

// Register service worker
registerServiceWorker();

// Render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
