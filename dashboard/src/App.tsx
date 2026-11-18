// App shell: sidebar + header, hash routing, shared data (device, apps, jobs, services) and job actions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVE, api, explain, setAuthLostHandler } from './api';
import type { InstalledApp, Job, JobOp, ServiceSummary, SessionInfo } from './api';
import { CATEGORY, Icon, Modal, OP_LABEL, Toasts, usePoll, useToasts } from './ui';
import { Marketplace } from './pages/Marketplace';
import { InstalledApps } from './pages/InstalledApps';
import { Jobs } from './pages/Jobs';
import { Login } from './pages/Login';

export interface Ctx {
  sn: string | null;
  online: boolean | null;
  services: ServiceSummary[];
  apps: InstalledApp[];
  jobs: Job[];
  activeJobs: Job[];
  appFor: (serviceId: string) => InstalledApp | undefined;
  busy: (serviceId: string) => boolean;
  ask: (a: Ask) => void;
  act: (op: JobOp, service: string, version?: string) => Promise<void>;
  refreshAll: () => void;
  servicesError: unknown;
  appsError: unknown;
  jobsError: unknown;
  toast: (kind: 'ok' | 'bad' | 'info', text: string) => void;
}

export type Ask =
  | { kind: 'install'; service: ServiceSummary }
  | { kind: 'update'; service: ServiceSummary; app: InstalledApp }
  | { kind: 'uninstall'; service: ServiceSummary | null; app: InstalledApp }
  | { kind: 'start' | 'stop'; service: ServiceSummary | null; app: InstalledApp };

function useRoute(): [string, URLSearchParams] {
  const read = () => {
    const h = window.location.hash.replace(/^#/, '') || '/';
    const [path, q = ''] = h.split('?');
    return [path, new URLSearchParams(q)] as [string, URLSearchParams];
  };
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

/** Root: shows the sign-in page until the backend reports a session (or sign-in is turned off). */
export function App() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const check = useCallback(async () => {
    try {
      setInfo(await api.session());
      setFailed(null);
    } catch (e) {
      setFailed(explain(e));
    }
  }, []);
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    setAuthLostHandler(() => {
      setNotice('Your session ended. Sign in again.');
      setInfo((i) => (i ? { ...i, authenticated: false, sn: null } : i));
    });
    return () => setAuthLostHandler(null);
  }, []);

  if (failed && !info) {
    return <div className="login-page"><div className="login-card"><div className="login-brand">TINNO</div><div className="banner bad"><Icon name="alert" />{failed}</div><button className="btn bp wide" onClick={check}>Try again</button></div></div>;
  }
  if (!info) return <div className="login-page"><div className="login-card center muted">Loading…</div></div>;
  if (info.authMode === 'serial' && !info.authenticated) {
    return <Login info={info} notice={notice} onDone={() => { setNotice(null); window.location.hash = '#/'; void check(); }} />;
  }
  const logout = async () => {
    try { await api.logout(); } catch { /* signed out anyway */ }
    setNotice(null);
    setInfo({ ...info, authenticated: false, sn: null });
  };
  return <Dashboard key={info.sn ?? 'open'} signedIn={info.authMode === 'serial' ? info.sn : null} demo={Boolean(info.demoHint)} onLogout={logout} />;
}

function Dashboard({ signedIn, demo, onLogout }: { signedIn: string | null; demo: boolean; onLogout: () => void }) {
  const [path, query] = useRoute();
  const { toasts, push, dismiss } = useToasts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [asking, setAsking] = useState<Ask | null>(null);

  const devices = usePoll(api.devices, 15_000);
  const device = devices.data?.[0] ?? null;
  const sn = device?.sn ?? null;
  const services = usePoll(api.services, 60_000);
  const apps = usePoll(() => (sn && device?.online ? api.apps(sn) : Promise.resolve([] as InstalledApp[])), 10_000, [sn, device?.online]);
  const [fast, setFast] = useState(false);
  const jobs = usePoll(() => api.jobs(sn ?? undefined), fast ? 2_000 : 10_000, [sn, fast]);

  const jobList = jobs.data ?? [];
  const activeJobs = useMemo(() => jobList.filter((j) => ACTIVE.includes(j.state)), [jobList]);
  useEffect(() => setFast(activeJobs.length > 0), [activeJobs.length]);

  // Tell the operator when a job finishes, and refresh the apps.
  const seen = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const first = seen.current.size === 0;
    for (const j of jobList) {
      const before = seen.current.get(j.id);
      if (!first && before && ACTIVE.includes(before as Job['state']) && !ACTIVE.includes(j.state)) {
        const what = `${OP_LABEL[j.op]} ${nameOf(services.data, j.serviceId)}${j.version && j.op !== 'start' && j.op !== 'stop' ? ` ${j.version}` : ''}`;
        if (j.state === 'succeeded') push('ok', `${what}: done (${j.message ?? 'ok'})`);
        else push('bad', `${what}: ${j.state === 'timed_out' ? 'timed out' : 'failed'}${j.message ? ` — ${j.message}` : ''}`);
        void apps.reload();
      }
      seen.current.set(j.id, j.state);
    }
  }, [jobList]); // eslint-disable-line react-hooks/exhaustive-deps

  const appFor = useCallback((serviceId: string) => (apps.data ?? []).find((a) => a.serviceId === serviceId), [apps.data]);
  const busy = useCallback((serviceId: string) => activeJobs.some((j) => j.serviceId === serviceId), [activeJobs]);
  const refreshAll = useCallback(() => {
    void devices.reload(); void services.reload(); void apps.reload(); void jobs.reload();
  }, [devices, services, apps, jobs]);

  const run = useCallback(async (op: JobOp, service: string, version?: string) => {
    if (!sn) return;
    try {
      const j = await api.createJob(sn, { op, service, version });
      seen.current.set(j.id, j.state);
      push('info', `${OP_LABEL[op]} ${nameOf(services.data, service)} sent to the modem`);
      setFast(true);
      void jobs.reload();
    } catch (e) {
      push('bad', explain(e));
    }
  }, [sn, push, jobs, services.data]);

  const ctx: Ctx = {
    sn, online: device ? device.online : null,
    services: services.data ?? [], apps: apps.data ?? [], jobs: jobList, activeJobs,
    appFor, busy, ask: setAsking, act: run, refreshAll,
    servicesError: services.error, appsError: apps.error, jobsError: jobs.error, toast: push,
  };

  const page = path.startsWith('/jobs') ? 'jobs' : path.startsWith('/installed') ? 'installed' : 'store';
  const cat = page === 'store' ? query.get('cat') ?? 'all' : null;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ctx.services.length };
    for (const s of ctx.services) c[s.category] = (c[s.category] ?? 0) + 1;
    return c;
  }, [ctx.services]);

  const heading = page === 'jobs' ? 'Jobs' : page === 'installed' ? 'Installed Apps' : 'LCM Service Marketplace';
  const sub = device ? `${device.sn} · ${device.model || 'D4.0 cable modem'} · RDK-B · Operator portal` : 'Operator portal';
  const nav = (href: string, icon: string, label: string, on: boolean, count?: number) => (
    <a href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
      <Icon name={icon} /><span>{label}</span>{count !== undefined && <span className="count">{count}</span>}
    </a>
  );

  return (
    <div className="shell">
      <aside className={`side ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><span>TINNO</span></div>
        <nav className="nav" aria-label="Main">
          <div className="navh">CATEGORIES</div>
          {nav('#/', 'grid', 'All services', cat === 'all', counts.all)}
          {Object.entries(CATEGORY).map(([k, c]) => nav(`#/?cat=${k}`, c.icon, c.label, cat === k, counts[k] ?? 0))}
          <div className="navh">OPERATOR</div>
          {nav('#/installed', 'chip', 'Installed apps', page === 'installed', ctx.apps.length)}
          {nav('#/jobs', 'jobs', 'Jobs', page === 'jobs', activeJobs.length || undefined)}
        </nav>
      </aside>
      <div className="main-col">
        <header className="top">
          <button className="btn ib menu-btn" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}><Icon name="menu" size={24} /></button>
          <div className="titles">
            <h1>{heading}</h1>
            <div className="sub">{sub}</div>
          </div>
          {demo && <span className="pill demo">Demo · simulated modem</span>}
          <ModemPill online={ctx.online} error={devices.error} />
          {signedIn && <button className="btn logout" onClick={onLogout} title={`Signed in with ${signedIn}`}><Icon name="logout" size={18} />Logout</button>}
        </header>
        <main className="content">
          <div className="wrap">
            {devices.error !== null && devices.data === null && <div className="banner bad"><Icon name="alert" />{explain(devices.error)}</div>}
            {devices.data !== null && devices.data.length === 0 && <div className="banner bad"><Icon name="alert" />The backend does not see the modem in Oktopus. Check LCM_DEVICE_SN.</div>}
            {page === 'store' && <Marketplace ctx={ctx} cat={cat ?? 'all'} />}
            {page === 'installed' && <InstalledApps ctx={ctx} device={device} />}
            {page === 'jobs' && <Jobs ctx={ctx} selected={path.split('/')[2] ?? null} />}
          </div>
        </main>
      </div>
      {menuOpen && <div className="drawer-scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />}
      {asking && <AskDialog ask={asking} onClose={() => setAsking(null)} run={run} />}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function nameOf(services: ServiceSummary[] | null, id: string): string {
  return services?.find((s) => s.id === id)?.name ?? id.split('/').pop() ?? id;
}

function ModemPill({ online, error }: { online: boolean | null; error: unknown }) {
  if (error && online === null) return <span className="pill unknown"><span className="dot" />Backend unreachable</span>;
  if (online === null) return <span className="pill unknown"><span className="dot" />Checking modem…</span>;
  return online
    ? <span className="pill online"><span className="dot" />Modem online</span>
    : <span className="pill offline"><span className="dot" />Modem offline</span>;
}

function AskDialog({ ask, onClose, run }: { ask: Ask; onClose: () => void; run: (op: JobOp, service: string, version?: string) => Promise<void> }) {
  const svc = ask.service;
  const name = svc?.name ?? ('app' in ask ? ask.app.name : '');
  const current = 'app' in ask ? ask.app.version : null;
  const choices = svc ? svc.versions.filter((v) => v !== current) : [];
  const [version, setVersion] = useState(choices[0] ?? '');
  const [sending, setSending] = useState(false);
  const serviceId = svc?.id ?? ('app' in ask ? ask.app.serviceId ?? ask.app.name : '');
  const go = async () => {
    setSending(true);
    await run(ask.kind, serviceId, ask.kind === 'install' || ask.kind === 'update' ? version : undefined);
    setSending(false);
    onClose();
  };

  if (ask.kind === 'install' || ask.kind === 'update') {
    const s = ask.service;
    return (
      <Modal title={`${ask.kind === 'install' ? 'Install' : 'Update'} ${s.name}`} onClose={onClose}
        footer={<>
          <button className="btn bo" onClick={onClose}>Cancel</button>
          <button className="btn bp primary" disabled={!version || sending} onClick={go}>
            <Icon name={ask.kind === 'install' ? 'plus' : 'up'} size={18} />{sending ? 'Sending…' : ask.kind === 'install' ? 'Install' : `Update to ${version}`}
          </button>
        </>}>
        <label className="field">Version
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {choices.map((v) => <option key={v} value={v}>{v}{v === s.latest ? ' (latest)' : ''}</option>)}
          </select>
        </label>
        {ask.kind === 'update' && <p className="muted">Currently {current}. The app is stopped, rebuilt from the new image and started again. Data the app has saved is kept.</p>}
        <dl className="facts">
          <dt>Service</dt><dd className="mono">{s.id}</dd>
          <dt>Network</dt><dd>{s.network === 'shared' ? 'Shares the modem network (host interfaces)' : s.network === 'none' ? 'No network' : 'Own address on br-lcm'}</dd>
          <dt>Privileged</dt><dd>{s.privileged ? 'Yes' : 'No'}</dd>
        </dl>
        <p className="muted small">The modem pulls the image from GitLab. A large image can take several minutes; the job gives up after 16 minutes.</p>
      </Modal>
    );
  }
  const verb = OP_LABEL[ask.kind];
  return (
    <Modal title={`${verb} ${name}?`} onClose={onClose}
      footer={<>
        <button className="btn bo" onClick={onClose}>Cancel</button>
        <button className={`btn primary ${ask.kind === 'uninstall' ? 'danger' : 'bp'}`} disabled={sending} onClick={go}>
          <Icon name={ask.kind === 'uninstall' ? 'trash' : ask.kind === 'stop' ? 'stop' : 'play'} size={18} />{sending ? 'Sending…' : verb}
        </button>
      </>}>
      {ask.kind === 'uninstall' && <p>This removes <b>{name} {ask.app.version}</b> and its data from the modem. You can install it again later from the marketplace.</p>}
      {ask.kind === 'stop' && <p>The app's container stops on the modem until you start it again.</p>}
      {ask.kind === 'start' && <p>Starts the container on the modem.</p>}
    </Modal>
  );
}
