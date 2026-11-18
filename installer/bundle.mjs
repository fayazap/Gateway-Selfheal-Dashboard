// Bundles the backend (TypeScript) into single JavaScript files for the installer:
//   staging/app/server.mjs  the real dashboard backend
//   staging/app/demo.mjs    demo mode (simulated GitLab + modem)
// esbuild comes from ../dashboard/node_modules (npm install in dashboard/).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = process.env.STAGING_APP ?? join(here, 'staging', 'app');
const require = createRequire(join(root, 'dashboard', 'package.json'));
const { build } = require('esbuild');

await mkdir(out, { recursive: true });
for (const [entry, name] of [['src/main.ts', 'server'], ['scripts/demo.ts', 'demo']]) {
  await build({
    entryPoints: [join(root, 'server', entry)],
    outfile: join(out, `${name}.mjs`),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: false,
    legalComments: 'none',
    banner: { js: '// TINNO LCM Dashboard backend, bundled for the Windows installer.' },
    logLevel: 'info',
  });
}
console.log(`bundled into ${out}`);
