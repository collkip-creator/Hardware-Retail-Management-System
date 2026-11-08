import { FormEvent, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type LocalStatus = {
  setupRequired: boolean;
  deviceId: string;
  staffCount: number;
  schemaVersion: number;
};

type StaffSession = {
  staffId: string;
  username: string;
  displayName: string;
  role: string;
  branchId: string | null;
};

export default function DesktopApp() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    invoke<LocalStatus>('get_local_status')
      .then(setStatus)
      .catch((reason) => setError(String(reason)))
      .finally(() => setLoading(false));

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = status?.setupRequired
        ? await invoke<StaffSession>('setup_owner', {
            displayName,
            username,
            password,
          })
        : await invoke<StaffSession>('login_staff', {
            username,
            password,
          });
      setSession(result);
      setPassword('');
      const refreshed = await invoke<LocalStatus>('get_local_status');
      setStatus(refreshed);
    } catch (reason) {
      setError(String(reason).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="screen"><div className="loading">Preparing your local workspace…</div></main>;
  }

  if (!status) {
    return (
      <main className="screen">
        <section className="panel narrow">
          <Brand />
          <h1>Unable to open local workspace</h1>
          <p className="muted">The local database could not be initialised. Your existing cloud workspace has not been changed.</p>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="screen">
        <section className="panel narrow">
          <Brand />
          <div className="status-line">
            <span className={online ? 'dot online' : 'dot offline'} />
            {online ? 'Internet available' : 'Offline mode'}
            <span className="status-separator">·</span>
            Local database ready
          </div>
          <h1>{status.setupRequired ? 'Set up this computer' : 'Sign in to your business'}</h1>
          <p className="muted">
            {status.setupRequired
              ? 'Create the first Business Owner account. This account is stored securely on this computer.'
              : 'Use your local staff username and password. Internet access is not required for staff sign-in once their account is on this computer.'}
          </p>
          <form onSubmit={submit}>
            {status.setupRequired && (
              <label>
                Your name
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} />
              </label>
            )}
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={40} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={status.setupRequired ? 'new-password' : 'current-password'} required minLength={status.setupRequired ? 12 : 1} maxLength={128} />
              {status.setupRequired && <small>Use at least 12 characters.</small>}
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : status.setupRequired ? 'Create owner account' : 'Sign in'}
            </button>
          </form>
          <div className="footnote">Device ID: {status.deviceId.slice(0, 8)}…</div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="workspace">
        <header className="topbar">
          <Brand compact />
          <div className="top-actions">
            <span className="status-line"><span className={online ? 'dot online' : 'dot offline'} />{online ? 'Online' : 'Offline'}</span>
            <button className="secondary" onClick={() => setSession(null)}>Sign out</button>
          </div>
        </header>
        <div className="welcome">
          <p className="eyebrow">LOCAL DESKTOP WORKSPACE</p>
          <h1>Welcome, {session.displayName}</h1>
          <p className="muted">{session.role} · Signed in on this computer</p>
        </div>
        <div className="grid">
          <article className="info-card">
            <span className="card-label">Local database</span>
            <strong>Ready</strong>
            <p>SQLite database created and stored on this computer.</p>
          </article>
          <article className="info-card">
            <span className="card-label">Staff accounts</span>
            <strong>{status.staffCount}</strong>
            <p>Local account records available on this device.</p>
          </article>
          <article className="info-card">
            <span className="card-label">Synchronisation</span>
            <strong>Foundation ready</strong>
            <p>Local sync queue and device identity tables are in place. Network sync will be connected in a later step.</p>
          </article>
        </div>
        <section className="notice">
          <h2>Desktop foundation installed</h2>
          <p>This first build establishes the Windows shell, local database, and offline-capable staff sign-in. The POS, stock, purchasing, and accounting workflows are being migrated onto this local data layer in the next stages.</p>
          <p className="muted">Your existing AppDeploy browser application remains separate and unchanged.</p>
        </section>
        <footer className="workspace-footer">
          <span>Device: {status.deviceId}</span>
          <span>Database schema v{status.schemaVersion}</span>
        </footer>
      </section>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand compact' : 'brand'}>
      <div className="brand-mark">HR</div>
      <div>
        <strong>Hardware Retail</strong>
        <span>Management System</span>
      </div>
    </div>
  );
}
