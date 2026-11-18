// Sign-in with the serial number of a device that is connected to the ACS (Oktopus).

import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, explain } from '../api';
import type { SessionInfo } from '../api';
import { Icon } from '../ui';

export function Login({ info, onDone, notice }: { info: SessionInfo | null; onDone: (sn: string) => void; notice: string | null }) {
  const [serial, setSerial] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!serial.trim()) { setError('Enter the device serial number.'); return; }
    if (info?.codeRequired && !code) { setError('Enter the access code.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(serial.trim(), code);
      onDone(r.sn);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-brand">TINNO</div>
        <h1>LCM Service Marketplace</h1>
        <p className="muted">Sign in with the serial number of your modem. The modem must be connected to the ACS.</p>
        {notice && <div className="banner info"><Icon name="clock" />{notice}</div>}
        <label className="field">Device serial number
          <input name="serial" autoComplete="username" autoCapitalize="characters" spellCheck={false} placeholder="e.g. ZT2607000024"
            value={serial} onChange={(e) => { setSerial(e.target.value); setError(null); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} autoFocus />
        </label>
        {info?.codeRequired && (
          <label className="field">Access code
            <input name="code" type="password" autoComplete="current-password" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} />
          </label>
        )}
        {error && <div id="login-error" className="field-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
        <button className="btn bp wide" type="submit" disabled={busy}>{busy ? 'Checking with the ACS…' : 'Sign in'}</button>
        {info?.demoHint && <p className="muted small center">Demo mode: sign in with <button type="button" className="linklike" onClick={() => setSerial(info.demoHint as string)}>{info.demoHint}</button>. Nothing is sent to a real modem.</p>}
      </form>
    </div>
  );
}
