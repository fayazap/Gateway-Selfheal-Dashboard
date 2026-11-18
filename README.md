# TINNO LCM Dashboard (LCM App Store)

Windows dashboard for the LCM App Store on TINNO B521DE cable modems. An operator signs in with the
modem's serial number and installs, updates, stops, starts and removes container apps on that modem.
Apps come from a GitLab group; every command goes through the Oktopus ACS (USP over MQTT) to the modem.

| Folder | What it is |
| --- | --- |
| [`server/`](server) | Backend: Node.js 22, TypeScript run directly, no third-party packages. GitLab catalogue, Oktopus client, job engine, REST API, sign-in, static file server. |
| [`dashboard/`](dashboard) | Frontend: React 19 single-page app, built with esbuild into `server/public/`. |
| [`installer/`](installer) | Windows installer (Inno Setup): bundles the backend, the built UI and `node.exe` into one setup exe. |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md) | Source code guide: architecture, modules, API, job flow, tests, how to change things. |

## Quick start (development)

Requirements: Node.js 22.6 or newer.

```sh
# 1. build the UI
cd dashboard
npm install
npm run build              # -> ../server/public

# 2. run the tests and the demo (simulated GitLab + modem, no credentials needed)
cd ../server
npm test
npm run demo               # http://localhost:8080 , sign in with ZT2607000024
```

Against real systems: copy `installer/config.example.json` to a private location, fill it in, and run
`LCM_CONFIG_FILE=/path/to/config.json npm start` in `server/`. See
[docs/DEVELOPER.md](docs/DEVELOPER.md#4-running-it).

## Build the Windows installer

On a Windows PC with Node.js 22+ and Inno Setup 6.3+:

```powershell
.\installer\build-installer.ps1
```

Output: `installer\output\TINNO-LCM-Dashboard-Setup-0.5.1.exe`. See
[installer/README-build.md](installer/README-build.md).

## Related parts (not in this repository)

- Modem firmware layer `meta-lcm` (usp-pa v10 LCM data model, cthulhu and rlyeh fixes, `lcm-acs-provision`).
- Oktopus script `oktopus-lcm-results.lua` (writes job results as `lcm:<UUID>` device labels).
- Operator instructions: "LCM App Store — Operator Instructions". Design: "LCM Service Marketplace — Software Design Document".

## Security

Never commit `config.json`, tokens, passwords, HAR files or job data. `.gitignore` excludes the usual
names, but check `git status` before every commit. Proprietary — TINNO internal use only.
