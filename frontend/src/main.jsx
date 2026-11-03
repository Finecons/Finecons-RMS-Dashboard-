import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

// When running inside native Android/iOS mobile app, route /api to the host computer's backend
const isMobileApp = Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) || (window.location.hostname === 'localhost' && !window.location.port);

if (isMobileApp) {
  const originalFetch = window.fetch;
  // Default to PC Wi-Fi IP (192.168.10.73:8000). On emulator or real phone, can also be configured via finecons_api_host
  window.fetch = (input, init) => {
    const rawHost = localStorage.getItem('finecons_api_host') || 'http://192.168.10.73:8000';
    const mobileApiHost = rawHost.replace(/\/+$/, '');
    if (typeof input === 'string' && input.startsWith('/api')) {
      input = `${mobileApiHost}${input}`;
    } else if (input instanceof Request && input.url.startsWith('/api')) {
      input = new Request(`${mobileApiHost}${input.url}`, input);
    }
    return originalFetch(input, init);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
