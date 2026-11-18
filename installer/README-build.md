# Building the Windows installer

Produces one file, `installer\output\TINNO-LCM-Dashboard-Setup-<version>.exe`. Whoever installs it needs
nothing else: it carries its own `node.exe`, the bundled backend and the built dashboard.

## One-time setup on the build PC
- Node.js 22.6 or newer (you already have it for the backend).
- Inno Setup 6.3 or newer: https://jrsoftware.org/isdl.php, or `winget install JRSoftware.InnoSetup`.

## Build
From the `lcm-dashboard` folder in PowerShell:

```powershell
.\installer\build-installer.ps1
```

If PowerShell refuses to run scripts: `powershell -ExecutionPolicy Bypass -File .\installer\build-installer.ps1`.

### Easiest: a settings file instead of the setup pages
Copy `installer\config.example.json` to e.g. `C:\lcm-secrets\config.json` and fill it in (keys are the same
as the environment variables in `server\README.md`). Then either:

- **ship it next to the installer**: put `TINNO-LCM-Dashboard-Setup-<version>.exe` and `config.json` in one
  folder (or one zip). Setup sees `config.json`, copies it into the installation and skips the settings
  pages. Nothing secret is inside the .exe and you can change the file without rebuilding. A
  `config.json` next to Setup.exe also replaces the settings of an earlier installation (the old file is
  kept as `config.json.bak`).
- **build it in**: `.\installer\build-installer.ps1 -ConfigFile C:\lcm-secrets\config.json` checks the file
  (valid JSON, GitLab group and Oktopus account present) and puts it inside the .exe: one file to send,
  no setup pages. Anyone who has the .exe can extract it, as with `-EmbedSecrets`.

Values that are empty are ignored. JSON needs `\\` for a backslash and `\"` for a quote inside a value.

### Other ways to handle the connection settings

| | Command | What the person installing sees |
|---|---|---|
| **Ask during setup** (default) | `.\installer\build-installer.ps1` | A "Connection settings" page: GitLab group/token, Oktopus URL/e-mail/password, deploy token, optional access code. Nothing secret is inside the .exe. |
| **Built in** | `.\installer\build-installer.ps1 -EmbedSecrets -OktopusEmail <service account> -RegistryUser <gitlab+deploy-token-…>` | No settings page: install, open, sign in with the serial. The GitLab token, Oktopus password and deploy token are read from `C:\lcm-secrets` and stored in the .exe: **anyone who has the file can extract them.** Share it only with people allowed to use those accounts, and rotate them if it leaks. |

Other options: `-AccessCode <code>` (required at sign-in together with the serial), `-AllowedSns ZT2607000024`
(only these serials may sign in), `-DeviceHw wan` (hardware for the compatibility check), `-Version 0.5.1`.

## What the installer does
- Installs per user into `%LOCALAPPDATA%\Programs\TINNO LCM Dashboard` (no administrator rights).
- Start menu: **TINNO LCM Dashboard**, **TINNO LCM Dashboard (demo)**, Read me, Uninstall; optional desktop icon.
- The dashboard runs on `http://localhost:18080/` (demo on 18081), reachable from this PC only.
- Settings: `config.json` in the install folder. Job history: `%LOCALAPPDATA%\TINNO LCM Dashboard\data`.
- Installing a newer version over an old one keeps `config.json` (the settings page is skipped). To change
  the settings, edit `config.json` or uninstall and install again.

## Files
- `build-installer.ps1`: the build (UI build, backend bundle, staging, Inno Setup compile)
- `bundle.mjs`: bundles `server/src/main.ts` and `server/scripts/demo.ts` into `server.mjs` / `demo.mjs`
- `lcm-dashboard.iss`: Inno Setup script
- `files/`: `start.cmd`, `demo.cmd`, `README.txt` copied into the installation
- generated, not to commit: `staging/`, `build/`, `output/`
