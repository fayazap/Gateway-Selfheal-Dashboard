// Holds the current catalogue in memory, caches it to <dataDir>/catalogue.json so the
// store survives a restart while GitLab is unreachable, and refreshes on a timer.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitLabClient } from '../gitlab/client.ts';
import { buildCatalogue } from './sync.ts';
import type { BuildOptions, Catalogue } from './sync.ts';

export interface RefreshStatus {
  lastAttempt: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  running: boolean;
}

export class CatalogueStore {
  private client: GitLabClient;
  private opts: BuildOptions;
  private file: string;
  private current: Catalogue | null = null;
  private inflight: Promise<Catalogue> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  status: RefreshStatus = { lastAttempt: null, lastSuccess: null, lastError: null, running: false };

  constructor(client: GitLabClient, opts: BuildOptions, dataDir: string) {
    this.client = client;
    this.opts = opts;
    this.file = join(dataDir, 'catalogue.json');
  }

  get(): Catalogue | null {
    return this.current;
  }

  async loadCache(): Promise<boolean> {
    try {
      this.current = JSON.parse(await readFile(this.file, 'utf8')) as Catalogue;
      return true;
    } catch {
      return false;
    }
  }

  /** One refresh at a time; concurrent callers share the same run. */
  refresh(): Promise<Catalogue> {
    if (this.inflight) return this.inflight;
    this.status.running = true;
    this.status.lastAttempt = new Date().toISOString();
    this.inflight = (async () => {
      try {
        const cat = await buildCatalogue(this.client, this.opts);
        this.current = cat;
        this.status.lastSuccess = cat.builtAt;
        this.status.lastError = null;
        await this.saveCache(cat);
        return cat;
      } catch (e) {
        this.status.lastError = (e as Error).message;
        throw e;
      } finally {
        this.status.running = false;
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  startTimer(minutes: number): void {
    if (minutes <= 0) return;
    this.timer = setInterval(() => { this.refresh().catch(() => { /* kept in status */ }); }, minutes * 60_000);
    this.timer.unref?.();
  }

  stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async saveCache(cat: Catalogue): Promise<void> {
    await mkdir(join(this.file, '..'), { recursive: true });
    const tmp = this.file + '.tmp';
    await writeFile(tmp, JSON.stringify(cat, null, 2));
    await rename(tmp, this.file);
  }
}
