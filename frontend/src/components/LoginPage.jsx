import React, { useState, useEffect } from 'react';
import { 
  Lock, User, ArrowRight, Eye, EyeOff, ShieldCheck, 
  Settings, Wifi, RefreshCw, CheckCircle2, AlertCircle, Smartphone 
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Discreet server setting modal for mobile Wi-Fi IP debugging
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverHost, setServerHost] = useState(
    localStorage.getItem('finecons_api_host') || 'http://192.168.10.73:8000'
  );
  const [testStatus, setTestStatus] = useState(null);
  const [testMsg, setTestMsg] = useState('');

  // Check if running on mobile device or native app
  const isMobile = Capacitor.isNativePlatform() || 
    (typeof window !== 'undefined' && (window.innerWidth <= 768 || window.Capacitor?.isNativePlatform?.()));

  useEffect(() => {
    // Check if user was previously remembered
    const remembered = localStorage.getItem('finecons_remember_me');
    if (remembered === 'true') {
      setStaySignedIn(true);
    }
  }, []);

  const handleTestConnection = async (hostToTest) => {
    const target = (hostToTest || serverHost).trim().replace(/\/+$/, '');
    setTestStatus('testing');
    setTestMsg('Pinging backend on port 8000...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${target}/api/invoices`, { 
        method: 'GET',
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        setTestStatus('success');
        setTestMsg('Connected! Backend on port 8000 is active.');
        localStorage.setItem('finecons_api_host', target);
      } else {
        setTestStatus('error');
        setTestMsg(`Server returned HTTP ${res.status}`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMsg(`Cannot reach ${target}. Verify Wi-Fi network and port 8000.`);
    }
  };

  const handleSaveHost = (newHost) => {
    const clean = newHost.trim().replace(/\/+$/, '');
    setServerHost(clean);
    localStorage.setItem('finecons_api_host', clean);
    handleTestConnection(clean);
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Login failed. Please verify credentials.');
      }

      // Store authentication tokens & session
      localStorage.setItem('finecons_rms_token', data.token);
      localStorage.setItem('finecons_rms_user', JSON.stringify(data.user));
      if (isMobile) {
        localStorage.setItem('finecons_remember_me', staySignedIn ? 'true' : 'false');
      }

      onLoginSuccess(data.user);
    } catch (err) {
      const currentHost = localStorage.getItem('finecons_api_host') || 'http://192.168.10.73:8000';
      if (err.name === 'TypeError' || err.message?.toLowerCase().includes('fetch')) {
        setError(`Unable to connect to RMS server at ${currentHost}. Check Wi-Fi connection.`);
      } else {
        setError(err.message || 'Login failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      {/* Background Decorative Mesh Elements */}
      <div className="login-bg-mesh">
        <div className="mesh-circle mesh-1"></div>
        <div className="mesh-circle mesh-2"></div>
      </div>

      {/* Discrete Server Settings Launcher (top right) */}
      <button 
        type="button" 
        className="login-server-icon-btn" 
        onClick={() => setShowServerModal(true)}
        title="Server Network Settings"
        aria-label="Server Network Settings"
      >
        <Settings size={17} />
      </button>

      {/* Glassmorphic Login Card */}
      <div className="glass-login-card">
        {/* Brand Header */}
        <div className="glass-login-header">
          <div className="login-logo-container">
            <img src="/finecons_logo.png" alt="Finecons" className="login-logo" />
          </div>
          <h1 className="glass-brand-title">Finecons Private Limited</h1>
          <div className="glass-brand-badge">RMS • Receivables Management System</div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="glass-login-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="glass-login-form">
          <div className="form-group">
            <label htmlFor="login-username">Username</label>
            <div className="glass-input-box">
              <User size={18} className="input-icon-left" />
              <input 
                id="login-username"
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <div className="glass-input-box">
              <Lock size={18} className="input-icon-left" />
              <input 
                id="login-password"
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Mobile-Only Stay Signed In Checkbox */}
          {isMobile && (
            <div className="mobile-stay-signed-in">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={staySignedIn} 
                  onChange={e => setStaySignedIn(e.target.checked)} 
                />
                <span>Stay signed in on this device</span>
              </label>
            </div>
          )}

          {/* Sign In Button */}
          <button 
            type="submit" 
            className="glass-submit-btn"
            disabled={loading}
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Subtle Corporate Footer */}
        <div className="glass-login-footer">
          <ShieldCheck size={14} color="var(--fc-navy-600)" />
          <span>Enterprise Secure Portal • Finecons Private Limited</span>
        </div>
      </div>

      {/* Discrete Developer Server Config Modal */}
      {showServerModal && (
        <div className="modal-overlay" onClick={() => setShowServerModal(false)}>
          <div className="server-modal-card" onClick={e => e.stopPropagation()}>
            <div className="server-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wifi size={18} color="var(--fc-orange-600)" />
                <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>Server Connection</h3>
              </div>
              <button 
                type="button" 
                className="close-btn" 
                onClick={() => setShowServerModal(false)}
              >
                ×
              </button>
            </div>

            <div className="server-modal-body">
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                Active backend host: <code>{serverHost}</code>
              </p>

              <div className="server-preset-grid">
                <button
                  type="button"
                  className={`server-preset-btn ${serverHost === 'http://192.168.10.73:8000' ? 'active' : ''}`}
                  onClick={() => handleSaveHost('http://192.168.10.73:8000')}
                >
                  <Smartphone size={14} />
                  <span>Physical Phone (Wi-Fi: 192.168.10.73:8000)</span>
                </button>
                <button
                  type="button"
                  className={`server-preset-btn ${serverHost === 'http://localhost:8000' ? 'active' : ''}`}
                  onClick={() => handleSaveHost('http://localhost:8000')}
                >
                  <RefreshCw size={14} />
                  <span>ADB Tunnel (localhost:8000)</span>
                </button>
                <button
                  type="button"
                  className={`server-preset-btn ${serverHost === 'http://10.0.2.2:8000' ? 'active' : ''}`}
                  onClick={() => handleSaveHost('http://10.0.2.2:8000')}
                >
                  <span>Android Studio Emulator (10.0.2.2:8000)</span>
                </button>
              </div>

              <div className="server-input-row" style={{ marginTop: '0.75rem' }}>
                <input
                  type="text"
                  value={serverHost}
                  onChange={(e) => setServerHost(e.target.value)}
                  placeholder="http://192.168.10.73:8000"
                />
                <button
                  type="button"
                  className="server-save-btn"
                  onClick={() => handleSaveHost(serverHost)}
                  disabled={testStatus === 'testing'}
                >
                  {testStatus === 'testing' ? 'Testing...' : 'Test & Save'}
                </button>
              </div>

              {testMsg && (
                <div className={`server-test-msg ${testStatus}`}>
                  {testStatus === 'success' && <CheckCircle2 size={14} color="#16a34a" />}
                  {testStatus === 'error' && <AlertCircle size={14} color="#dc2626" />}
                  {testStatus === 'testing' && <RefreshCw size={14} className="spin" />}
                  <span>{testMsg}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
