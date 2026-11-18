// Jobs (debugging): counts, filterable history, and the full record of one job.

import { useState } from 'react';
import type { Ctx } from '../App';
import type { Job } from '../api';
import { ACTIVE, explain } from '../api';
import { Icon, OP_LABEL, StateBadge, copyText, fmtDuration, fmtTime, useNow } from '../ui';
import { stepOf } from './Marketplace';

export function Jobs({ ctx, selected }: { ctx: Ctx; selected: string | null }) {
  const [state, setState] = useState('all');
  const list = ctx.jobs.filter((j) => state === 'all' || (state === 'active' ? ACTIVE.includes(j.state) : j.state === state));
  const job = ctx.jobs.find((j) => j.id === selected) ?? null;
  const count = (f: (j: Job) => boolean) => ctx.jobs.filter(f).length;
  const name = (id: string) => ctx.services.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <section className="card">
        <div className="row wrap-row">
          <h2 className="grow"><Icon name="jobs" size={22} />Jobs</h2>
          <label className="field inline"><span className="sr">State</span>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="all">All states</option><option value="active">Running</option><option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option><option value="timed_out">Timed out</option>
            </select>
          </label>
          <button className="btn bp" onClick={ctx.refreshAll}><Icon name="refresh" size={18} />Refresh</button>
        </div>
        <div className="tiles">
          <div className="tile"><Icon name="clock" size={24} /><div><div className="tl">Running</div><div className="tv">{count((j) => ACTIVE.includes(j.state))}</div></div></div>
          <div className="tile"><Icon name="check" size={24} /><div><div className="tl">Succeeded</div><div className="tv">{count((j) => j.state === 'succeeded')}</div></div></div>
          <div className="tile"><Icon name="alert" size={24} /><div><div className="tl">Failed or timed out</div><div className="tv">{count((j) => j.state === 'failed' || j.state === 'timed_out')}</div></div></div>
        </div>
      </section>

      {job && <JobDetail job={job} name={name(job.serviceId)} />}

      <section className="card">
        <h2 className="mb">History</h2>
        {ctx.jobsError !== null && <div className="banner bad"><Icon name="alert" />{explain(ctx.jobsError)}</div>}
        {list.length === 0 ? <div className="empty">No jobs{state !== 'all' ? ' in this state' : ' yet'}.</div> : (
          <div className="scroll-x">
            <table className="clickable">
              <thead><tr><th>Job</th><th>Operation</th><th>App</th><th>Version</th><th>State</th><th>Result</th><th>Started</th></tr></thead>
              <tbody>
                {list.map((j) => (
                  <tr key={j.id} className={j.id === selected ? 'sel' : ''}>
                    <td className="mono"><a href={`#/jobs/${j.id}`} className="strong">{j.id.slice(0, 8)}</a></td>
                    <td className="strong">{OP_LABEL[j.op]}</td>
                    <td>{name(j.serviceId)}</td>
                    <td>{j.op === 'update' ? `${j.fromVersion} → ${j.version}` : j.version ?? '–'}</td>
                    <td><StateBadge state={j.state} /></td>
                    <td className="muted">{j.message ?? '–'}{j.faultCode ? ` (fault ${j.faultCode})` : ''}</td>
                    <td className="muted nowrap">{fmtTime(j.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const USP_CMD: Record<string, (j: Job) => string> = {
  install: () => 'Device.SoftwareModules.InstallDU()',
  update: (j) => `${j.duPath ?? 'Device.SoftwareModules.DeploymentUnit.N.'}Update()`,
  uninstall: (j) => `${j.duPath ?? 'Device.SoftwareModules.DeploymentUnit.N.'}Uninstall()`,
  start: (j) => `${j.euPath ?? 'Device.SoftwareModules.ExecutionUnit.N.'}SetRequestedState(Active)`,
  stop: (j) => `${j.euPath ?? 'Device.SoftwareModules.ExecutionUnit.N.'}SetRequestedState(Idle)`,
};

function clockSkew(j: Job): string | null {
  const t = j.resultLabel?.split('|')[4];
  if (!t || !j.finishedAt) return null;
  const diff = Date.parse(t) - Date.parse(j.finishedAt);
  if (Number.isNaN(diff) || Math.abs(diff) < 10 * 60_000) return null;
  return `modem clock about ${fmtDuration(Math.abs(diff))} ${diff > 0 ? 'ahead' : 'behind'}`;
}

function JobDetail({ job: j, name }: { job: Job; name: string }) {
  const now = useNow();
  const [copied, setCopied] = useState(false);
  const step = stepOf(j);
  const active = ACTIVE.includes(j.state);
  const skew = clockSkew(j);
  const tl = [
    { icon: 'check', label: 'Queued', at: j.createdAt },
    { icon: 'send', label: j.reqObjPath ? `Sent · ${j.reqObjPath.replace('Device.LocalAgent.', '')}` : 'Sent to modem', at: j.sentAt },
    { icon: 'cube', label: j.op === 'start' || j.op === 'stop' ? 'Waiting for EU status' : 'Waiting for result label', at: null as string | null },
    { icon: 'flag', label: j.state === 'succeeded' ? 'Succeeded' : j.state === 'failed' ? 'Failed' : j.state === 'timed_out' ? 'Timed out' : 'Result', at: j.finishedAt },
  ];
  const copy = async () => {
    await copyText(JSON.stringify(j, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <section className="card stack" id="job">
      <div className="row wrap-row">
        <h2 className="grow">Job {j.id.slice(0, 8)} · {OP_LABEL[j.op]} {name}{j.version && j.op !== 'start' && j.op !== 'stop' ? ` ${j.version}` : ''}</h2>
        <StateBadge state={j.state} />
        <button className="btn bo" onClick={copy}><Icon name="copy" size={18} />{copied ? 'Copied' : 'Copy JSON'}</button>
        <a href="#/jobs" className="btn ghost ib" aria-label="Close job details"><Icon name="x" /></a>
      </div>
      <ol className="steps four">
        {tl.map((s, i) => {
          const cls = j.state === 'failed' || j.state === 'timed_out' ? (i < 3 ? 'done' : 'failed') : i < step || (!active && i <= step) ? 'done' : i === step ? 'now' : 'todo';
          return (
            <li key={i} className={`step ${cls}`}><Icon name={s.icon} size={18} /><span>{s.label}</span>
              <span className="mono small">{s.at ? fmtTime(s.at) : i === 2 && active && j.sentAt ? fmtDuration(now - Date.parse(j.sentAt)) : ''}</span></li>
          );
        })}
      </ol>
      <div className="two">
        <div>
          <div className="sec mb">REQUEST</div>
          <dl className="facts">
            <dt>Operation</dt><dd>{j.op}{j.requestedBy ? ` · by ${j.requestedBy}` : ''}</dd>
            <dt>Service</dt><dd className="mono">{j.serviceId}</dd>
            <dt>Version</dt><dd>{j.op === 'update' ? `${j.fromVersion} → ${j.version}` : j.version ?? '–'}</dd>
            <dt>Image</dt><dd className="mono">{j.imageUrl ?? '–'}</dd>
            <dt>Expected digest</dt><dd className="mono">{j.expectedDigest ?? '–'}</dd>
            <dt>DU UUID</dt><dd className="mono">{j.uuid}</dd>
            <dt>USP command</dt><dd className="mono">{USP_CMD[j.op](j)}</dd>
            <dt>Request object</dt><dd className="mono">{j.reqObjPath ?? '–'}</dd>
          </dl>
        </div>
        <div>
          <div className="sec mb">RESULT</div>
          <dl className="facts">
            <dt>Label before</dt><dd className="mono">{j.baselineLabel ?? '(none)'}</dd>
            <dt>Label after</dt><dd className="mono">{j.resultLabel ?? (j.op === 'start' || j.op === 'stop' ? '(not used)' : '–')}</dd>
            <dt>Fault code</dt><dd>{j.faultCode ?? (j.state === 'succeeded' ? '0' : '–')}</dd>
            <dt>DU / EU</dt><dd className="mono">{j.duPath ?? '–'}<br />{j.euPath ?? ''}</dd>
            <dt>Message</dt><dd>{j.message ?? '–'}</dd>
            <dt>Timing</dt><dd>{j.finishedAt ? `took ${fmtDuration(Date.parse(j.finishedAt) - Date.parse(j.createdAt))}` : `running for ${fmtDuration(now - Date.parse(j.createdAt))}`}</dd>
            {skew && <><dt>Modem clock</dt><dd><span className="badge warn"><Icon name="alert" size={14} />{skew}</span></dd></>}
          </dl>
        </div>
      </div>
      <details>
        <summary>Raw job record</summary>
        <pre className="mono raw">{JSON.stringify(j, null, 2)}</pre>
      </details>
    </section>
  );
}
