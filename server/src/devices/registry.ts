// Device registry (Phase 3): devices from Oktopus, and per device the installed apps read from
// Device.SoftwareModules over USP, matched to the catalogue by DU Name (= GitLab path) and Version.
// The DU URL is not used: timingila leaves it empty after a reboot.

import type { OktopusClient, OktopusDevice } from '../oktopus/client.ts';
import type { Catalogue, Service } from '../catalogue/sync.ts';
import { SM, getMsg, parseGet, parseLabel, duUuid } from '../lcm/usp.ts';
import type { LcmLabel } from '../lcm/usp.ts';

export interface InstalledApp {
  duPath: string;               // Device.SoftwareModules.DeploymentUnit.N.  (instance numbers change after reboot/install)
  uuid: string;
  duid: string;
  name: string;                 // DU Name, e.g. tinno-lcm/tinno-ai-service
  version: string;
  duStatus: string;             // Installed | Installing | ...
  euPath: string | null;
  euStatus: string | null;      // Active | Idle | Starting | ...
  euFault: string | null;
  serviceId: string | null;     // catalogue match, null = unknown to the catalogue
  managed: boolean;             // UUID is the one this backend uses for (device, service)
  latest: string | null;
  updateAvailable: boolean;
  lastResult: LcmLabel | null;  // from the lcm:<UUID> device label
}

export interface DeviceSummary {
  sn: string;
  endpointId: string;
  model: string;
  vendor: string;
  firmware: string;
  online: boolean;
  lastSeen: string | null;
}

export function summary(d: OktopusDevice): DeviceSummary {
  return { sn: d.sn, endpointId: d.endpointId, model: d.model, vendor: d.vendor, firmware: d.version, online: d.online, lastSeen: d.lastSeen };
}

export function matchService(cat: Catalogue | null, duName: string): Service | null {
  if (!cat || !duName) return null;
  return cat.services.find((s) => s.id === duName || s.repository.location.endsWith(`/${duName}`)) ?? null;
}

export class DeviceRegistry {
  private cache: { at: number; devices: OktopusDevice[] } | null = null;
  private client: OktopusClient;
  private catalogue: () => Catalogue | null;
  private ttlMs: number;
  private now: () => number;
  /** Single-device mode: only this serial number is visible and manageable. */
  readonly only: string | undefined;

  constructor(client: OktopusClient, catalogue: () => Catalogue | null, ttlMs = 30_000, now: () => number = Date.now, only?: string) {
    this.client = client;
    this.catalogue = catalogue;
    this.ttlMs = ttlMs;
    this.now = now;
    this.only = only;
  }

  async list(force = false): Promise<OktopusDevice[]> {
    if (this.only) {
      const d = await this.client.getDevice(this.only);
      return d ? [d] : [];
    }
    if (!force && this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.devices;
    const devices = await this.client.listDevices();
    this.cache = { at: this.now(), devices };
    return devices;
  }

  /** Fresh read of one device (status + labels); falls back to the list. */
  async get(sn: string): Promise<OktopusDevice | null> {
    if (this.only && sn !== this.only) return null;
    const d = await this.client.getDevice(sn);
    if (d) return d;
    return (await this.list(true)).find((x) => x.sn === sn) ?? null;
  }

  async apps(device: OktopusDevice): Promise<InstalledApp[]> {
    const resp = await this.client.sendUsp(device.sn, getMsg([`${SM}DeploymentUnit.`, `${SM}ExecutionUnit.`]));
    return buildApps(device, parseGet(resp), this.catalogue());
  }
}

export function buildApps(device: OktopusDevice, rows: Record<string, Record<string, string>>, cat: Catalogue | null): InstalledApp[] {
  const eus = Object.entries(rows).filter(([p]) => p.startsWith(`${SM}ExecutionUnit.`));
  const apps: InstalledApp[] = [];
  for (const [path, du] of Object.entries(rows)) {
    if (!path.startsWith(`${SM}DeploymentUnit.`)) continue;
    // EU: ExecutionUnitList (filled by usp-pa v9) or EUID == DUID
    const listed = (du.ExecutionUnitList ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];
    const eu = eus.find(([p]) => listed && (p === listed || p === `${listed}.`)) ?? eus.find(([, e]) => e.EUID && e.EUID === du.DUID);
    const svc = matchService(cat, du.Name ?? '');
    const version = du.Version ?? '';
    const idx = svc ? svc.versions.indexOf(version) : -1;
    apps.push({
      duPath: path,
      uuid: du.UUID ?? '',
      duid: du.DUID ?? '',
      name: du.Name ?? '',
      version,
      duStatus: du.Status ?? '',
      euPath: eu ? eu[0] : null,
      euStatus: eu ? eu[1].Status ?? null : null,
      euFault: eu ? (eu[1].ExecutionFaultCode && eu[1].ExecutionFaultCode !== 'NoFault' ? `${eu[1].ExecutionFaultCode}: ${eu[1].ExecutionFaultMessage ?? ''}` : null) : null,
      serviceId: svc?.id ?? null,
      managed: svc ? du.UUID === duUuid(device.endpointId, svc.id) : false,
      latest: svc?.latest ?? null,
      updateAvailable: Boolean(svc && idx !== 0 && svc.latest !== version),
      lastResult: parseLabel(device.labels[`lcm:${du.UUID ?? ''}`]),
    });
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
