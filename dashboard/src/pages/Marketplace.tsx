// Marketplace: search + filters, featured service, service grid, live progress of the active job.

import { useMemo, useState } from 'react';
import type { Ctx } from '../App';
import type { InstalledApp, Job, ServiceSummary } from '../api';
import { explain } from '../api';
import { CATEGORY, Icon, OP_LABEL, fmtDuration, useNow } from '../ui';

type Filter = 'all' | 'installed' | 'updates' | `tier:${string}`;

export function Marketplace({ ctx, cat }: { ctx: Ctx; cat: string }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const tiers = useMemo(() => [...new Set(ctx.services.map((s) => s.tier).filter((t) => t !== 'All'))].sort(), [ctx.services]);

  const visible = ctx.services.filter((s) => {
    const app = ctx.appFor(s.id);
    if (cat !== 'all' && s.category !== cat) return false;
    if (q && !`${s.name} ${s.description} ${s.id}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'installed' && !app) return false;
    if (filter === 'updates' && !app?.updateAvailable) return false;
    if (filter.startsWith('tier:') && s.tier !== filter.slice(5)) return false;
    return true;
  });
  const plain = filter === 'all' && !q && cat === 'all';
  const hero = plain ? (ctx.services.find((s) => s.featured) ?? ctx.services.find((s) => ctx.appFor(s.id))) : undefined;
  const grid = visible.filter((s) => s !== hero);
  const chips: [Filter, string][] = [['all', 'All'], ['installed', 'Installed'], ['updates', 'Updates'], ...tiers.map((t) => [`tier:${t}`, t] as [Filter, string])];

  return (
    <>
      <section className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr">Search services</span>
          <input type="search" placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div role="group" aria-label="Filter" className="chips">
          {chips.map(([f, label]) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
      </section>

      {ctx.servicesError !== null && ctx.services.length === 0 && <div className="banner bad"><Icon name="alert" />Catalogue not available: {explain(ctx.servicesError)}</div>}

      {hero && <Hero ctx={ctx} s={hero} app={ctx.appFor(hero.id)} />}

      <section className="stack">
        <div className="sec">{cat === 'all' ? 'AVAILABLE SERVICES' : `${CATEGORY[cat]?.label.toUpperCase() ?? cat.toUpperCase()} SERVICES`}</div>
        {grid.length === 0
          ? <div className="card empty">{ctx.services.length === 0 ? 'No services in the catalogue yet. Add a project with an [lcm …] block to the GitLab group.' : 'No services match these filters.'}</div>
          : <div className="svc-grid">{grid.map((s) => <ServiceCard key={s.id} ctx={ctx} s={s} app={ctx.appFor(s.id)} />)}</div>}
      </section>

      {ctx.activeJobs.map((j) => <ActiveJob key={j.id} job={j} name={ctx.services.find((s) => s.id === j.serviceId)?.name ?? j.serviceId} />)}
    </>
  );
}

function statusBadges(app: InstalledApp | undefined, busy: boolean) {
  if (busy) return <span className="badge run"><Icon name="clock" size={14} />Job running</span>;
  if (!app) return null;
  const running = app.euStatus === 'Active';
  return (
    <>
      <span className={`badge ${running ? 'ok' : 'off'}`}>{running ? <Icon name="check" size={14} /> : <Icon name="stop" size={14} />}{running ? 'Running' : app.euStatus ?? 'Installed'} · {app.version}</span>
      {app.updateAvailable && <span className="badge warn"><Icon name="up" size={14} />{app.latest} available</span>}
    </>
  );
}

function Actions({ ctx, s, app, big = false }: { ctx: Ctx; s: ServiceSummary; app: InstalledApp | undefined; big?: boolean }) {
  const busy = ctx.busy(s.id);
  const offline = ctx.online === false;
  const why = offline ? 'The modem is offline' : busy ? 'A job for this app is running' : undefined;
  if (!app) {
    return <button className={`btn ${big ? 'bp' : 'bo'}`} disabled={busy || offline} title={why} onClick={() => ctx.ask({ kind: 'install', service: s })}><Icon name="plus" size={18} />Install</button>;
  }
  return (
    <>
      <a href="#/installed" className="btn bo">Manage</a>
      {app.updateAvailable && (
        <button className="btn bg" disabled={busy || offline} title={why} onClick={() => ctx.ask({ kind: 'update', service: s, app })}>
          <Icon name="up" size={18} />Update{big ? ` to ${app.latest}` : ''}
        </button>
      )}
    </>
  );
}

function Hero({ ctx, s, app }: { ctx: Ctx; s: ServiceSummary; app: InstalledApp | undefined }) {
  const c = CATEGORY[s.category] ?? CATEGORY.custom;
  return (
    <section className={`card hero ${app ? 'installed' : ''}`}>
      <div className={`ict big ${c.tint}`}><Icon name={c.icon} size={32} /></div>
      <div className="hero-text">
        <div className="badges">
          {statusBadges(app, ctx.busy(s.id))}
          <span className="badge off">{s.tier === 'All' ? 'All tiers' : s.tier}</span>
          {s.featured && <span className="badge feat">Featured</span>}
        </div>
        <h2 className="hero-title">{s.name}</h2>
        <p>{s.description || s.id}</p>
      </div>
      <div className="row-actions"><Actions ctx={ctx} s={s} app={app} big /></div>
    </section>
  );
}

function ServiceCard({ ctx, s, app }: { ctx: Ctx; s: ServiceSummary; app: InstalledApp | undefined }) {
  const c = CATEGORY[s.category] ?? CATEGORY.custom;
  if (!s.compatible.ok && !app) {
    return (
      <article className="svc incompatible">
        <div className="ict t-none"><Icon name={s.hw.includes('wifi') ? 'wifioff' : 'alert'} size={24} /></div>
        <h3>{s.name}</h3>
        <p>Not available: {s.compatible.reason}.</p>
        <div className="svc-foot"><span className="badge off">Not compatible</span></div>
      </article>
    );
  }
  return (
    <article className={`svc ${app ? 'installed' : ''}`}>
      <div className={`ict ${c.tint}`}><Icon name={c.icon} size={24} /></div>
      <h3>{s.name}</h3>
      <p>{s.description || s.id}</p>
      <div className="badges">{statusBadges(app, ctx.busy(s.id))}</div>
      <div className="svc-foot">
        <span className={`badge ${s.tier === 'Business' ? 'biz' : s.tier === 'All' ? 'off' : 'opr'}`}>{s.tier === 'All' ? 'All tiers' : s.tier}</span>
        <span className="muted small">{s.latest}</span>
        <span className="grow" />
        <Actions ctx={ctx} s={s} app={app} />
      </div>
    </article>
  );
}

const STEPS = [
  { icon: 'check', label: 'Queued' },
  { icon: 'send', label: 'Sent to modem' },
  { icon: 'cube', label: 'Working on modem' },
  { icon: 'flag', label: 'Result' },
];

export function stepOf(j: Job): number {
  return j.state === 'queued' ? 0 : j.state === 'sent' ? 1 : j.state === 'running' ? 2 : 3;
}

function ActiveJob({ job, name }: { job: Job; name: string }) {
  const now = useNow();
  const step = stepOf(job);
  const what = `${OP_LABEL[job.op]} ${name}${job.op === 'update' ? ` ${job.fromVersion} → ${job.version}` : job.op === 'install' ? ` ${job.version}` : ''}`;
  const hint = job.op === 'install' || job.op === 'update' ? 'the modem is pulling and starting the image' : job.op === 'uninstall' ? 'the modem is removing the app' : 'the modem is changing the app state';
  return (
    <section className="card stack" aria-live="polite">
      <div className="row">
        <div className="sec grow">ACTIVE JOB · {what.toUpperCase()}</div>
        <span className="muted small">{fmtDuration(now - Date.parse(job.createdAt))} · gives up after 16 min</span>
        <a href={`#/jobs/${job.id}`} className="strong">Details in Jobs</a>
      </div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.label} className={`step ${i < step ? 'done' : i === step ? 'now' : 'todo'}`}><Icon name={s.icon} size={18} /><span>{s.label}</span></li>
        ))}
      </ol>
      <div className="row">
        <div className="bar"><div style={{ width: `${((step + 1) / (STEPS.length + 1)) * 100}%` }} /></div>
        <span className="muted small strong">Step {step + 1} of {STEPS.length}{step === 2 ? ` · ${hint}` : ''}</span>
      </div>
    </section>
  );
}
