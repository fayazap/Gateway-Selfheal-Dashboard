// Installed apps: modem facts and every DU on the modem, with update / stop / start / uninstall.

import type { Ctx } from '../App';
import type { Device, InstalledApp } from '../api';
import { explain } from '../api';
import { Icon, fmtTime } from '../ui';

export function InstalledApps({ ctx, device }: { ctx: Ctx; device: Device | null }) {
  return (
    <>
      <section className="card">
        <h2><Icon name="chip" size={22} />My modem</h2>
        <div className="tiles">
          <div className="tile"><Icon name="chip" size={24} /><div><div className="tl">Model</div><div className="tv">{device ? `${device.model || '–'} · ${device.vendor || '–'}` : '–'}</div></div></div>
          <div className="tile"><Icon name="tag" size={24} /><div><div className="tl">Firmware</div><div className="tv mono">{device?.firmware || '–'}</div></div></div>
          <div className="tile"><Icon name="wifi" size={24} /><div><div className="tl">USP endpoint</div><div className="tv mono small">{device?.endpointId || '–'}</div></div></div>
        </div>
      </section>
      <section className="card">
        <div className="row wrap-row">
          <h2 className="grow"><Icon name="custom" size={22} />Installed apps</h2>
          <button className="btn bo" onClick={ctx.refreshAll}><Icon name="refresh" size={18} />Refresh</button>
          <a href="#/" className="btn bp"><Icon name="plus" size={18} />Browse services</a>
        </div>
        {ctx.online === false && <div className="banner bad"><Icon name="alert" />The modem is offline, so its apps cannot be read or changed.</div>}
        {ctx.appsError !== null && <div className="banner bad"><Icon name="alert" />{explain(ctx.appsError)}</div>}
        {ctx.online !== false && ctx.apps.length === 0 && ctx.appsError === null
          ? <div className="empty">No apps on the modem. <a href="#/">Browse the marketplace</a> to install one.</div>
          : (
            <div className="scroll-x">
              <table>
                <thead><tr><th>App</th><th>Version</th><th>Status</th><th>Last result</th><th className="right">Actions</th></tr></thead>
                <tbody>{ctx.apps.map((a) => <AppRow key={a.duPath} ctx={ctx} a={a} />)}</tbody>
              </table>
            </div>
          )}
        <p className="muted small">Uninstall asks for confirmation and removes the app and its data from the modem.</p>
      </section>
    </>
  );
}

function AppRow({ ctx, a }: { ctx: Ctx; a: InstalledApp }) {
  const svc = a.serviceId ? ctx.services.find((s) => s.id === a.serviceId) ?? null : null;
  const busy = a.serviceId ? ctx.busy(a.serviceId) : false;
  const known = Boolean(svc);
  const why = !known ? 'Not in the catalogue: manage it from Oktopus' : busy ? 'A job for this app is running' : undefined;
  const running = a.euStatus === 'Active';
  const short = (p: string | null) => (p ?? '').replace('Device.SoftwareModules.', '').replace('DeploymentUnit.', 'DU.').replace('ExecutionUnit.', 'EU.').replace(/\.$/, '');
  return (
    <tr>
      <td>
        <div className="strong">{svc?.name ?? a.name}</div>
        <div className="mono muted">{a.name}</div>
        {!known && <span className="badge warn">Not in catalogue</span>}
      </td>
      <td>
        <div className="strong">{a.version || '–'}</div>
        {a.updateAvailable && <span className="badge warn"><Icon name="up" size={14} />{a.latest} available</span>}
      </td>
      <td>
        {busy ? <span className="badge run"><Icon name="clock" size={14} />Job running</span>
          : <span className={`badge ${running ? 'ok' : 'off'}`}>{running ? <Icon name="check" size={14} /> : <Icon name="stop" size={14} />}{a.euStatus ?? a.duStatus}</span>}
        <div className="mono muted small">{short(a.duPath)}{a.euPath ? ` · ${short(a.euPath)}` : ''}</div>
        {a.euFault && <div className="bad-text small">{a.euFault}</div>}
      </td>
      <td>
        {a.lastResult
          ? <><span className={`badge ${a.lastResult.faultCode ? 'bad' : 'ok'}`}>{a.lastResult.state}</span><div className="muted small">{a.lastResult.operation}{a.lastResult.faultCode ? ` · fault ${a.lastResult.faultCode}` : ''} · modem time {fmtTime(a.lastResult.completeTime)}</div></>
          : <span className="muted">–</span>}
      </td>
      <td className="right nowrap">
        {svc && a.updateAvailable && (
          <button className="btn bg" disabled={busy} title={why} onClick={() => ctx.ask({ kind: 'update', service: svc, app: a })}><Icon name="up" size={18} />Update</button>
        )}
        {svc && !a.updateAvailable && svc.versions.length > 1 && (
          <button className="btn bo" disabled={busy} title={why} onClick={() => ctx.ask({ kind: 'update', service: svc, app: a })}>Change version</button>
        )}
        <button className="btn bo ib" aria-label="Stop" title={why ?? 'Stop'} disabled={!known || busy || !running} onClick={() => ctx.ask({ kind: 'stop', service: svc, app: a })}><Icon name="stop" size={18} /></button>
        <button className="btn bo ib" aria-label="Start" title={why ?? 'Start'} disabled={!known || busy || running} onClick={() => void ctx.act('start', a.serviceId as string)}><Icon name="play" size={18} /></button>
        <button className="btn bd ib" aria-label="Uninstall" title={why ?? 'Uninstall'} disabled={!known || busy} onClick={() => ctx.ask({ kind: 'uninstall', service: svc, app: a })}><Icon name="trash" size={18} /></button>
      </td>
    </tr>
  );
}
