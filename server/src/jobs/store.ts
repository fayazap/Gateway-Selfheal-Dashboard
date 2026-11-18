// Job persistence: one JSON file in the data dir, written atomically (tmp + rename), writes serialised.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type JobOp = 'install' | 'update' | 'uninstall' | 'start' | 'stop';
export type JobState = 'queued' | 'sent' | 'running' | 'succeeded' | 'failed' | 'timed_out';
export const ACTIVE_STATES: JobState[] = ['queued', 'sent', 'running'];

export interface Job {
  id: string;
  op: JobOp;
  deviceSn: string;
  endpointId: string;
  serviceId: string;
  version: string | null;        // target version (install/update); current version otherwise
  fromVersion: string | null;    // update: version before
  imageUrl: string | null;
  expectedDigest: string | null;
  uuid: string;
  duPath: string | null;
  euPath: string | null;
  state: JobState;
  createdAt: string;
  sentAt: string | null;
  finishedAt: string | null;
  reqObjPath: string | null;     // Device.LocalAgent.Request.N for async commands
  faultCode: number | null;
  message: string | null;
  baselineLabel: string | null;  // lcm:<UUID> label value before the job (result = first different value)
  resultLabel?: string | null;   // the label value the job finished on (debugging)
  requestedBy: string | null;
}

const MAX_JOBS = 2000;
let writeSeq = 0;   // unique temp file per write

export class JobStore {
  private jobs = new Map<string, Job>();
  private file: string;
  private chain: Promise<void> = Promise.resolve();
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    this.file = join(dir, 'jobs.json');
  }

  async load(): Promise<number> {
    try {
      const list = JSON.parse(await readFile(this.file, 'utf8')) as Job[];
      for (const j of list) this.jobs.set(j.id, j);
    } catch { /* first run */ }
    return this.jobs.size;
  }

  all(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  put(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
    if (this.jobs.size > MAX_JOBS) {
      const done = this.all().filter((j) => !ACTIVE_STATES.includes(j.state));
      for (const j of done.slice(MAX_JOBS - 200)) this.jobs.delete(j.id);
    }
    this.chain = this.chain.then(() => this.save()).catch((e) => {
      // The data dir was removed under us (tests clean up while a job still runs): nothing to save to.
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && !existsSync(this.dir)) return;
      console.error(`[jobs] save failed: ${(e as Error).message}`);
    });
    return this.chain;
  }

  /** Resolves when every pending write has finished. */
  flush(): Promise<void> {
    return this.chain;
  }

  private async save(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${++writeSeq}.tmp`;
    await writeFile(tmp, JSON.stringify(this.all(), null, 2));
    // Windows: antivirus or an open editor can hold jobs.json for a moment (EPERM/EBUSY/EACCES): retry.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, this.file);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' && !existsSync(tmp)) return;   // folder deleted under us (test cleanup)
        if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) {
          await rm(tmp, { force: true });
          throw e;
        }
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }
  }
}
