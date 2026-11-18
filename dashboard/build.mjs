// Builds the dashboard into ../server/public (served by the backend). `node build.mjs --watch` rebuilds on change.
import { build, context } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.OUT_DIR ?? join(here, '..', 'server', 'public');
const watch = process.argv.includes('--watch');

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });
await copyFile(join(here, 'index.html'), join(out, 'index.html'));

const opts = {
  entryPoints: { app: join(here, 'src', 'main.tsx') },
  outdir: join(out, 'assets'),
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome100', 'edge100', 'firefox100', 'safari15'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [],
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log(`watching, output in ${out}`);
} else {
  await build(opts);
  console.log(`built into ${out}`);
}
