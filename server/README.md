# LCM Dashboard backend

Backend of the LCM App Store dashboard (design doc: "LCM Service Marketplace — Software Design Document").
This drop contains **Phase 1 — GitLab catalogue** (services from a GitLab group, `[lcm ...]` metadata from
each project description, versions from the Container Registry) and **Phase 3 — devices and jobs through
Oktopus** (device list, installed apps per device, tracked install/update/uninstall/start/stop jobs).

No third-party packages: Node 22.6+ runs the TypeScript directly (type stripping), tests use `node:test`.

## Layout

```
src/
  catalogue/parseDescription.ts   [lcm key=value; ...] parser (design §5)
  catalogue/tags.ts               vMAJOR.MINOR.PATCH ordering, pre-release handling
  catalogue/sync.ts               group -> services + issues; tag -> digest + image URL
  catalogue/store.ts              in-memory catalogue, JSON cache, periodic refresh
  gitlab/client.ts                GitLab REST v4 client with pagination
  oktopus/client.ts               Oktopus REST client: service-account login, devices, USP messages
  lcm/usp.ts                      USP LCM messages, response parsing, per-device DU UUIDs, result labels
  devices/registry.ts             devices + installed apps matched to the catalogue
  jobs/engine.ts, jobs/store.ts   job engine (results from lcm:<UUID> labels) + JSON persistence
  api.ts                          REST API (subset of design §13.1)
  config.ts, main.ts
scripts/catalogue.ts              check a real GitLab group from the command line
test/                             unit + API tests with an in-memory GitLab
```

## 1. Check your GitLab group first

```sh
cd server
GITLAB_GROUP=<your-lcm-group> GITLAB_TOKEN=<read_api token> npm run catalogue -- --resolve
```

Each project prints as `OK` (with tier, category, latest release, and with `--resolve` the
digest image URL) or `ISSUE` (with the reason: no `[lcm]` block, bad value, no image at the
project root path, no `vX.Y.Z` tags). Exit code 2 when any issue exists.

Example description for a project:

```
Upstream reachability telemetry. [lcm name=WAN monitor; tier=All; category=docsis; network=bridged; ram=16; health=http:8080/health]
```

## 2. Run the API

```sh
GITLAB_GROUP=<group> GITLAB_TOKEN=<token> npm start
curl localhost:8080/api/v1/health
curl localhost:8080/api/v1/services
curl localhost:8080/api/v1/services/<url-encoded group/project>
curl localhost:8080/api/v1/services/<url-encoded group/project>/versions/v1.4.2
curl localhost:8080/api/v1/catalogue/issues
curl -X POST localhost:8080/api/v1/catalogue/refresh
```

## 3. Phase 3: devices and jobs

### What it needs
- **Oktopus service account without 2FA** (`OKTOPUS_EMAIL`, `OKTOPUS_PASSWORD`), role limited to Devices +
  Device Management. The backend signs in, sends `Authorization: <token>`, and signs in again before the
  24 h token expires or when a call is rejected. `OKTOPUS_TOKEN` (a token copied from the browser) also works
  for a quick test, but cannot be renewed.
- **Registry pull credentials for the modem** (`REGISTRY_USERNAME`, `REGISTRY_PASSWORD`): the GitLab deploy
  token with `read_registry`. They go into the InstallDU/Update arguments only; jobs never store them.
- **`oktopus-lcm-results.lua` running in Oktopus**: job results come from its `lcm:<UUID>` device labels.
- usp-pa v10 on the modem (DUStateChange! after every operation, ExecutionUnitList filled, fast pull failure, RetainData).

### Single-device mode
Set `LCM_DEVICE_SN=<serial>` and the backend only shows and manages that device: `GET /devices` returns
just it, and any other serial number answers 404 `DEVICE_NOT_FOUND` (also for jobs). Leave it unset to
see every device in the Oktopus organization.

### How a job works
1. `POST /api/v1/devices/{sn}/jobs` checks: device online, service and version in the catalogue, app
   installed (or not, for install), no other job running for that device + service. Errors come back as
   `{error, message}` with 400/404/409/502.
2. The UUID is fixed per (device endpoint ID, service): `uuidV5("<endpointId>|<service id>")`. Install,
   update and uninstall always target the same DU; nobody types UUIDs.
3. The USP command is sent with `PUT /api/device/{sn}/usp/generic`. Job state: `queued -> sent -> running`.
4. install/update/uninstall: the backend polls the device's `lcm:<UUID>` label (every `LCM_POLL_SECONDS`).
   The first value that differs from the one before the job is the result: `succeeded` for
   `Installed`/`Uninstalled` with fault 0, otherwise `failed` with the fault code. No result within
   `LCM_JOB_TIMEOUT_MINUTES` -> `timed_out` (the modem itself gives up after 900 s).
5. start/stop: `SetRequestedState` returns at once; the backend then waits for the EU to be Active/Idle.
6. Jobs are kept in `data/jobs.json`; running jobs continue after a backend restart.

### Endpoints
```
GET  /api/v1/devices?online=true&q=&refresh=true    device list (cached 30 s)
GET  /api/v1/devices/{sn}
GET  /api/v1/devices/{sn}/apps                      installed apps: version, EU status, update available, last result
POST /api/v1/devices/{sn}/jobs                      {"op":"install|update|uninstall|start|stop","service":"<id>","version":"vX.Y.Z"}
GET  /api/v1/jobs?device=&service=&state=
GET  /api/v1/jobs/{id}
```

### Run on the operator PC (Windows PowerShell)
```powershell
cd server
$env:GITLAB_GROUP = "tinno-lcm"
$env:GITLAB_TOKEN_FILE = "C:\lcm-secrets\gitlab-token.txt"          # read_api
$env:OKTOPUS_EMAIL = "<service account email>"
$env:OKTOPUS_PASSWORD_FILE = "C:\lcm-secrets\oktopus-password.txt"
$env:REGISTRY_USERNAME = "<deploy token username>"
$env:REGISTRY_PASSWORD_FILE = "C:\lcm-secrets\deploy-token.txt"   # read_registry
$env:LCM_DEVICE_SN = "ZT2607000024"                                 # single-device mode
npm start
```
Secrets in files keep them out of the shell history; keep `C:\lcm-secrets` readable by your user only.

## 4. Phase 4: the dashboard

The React dashboard is built into `server/public/` and served by the backend: open
**http://localhost:8080/** after `npm start`. Nothing else to run; no `npm install` is needed to use it.

Pages: **Marketplace** (search, filters, categories, featured service, install/update, live progress of the
running job), **Installed apps** (modem facts; update, stop, start, uninstall with confirmation) and
**Jobs** (history, filter, full record of one job with USP command, labels before/after, DU/EU paths,
timing, modem clock check, Copy JSON).

Try it without the modem or Oktopus: `npm run demo` (fake GitLab with 7 services and a fake modem;
jobs take a few seconds).

`LCM_DEVICE_HW=wan` (comma list of wan, wifi, moca) marks services that need hardware the modem lacks
as "Not compatible". Unset = every service is offered.

Changing the UI: the source is in `../dashboard` (React + TypeScript, built with esbuild).
```
cd ../dashboard
npm install
npm run build      # writes ../server/public
npm run watch      # rebuild on save while developing
```

## 5. Sign-in with the device serial number

With `LCM_AUTH=serial` (the default) the dashboard opens on a sign-in page. The operator enters the
modem's serial number; the backend asks Oktopus and allows the sign-in only when that device exists and
is online. The session (HttpOnly cookie, 12 h, signs out after 2 h idle) is limited to that device: other
devices answer 403, their jobs are invisible.

A serial number is printed on the device and visible in the ACS, so it identifies the device but does
not prove who you are. Before the dashboard is reachable by others:
- set `LCM_ACCESS_CODE` (asked together with the serial), and/or `LCM_ALLOWED_SNS` (serials that may sign in);
- failed sign-ins are limited to 10 per 5 minutes per client;
- the backend listens on `127.0.0.1` only unless `LCM_HOST=0.0.0.0` is set.

`LCM_AUTH=off` turns sign-in off (development only).

## 6. Windows installer

`..\installer\build-installer.ps1` builds one `TINNO-LCM-Dashboard-Setup-<version>.exe` with its own
Node runtime, so the people who install it need nothing else. Details in `..\installer\README-build.md`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `GITLAB_GROUP` | (required) | Group (or `group/subgroup`) holding the LCM container projects |
| `GITLAB_URL` | `https://gitlab.com` | GitLab base URL (self-managed instances work) |
| `GITLAB_TOKEN` | none | Group access token, `read_api`; omit for a public group |
| `LCM_TIERS` | `Basic,Advanced,Business` | Ordered tier list, lowest first |
| `LCM_INCLUDE_PRERELEASE` | `false` | Offer `-rc`/`-beta` tags |
| `LCM_REFRESH_MINUTES` | `15` | Catalogue refresh interval |
| `PORT` | `8080` | API port |
| `LCM_DATA_DIR` | `./data` | Catalogue cache and `jobs.json` location |
| `OKTOPUS_URL` | `https://tinno.oktopus.app.br` | Oktopus tenant |
| `OKTOPUS_EMAIL` / `OKTOPUS_PASSWORD` | none | Service account (no 2FA); enables Phase 3 |
| `OKTOPUS_TOKEN` | none | Alternative for testing: token from the browser (not renewed) |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | none | Pull credentials passed to InstallDU/Update |
| `LCM_DEVICE_HW` | none | Hardware of the managed device (`wan,wifi,moca`) for the compatibility check |
| `LCM_PUBLIC_DIR` | `./public` | Built dashboard to serve |
| `LCM_DEVICE_SN` | none | Single-device mode: the only device visible (and allowed to sign in) |
| `LCM_AUTH` | `serial` | `serial` = sign-in with the device serial number; `off` = no sign-in |
| `LCM_ACCESS_CODE` | none | Code required together with the serial at sign-in |
| `LCM_ALLOWED_SNS` | none | Comma list of serials allowed to sign in (unset = any device in Oktopus) |
| `LCM_HOST` | `127.0.0.1` | Listen address; `0.0.0.0` makes the dashboard reachable from other machines |
| `LCM_OPEN_BROWSER` | `false` | Open the dashboard in the browser at start |
| `LCM_CONFIG_FILE` | none | JSON file with any of these settings (used by the installer); environment wins |
| `LCM_EXEC_ENV_REF` | `Device.SoftwareModules.ExecEnv.1.` | ExecutionEnvRef for InstallDU |
| `LCM_POLL_SECONDS` | `10` | Result poll interval |
| `LCM_JOB_TIMEOUT_MINUTES` | `16` | install/update/uninstall timeout |

Any secret can be given as a file instead: `GITLAB_TOKEN_FILE`, `OKTOPUS_PASSWORD_FILE`,
`OKTOPUS_TOKEN_FILE`, `REGISTRY_PASSWORD_FILE`, `LCM_ACCESS_CODE_FILE`.

## Tests

```sh
npm test
```
