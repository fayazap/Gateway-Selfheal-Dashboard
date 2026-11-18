// Catalogue check against a real GitLab group — use this to validate project
// descriptions before the dashboard exists.
//
//   GITLAB_GROUP=tinno-lcm [GITLAB_TOKEN=...] node scripts/catalogue.ts [--resolve] [--json]
//
//   --resolve  also resolve the latest tag of each service to its digest + image URL
//   --json     print the full catalogue as JSON

import { loadConfig } from '../src/config.ts';
import { GitLabClient } from '../src/gitlab/client.ts';
import { buildCatalogue, resolveVersion } from '../src/catalogue/sync.ts';

const args = new Set(process.argv.slice(2));
const cfg = loadConfig();
const client = new GitLabClient({ baseUrl: cfg.gitlabUrl, token: cfg.gitlabToken });
const cat = await buildCatalogue(client, { group: cfg.gitlabGroup, tiers: cfg.tiers, includePrerelease: cfg.includePrerelease });

if (args.has('--json')) {
  console.log(JSON.stringify(cat, null, 2));
  process.exit(cat.issues.length > 0 ? 2 : 0);
}

console.log(`Group ${cat.group}: ${cat.services.length} services, ${cat.issues.length} issues\n`);
for (const s of cat.services) {
  const m = s.meta;
  console.log(`OK    ${s.id}`);
  console.log(`      name=${s.name} tier=${m.tier} category=${m.category} network=${m.network} latest=${s.latest} (${s.versions.length} releases)`);
  for (const w of s.warnings) console.log(`      warning: ${w}`);
  if (args.has('--resolve')) {
    try {
      const v = await resolveVersion(client, s, s.latest);
      console.log(`      ${v.imageUrl}   size=${Math.ceil(v.sizeBytes / 1048576)} MB disk=${v.diskMB} MB`);
      console.log(`      expected digest ${v.expectedDigest}`);
    } catch (e) {
      console.log(`      resolve failed: ${(e as Error).message}`);
    }
  }
}
for (const i of cat.issues) {
  console.log(`ISSUE ${i.path}  (${i.webUrl})`);
  for (const e of i.errors) console.log(`      error: ${e}`);
  for (const w of i.warnings) console.log(`      warning: ${w}`);
}
process.exit(cat.issues.length > 0 ? 2 : 0);
