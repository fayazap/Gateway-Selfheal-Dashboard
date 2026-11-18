// Start the HTTP server: listen address, "already running" detection, port fallback and opening the browser.
// Windows reserves port ranges (Hyper-V, WSL, Docker: `netsh interface ipv4 show excludedportrange protocol=tcp`)
// and a reserved port fails with EACCES even when nothing uses it. With `fallback` the next ports are tried,
// then any free port; the browser is opened on whichever port worked.

import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export function openBrowser(url: string): void {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { /* no browser available: the URL is printed anyway */ }
}

async function ourDashboardOn(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok && 'catalogue' in (await r.json() as object);
  } catch {
    return false;
  }
}

export interface ListenOptions { fallback?: boolean; tries?: number }

export function listen(server: Server, port: number, host: string, open: boolean, banner: () => void, opts: ListenOptions = {}): void {
  const tries = opts.fallback ? (opts.tries ?? 20) : 1;
  let attempt = 0;
  let current = port;

  server.on('listening', () => {
    const actual = (server.address() as AddressInfo).port;
    const url = `http://localhost:${actual}/`;
    banner();
    if (actual !== port) console.log(`[ui] port ${port} was not available, using ${actual}`);
    console.log(`[ui] dashboard: ${url}${host === '0.0.0.0' || host === '::' ? ' (reachable from other machines)' : ''}`);
    if (open) openBrowser(url);
  });

  server.on('error', async (e: NodeJS.ErrnoException) => {
    if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
    // Second start (e.g. the shortcut clicked twice): if our dashboard already answers, just open it.
    if (e.code === 'EADDRINUSE' && await ourDashboardOn(current)) {
      const url = `http://localhost:${current}/`;
      console.log(`[ui] the dashboard is already running: ${url}`);
      if (open) openBrowser(url);
      process.exit(0);
    }
    const why = e.code === 'EACCES' ? 'is reserved by Windows (or not allowed)' : 'is used by another program';
    attempt++;
    if (attempt < tries) {
      const failed = current;
      current = attempt === tries - 1 ? 0 : port + attempt;   // last try: any free port
      console.log(`[ui] port ${failed} ${why}; trying ${current || 'any free port'}`);
      setTimeout(() => server.listen(current, host), 50);
      return;
    }
    console.error(`[ui] port ${current} ${why}. Set PORT to a free port and start again.`);
    process.exit(1);
  });

  server.listen(current, host);
}
