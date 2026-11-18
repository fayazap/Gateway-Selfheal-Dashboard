# LCM Dashboard — source code guide

How the code is organised, how it works, and how to run, test, change and release it.
Version 0.5.1 (18/11/2026).

1. [Architecture](#1-architecture)
2. [Repository layout](#2-repository-layout)
3. [Toolchain and conventions](#3-toolchain-and-conventions)
4. [Running it](#4-running-it)
5. [Configuration reference](#5-configuration-reference)
6. [Backend modules](#6-backend-modules)
7. [How a job works](#7-how-a-job-works)
8. [REST API](#8-rest-api)
9. [Frontend](#9-frontend)
10. [Tests and the demo](#10-tests-and-the-demo)
11. [Windows installer](#11-windows-installer)
12. [Common changes](#12-common-changes)
13. [Release checklist](#13-release-checklist)
14. [Device-side contract](#14-device-side-contract)

---

## 1. Architecture

```
 Browser (React UI) ──HTTP──> Backend (Node.js, this repo) ──REST──> Oktopus ACS ──USP/MQTT/TLS──> Modem (usp-pa)
                                  │                                     ▲                            │
                                  └──GitLab REST v4 (catalogue)         └── lcm:<UUID> labels ◄──────┘ DUStateChange!
                                                                            (oktopus-lcm-results.lua)
 Modem ──image pull (deploy token)──> GitLab Container Registry
```

- The **backend** runs on the operator's PC, listens on `127.0.0.1` only, and serves both the REST API
  (`/api/v1/...`) and the built UI.
- **Catalogue:** every project in the GitLab group is an app. Its metadata is the `[lcm key=value; ...]` block
  in the project description; its versions are the `vMAJOR.MINOR.PATCH` tags of the image at the project root
  in the Container Registry.
- **Commands:** the backend signs in to Oktopus with a service account and sends USP messages through
  `PUT /api/device/{SN}/usp/generic` (GET, ADD, OPERATE).
- **Results:** LCM operations (InstallDU, Update, Uninstall) are asynchronous on the modem. When one finishes,
  the modem sends `DUStateChange!`; the Oktopus script `oktopus-lcm-results.lua` stores it as a device label
  `lcm:<UUID>` = `State|Operation|FaultCode|Version|CompleteTime`. The job engine polls the device and waits
  for that label to change. Start/stop are checked by reading the ExecutionUnit status.
- **Sign-in:** the operator types the modem serial number; the backend allows it only if the serial is in the
  allowed list and the device is online in Oktopus. A session is bound to that one device.

## 2. Repository layout

```
server/
  src/
    main.ts                     entry point: wires config, catalogue, Oktopus, jobs, auth, API, listen
    config.ts                   environment + config.json -> Config (secrets also from <NAME>_FILE)
    launch.ts                   listen with port fallback, "already running" detection, open browser
    api.ts                      REST API + static file server (node:http, no framework)
    auth/auth.ts                serial sign-in, sessions, rate limit, cookie
    gitlab/client.ts            GitLab REST v4 client with pagination
    catalogue/parseDescription.ts  [lcm ...] metadata parser and validation
    catalogue/tags.ts           semantic tag ordering, pre-releases
    catalogue/sync.ts           group -> services + issues; tag -> image URL
    catalogue/store.ts          in-memory catalogue, JSON cache, periodic refresh
    oktopus/client.ts           Oktopus REST client: login, token renewal, devices, USP messages
    lcm/usp.ts                  USP message builders/parsers, DU UUIDs, labels, subscriptions
    devices/registry.ts         device list (single-device mode), installed apps matched to the catalogue
    jobs/store.ts               job records, JSON persistence (atomic writes)
    jobs/engine.ts              validation, sending, waiting for results, resume after restart
  scripts/
    catalogue.ts                check a real GitLab group from the command line
    demo.ts                     demo server: fake GitLab + fake modem, sign in with ZT2607000024
  test/                         node:test suites + in-memory fakes (fakeGitlab.ts, fakeOktopus.ts)
  README.md, TESTING-PHASE3.md  backend notes and the manual test run on a real modem
dashboard/
  src/main.tsx, App.tsx         root, session check, header, hash routes, dialogs
  src/api.ts                    typed calls to the backend, error explanations
  src/ui.tsx                    shared components and hooks (Icon, Modal, Toasts, usePoll, StateBadge, fmt*)
  src/pages/                    Login, Marketplace, InstalledApps, Jobs
  src/styles.css                TINNO theme
  build.mjs                     esbuild -> ../server/public
installer/
  build-installer.ps1           one-command Windows build
  bundle.mjs                    bundles server + demo into single .mjs files
  lcm-dashboard.iss             Inno Setup script
  files/                        start.cmd, demo.cmd, README.txt shipped with the app
  config.example.json           template for config.json
docs/DEVELOPER.md               this file
```

## 3. Toolchain and conventions

| Part | Tooling | Notes |
| --- | --- | --- |
| Backend | Node.js 22.6+, `--experimental-strip-types` | **No npm dependencies.** Only `node:` built-ins. Tests use `node:test`. |
| Frontend | React 19, esbuild, TypeScript (types only) | `npm install` in `dashboard/` |
| Installer | PowerShell, Inno Setup 6.3+, the same Node | Windows only |

Type-stripping rules (the backend runs TypeScript without compiling, so these fail at runtime):

- no `enum`, no `namespace`, no constructor parameter properties (`constructor(private x: T)`): declare fields explicitly;
- imports use the `.ts` extension; type-only imports use `import type`;
- no decorators.

Style: small modules, plain functions where possible, errors as typed classes (`JobError`, `OktopusError`,
`AuthError`) carrying an HTTP status and an upper-case code. Secrets are never logged and never stored in job
records (a test checks this).

Type check (optional, recommended before a release):

```sh
npx -p typescript tsc --noEmit --strict --allowImportingTsExtensions --module nodenext \
    --moduleResolution nodenext --target es2022 --types node server/src/*.ts server/src/*/*.ts
```

(needs `@types/node` available to `tsc`).

## 4. Running it

```sh
cd dashboard && npm install && npm run build      # UI -> server/public (or: npm run watch)
cd ../server
npm test                                          # all suites
npm run demo                                      # fake GitLab + modem on http://localhost:8080
```

Against the real systems, use a `config.json` kept **outside the repository**:

```sh
cd server
LCM_CONFIG_FILE=$HOME/lcm-secrets/config.json LCM_PUBLIC_DIR=./public npm start
```

Useful while developing:

- `npm run catalogue -- --resolve` (with `GITLAB_GROUP`, `GITLAB_TOKEN`) lists every project as OK or ISSUE.
- `LCM_AUTH=off` skips sign-in (development only).
- `LCM_POLL_SECONDS=2` makes jobs notice results faster.
- Data (job history, catalogue cache) goes to `LCM_DATA_DIR` (default `./data`, ignored by git).

## 5. Configuration reference

Settings come from environment variables; `LCM_CONFIG_FILE` points to a JSON file with the same names
(environment wins; empty values are ignored). Any secret can also be read from a file: `<NAME>_FILE=/path`.

| Name | Default | Meaning |
| --- | --- | --- |
| `GITLAB_GROUP` | (required) | Group whose projects are the catalogue |
| `GITLAB_TOKEN` | — | `read_api` token (needed for private groups) |
| `GITLAB_URL` | `https://gitlab.com` | GitLab instance |
| `LCM_TIERS` | `Basic,Advanced,Business` | Allowed `tier=` values |
| `LCM_INCLUDE_PRERELEASE` | `false` | Offer `-rc`/`-beta` tags |
| `LCM_REFRESH_MINUTES` | `15` | Catalogue refresh interval |
| `OKTOPUS_URL` | `https://tinno.oktopus.app.br` | ACS address |
| `OKTOPUS_EMAIL`, `OKTOPUS_PASSWORD` | — | Service account (no 2FA, restricted role). Enables devices and jobs |
| `OKTOPUS_TOKEN` | — | Pasted JWT instead of a service account (tests only; cannot be renewed) |
| `REGISTRY_USERNAME`, `REGISTRY_PASSWORD` | — | Deploy token sent to the modem in InstallDU/Update |
| `LCM_EXEC_ENV_REF` | `Device.SoftwareModules.ExecEnv.1.` | Execution environment for InstallDU |
| `LCM_UPDATE_RETAIN_DATA` | `true` | Send `RetainData=true` on Update (keep the app's data) |
| `LCM_POLL_SECONDS` | `10` | Job polling interval |
| `LCM_JOB_TIMEOUT_MINUTES` | `16` | Give up waiting for a result |
| `LCM_AUTH` | `serial` | `serial` = sign in with the device serial, `off` = no sign-in |
| `LCM_ALLOWED_SNS` | `LCM_DEVICE_SN` | Comma-separated serials allowed to sign in |
| `LCM_ACCESS_CODE` | — | Extra code required at sign-in |
| `LCM_DEVICE_SN` | — | Single-device mode: only this device is visible |
| `LCM_DEVICE_HW` | — | Hardware the modem has (e.g. `wan`); apps needing other `hw=` show Not compatible |
| `PORT`, `LCM_HOST` | `8080`, `127.0.0.1` | Listen address |
| `LCM_PORT_FALLBACK` | `false` | Try the next ports when busy (Windows reserved ranges) |
| `LCM_OPEN_BROWSER` | `false` | Open the browser at start |
| `LCM_PUBLIC_DIR` | `./public` | Built UI |
| `LCM_DATA_DIR` | `./data` | Job history and catalogue cache |

## 6. Backend modules

**`catalogue/`** — `buildCatalogue()` lists the group's projects, parses each description with
`parseDescription()` (keys: `name, tier, category, segments, network, hostproc, privileged, ram, disk, hw,
docsis, health, grace, featured`), finds the registry repository at the project root and its semantic tags.
Projects that fail any check become `issues` (shown by `GET /catalogue/issues`) instead of services.
`CatalogueStore` keeps the last good catalogue in memory and in `data/catalogue.json`, so the dashboard
starts even when GitLab is unreachable. `resolveVersion()` turns a tag into the image URL the modem gets
(`docker://registry.gitlab.com/<project>:<tag>`).

**`oktopus/client.ts`** — `login()` (`PUT /api/auth/login`), `ensureToken()` renews the JWT 10 minutes before
it expires, `request()` retries once after 401/403 with a fresh login. `listDevices()` pages through
`GET /api/device`; `getDevice(sn)` reads one device including its labels (a JSON string in Oktopus);
`sendUsp(sn, msg)` posts a USP message and returns the response. All calls send `x-api-version: 2` and the raw
token in `Authorization` (no "Bearer").

**`lcm/usp.ts`** — builders for the USP messages (snake_case JSON as Oktopus expects): `getMsg`, `installMsg`
(adds `Privileged` and `NetworkConfig.ShareParentNetwork` from the app metadata), `updateMsg` (with
`RetainData`), `uninstallMsg`, `setRequestedStateMsg`, `addSubscriptionMsg`. Parsers: `parseOperate`
(async / sync / failed), `parseGet`, `uspError`. `duUuid(endpointId, serviceId)` gives the fixed DU UUID per
device and app (UUID v5). `parseLabel` reads `lcm:<UUID>` labels. `LCM_SUBSCRIPTIONS` and
`missingSubscriptions()` describe the two subscriptions the modem needs.

**`devices/registry.ts`** — `DeviceRegistry.list()/get(sn)` with a short cache; in single-device mode other
serials return null. `apps(device)` sends one GET of `DeploymentUnit.` and `ExecutionUnit.` and builds the
installed-app list: catalogue match by DU name, version, EU status, `updateAvailable`, last result label.

**`jobs/`** — see [section 7](#7-how-a-job-works). `JobStore` keeps jobs in `data/jobs.json`, written atomically
(unique temp file + rename, retried on Windows `EPERM/EBUSY`), and trims old finished jobs.

**`auth/auth.ts`** — `precheck()` validates the serial format (`^[A-Za-z0-9._-]{3,64}$`), the allowed list, the
access code (constant-time compare) and the rate limit (10 failures per 5 minutes per IP). Sessions: random
token in an HttpOnly, SameSite=Strict cookie `lcm_session`; 12 h absolute, 120 min idle.

**`api.ts`** — routing on `node:http`, JSON bodies up to a small limit, error mapping to `{error, message}`,
session enforcement, static files with SPA fallback and a path-traversal guard.

**`launch.ts`** — `listen()` detects an already-running dashboard on the port (opens the browser and exits),
and with fallback tries the next 20 ports, then any free port.

## 7. How a job works

```
POST /devices/{sn}/jobs {op, service, version?}
  └─ JobEngine.create(): validate, reserve (device, service), save "queued", return a snapshot
       └─ run():
            send():  ensureSubscriptions(sn)   once per device per process (install/update/uninstall)
                     build the USP message, save "sent", sendUsp()
                     refused by the agent -> "failed" with the USP error code
                     accepted -> "running" (async request path kept)
            wait:    install/update/uninstall -> waitLabel(): poll lcm:<UUID> until it differs from the
                     baseline label read before sending; Installed/Uninstalled -> "succeeded",
                     fault code != 0 -> "failed"; nothing within the timeout -> "timed_out"
                     start/stop -> waitEuState(): poll the ExecutionUnit until Active / Idle (120 s)
            refreshApp(): re-read the device so the UI shows the new state
```

Validation errors (`JobError` → HTTP status): `BAD_OP`, `SERVICE_REQUIRED`, `VERSION_REQUIRED` (400);
`SERVICE_NOT_FOUND`, `VERSION_NOT_FOUND`, `DEVICE_NOT_FOUND`, `APP_NOT_INSTALLED` (404); `DEVICE_OFFLINE`,
`JOB_IN_PROGRESS`, `ALREADY_INSTALLED`, `ALREADY_AT_VERSION`, `NO_EXECUTION_UNIT` (409);
`IMAGE_RESOLVE_FAILED` (502); `CATALOGUE_NOT_READY` (503).

Why a baseline label: the modem clock is not trusted (it is about 5 h ahead on test units), so the engine does
not compare times; the first label value different from the one read before sending is the result.

Restart safety: `resume()` restarts waiting for every job still `sent`/`running` when the backend starts.

Job states: `queued → sent → running → succeeded | failed | timed_out`.

## 8. REST API

All under `/api/v1`. Errors: `{ "error": "<CODE>", "message": "<text>" }`.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Catalogue status, last refresh, Oktopus configured (no session needed) |
| `GET /auth/session` | `{authMode, authenticated, sn, codeRequired, demoHint}` |
| `POST /auth/login` | `{serial, code?}` → session cookie. Errors: `BAD_SERIAL`, `BAD_CODE`, `NOT_CONNECTED`, `TOO_MANY_ATTEMPTS` |
| `POST /auth/logout` | End the session |
| `GET /services?category=&q=` | Catalogue (with `compatible` against `LCM_DEVICE_HW`) |
| `GET /services/{id}` | One app (`id` = URL-encoded `group/project`) |
| `GET /services/{id}/versions/{tag}` | Resolved image URL and digest |
| `GET /catalogue/issues`, `POST /catalogue/refresh` | Catalogue problems, manual refresh |
| `GET /devices`, `GET /devices/{sn}` | Devices (with a session: only the signed-in one; others → `WRONG_DEVICE`) |
| `GET /devices/{sn}/apps` | Installed apps on the device |
| `POST /devices/{sn}/jobs` | Start a job `{op: install\|update\|uninstall\|start\|stop, service, version?}` |
| `GET /jobs?device=&service=&state=`, `GET /jobs/{id}` | Job list and one job (limited to the session's device) |

With `LCM_AUTH=serial`, every route except `/health` and `/auth/*` returns 401 `AUTH_REQUIRED` without a session.

## 9. Frontend

- `main.tsx` mounts `App`. `App.tsx` asks `/auth/session`, shows `Login` or the dashboard, and handles the
  header (modem status, demo badge, log out) and hash routes: `#/` (marketplace, `?cat=` filter),
  `#/installed`, `#/jobs/<id>`.
- `api.ts` wraps every backend call with types; `explain(e)` turns error codes into operator-friendly text;
  `setAuthLostHandler` sends the user back to the sign-in page when a session ends.
- `ui.tsx` holds shared pieces: `usePoll` (periodic refresh), `useNow`, `Modal`, `Toasts`, `StateBadge`, `Icon`,
  formatting helpers.
- Pages: `Marketplace` (search, filters, featured card, app cards, install dialog, active-job panel),
  `InstalledApps` (modem details, actions per app), `Jobs` (counts, filter, list, detail with Copy JSON),
  `Login`.
- Styling is plain CSS in `styles.css` (TINNO green theme). No component library.
- Build: `npm run build` (minified) or `npm run watch` (rebuild on change, inline source maps). Output always
  goes to `server/public/`, which git ignores.

## 10. Tests and the demo

```sh
cd server && npm test
```

| Suite | Covers |
| --- | --- |
| `parseDescription.test.ts`, `tags.test.ts`, `sync.test.ts`, `api.test.ts` | Catalogue parsing, tag order, sync, catalogue API |
| `oktopus.test.ts` | Login, token renewal, retry, USP builders (incl. RetainData) |
| `jobs.test.ts` | Full job flow, refusals, timeouts, bad image, restart resume, single-device mode, subscriptions |
| `devices-api.test.ts`, `auth.test.ts` | Device API, sign-in rules, sessions, rate limit, device binding |

`test/fakeOktopus.ts` models the real Oktopus responses (login, device list with labels as a JSON string,
`usp/generic` for GET/ADD/OPERATE, delayed `lcm:<UUID>` labels). `test/fakeGitlab.ts` models the GitLab API.
New behaviour against Oktopus should get a matching change in the fake plus a test.

`npm run demo` starts the backend with both fakes, seven sample apps (one featured, one incompatible), the modem
`ZT2607000024` online and `OTHER0001` offline. It is also shipped in the installer as "TINNO LCM Dashboard (demo)".

Manual test on a real modem: `server/TESTING-PHASE3.md`.

## 11. Windows installer

`installer/build-installer.ps1` (run from the repository root):

1. checks `node` and `ISCC` (Inno Setup);
2. `npm install` + build in `dashboard/`;
3. `bundle.mjs`: esbuild bundles `server/src/main.ts` → `server.mjs` and `scripts/demo.ts` → `demo.mjs`;
4. copies the UI, `node.exe` (from the build PC), `files/*` into `installer/build/`;
5. compiles `lcm-dashboard.iss` → `installer/output/TINNO-LCM-Dashboard-Setup-<version>.exe`.

The setup is per user (`%LOCALAPPDATA%\Programs\TINNO LCM Dashboard`), needs no admin rights, and skips its
settings pages when a `config.json` sits next to the exe. `-ConfigFile` embeds a config (then the exe contains
secrets: internal use only). `-Version` sets the version (default `0.5.1`). Details: `installer/README-build.md`.

## 12. Common changes

**Add a configuration setting:** add the field to `Config` and `loadConfig()` in `config.ts`, pass it where it
is used from `main.ts`, document it in section 5 and in `installer/config.example.json` if operators set it.

**Add an `[lcm ...]` metadata key:** extend `parseDescription.ts` (parse + validate) and its tests; expose it
in `serviceSummary` in `api.ts`; use it in the UI.

**Change a USP message:** edit the builder in `lcm/usp.ts`, update `fakeOktopus.ts` if the response changes,
add a test in `oktopus.test.ts` or `jobs.test.ts`. Check the argument is registered in the modem's usp-pa
(`lcm_rbus_datamodel.c`); unregistered arguments are not forwarded.

**Add a job type:** add it to `JobOp` (`jobs/store.ts`), validation and sending in `jobs/engine.ts`, the way the
result is detected (label or EU state), the API's allowed `op` values, a button and dialog in the UI, tests.

**Add a page:** a component in `dashboard/src/pages/`, a hash route and menu entry in `App.tsx`, API calls in
`api.ts`.

## 13. Release checklist

1. `npm test` passes; type check clean.
2. Bump the version in `server/package.json`, `dashboard/package.json`, `installer/build-installer.ps1`
   (`-Version` default) and `installer/lcm-dashboard.iss` (`AppVersion`).
3. Build the installer on Windows; run it on a clean user account; check the demo and one real install/update/
   uninstall against a test modem.
4. `git status`: no `config.json`, tokens, HAR files or `data/` staged.
5. Tag the release (`git tag v0.5.1`) and attach the setup exe to the release, not to the repository.

## 14. Device-side contract

What the dashboard expects from the modem firmware and Oktopus (maintained outside this repository):

- usp-pa with the LCM data model (`lcm_rbus_datamodel.c` v10): InstallDU / Update (accepts `RetainData`) /
  Uninstall return a request path; `DUStateChange!` sent after every operation; a failed image pull is
  reported within seconds (fault 7002); `ExecutionUnitList` filled on each DU.
- Subscriptions `lcm-dustate` (Event, `Device.SoftwareModules.DUStateChange!`) and `lcm-opcomplete`
  (OperationComplete). The backend adds them if missing.
- Oktopus runs `oktopus-lcm-results.lua`, which writes `lcm:<UUID>` = `State|Operation|FaultCode|Version|CompleteTime`.
- The modem is provisioned to the ACS (`lcm-acs-provision.sh`); the dashboard only sees online devices.
