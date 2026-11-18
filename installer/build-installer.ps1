<#
  Builds the TINNO LCM Dashboard Windows installer (one Setup.exe, no dependencies for the user).

  Needs on THIS (build) PC: Node.js 22.6+ (already used for the backend) and Inno Setup 6
  (https://jrsoftware.org/isdl.php, or: winget install JRSoftware.InnoSetup).

  Usage (PowerShell, from the lcm-dashboard folder):
    .\installer\build-installer.ps1
        -> installer asks for the connection settings during setup (nothing secret inside the .exe)
    .\installer\build-installer.ps1 -ConfigFile C:\lcm-secrets\config.json
        -> that settings file is built into the installer; the settings pages are skipped.
           (Without -ConfigFile you can also ship a config.json next to Setup.exe: setup uses it.)
    .\installer\build-installer.ps1 -EmbedSecrets -OktopusEmail svc@... -RegistryUser gitlab+deploy-token-...
        -> settings are built into the installer from C:\lcm-secrets; the settings page is skipped.
           Anyone who has the .exe can extract them: share it only with people allowed to use them.

  Output: installer\output\TINNO-LCM-Dashboard-Setup-<version>.exe
#>
param(
  [string]$ConfigFile = '',
  [switch]$EmbedSecrets,
  [string]$SecretsDir = 'C:\lcm-secrets',
  [string]$GitlabGroup = 'tinno-lcm',
  [string]$OktopusUrl = 'https://tinno.oktopus.app.br',
  [string]$OktopusEmail = '',
  [string]$RegistryUser = '',
  [string]$DeviceHw = 'wan',
  [string]$AllowedSns = '',
  [string]$AccessCode = '',
  [string]$Version = '0.5.1'
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
function Step($m) { Write-Host "==> $m" -ForegroundColor Green }

# 1. tools
Step 'Checking tools'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js not found. Install Node.js 22 LTS or newer.' }
$nv = (& node -p "process.versions.node").Trim()
if ([version]$nv -lt [version]'22.6.0') { throw "Node.js $nv is too old; 22.6 or newer is needed." }
$iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { $iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source }
if (-not $iscc) { throw 'Inno Setup 6 not found. Install it from https://jrsoftware.org/isdl.php (or: winget install JRSoftware.InnoSetup), then run this again.' }
Write-Host "    node $nv ($node)"; Write-Host "    Inno Setup: $iscc"

# 2. dashboard UI
Step 'Building the dashboard UI'
Push-Location (Join-Path $root 'dashboard')
try {
  if (-not (Test-Path 'node_modules\esbuild')) { npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed' } }
  npm run build; if ($LASTEXITCODE) { throw 'dashboard build failed' }
} finally { Pop-Location }

# 3. staging folder: bundled backend + UI + node.exe + launchers
Step 'Preparing files'
$staging = Join-Path $here 'staging'
$app = Join-Path $staging 'app'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force $app | Out-Null
$env:STAGING_APP = $app
& node (Join-Path $here 'bundle.mjs'); if ($LASTEXITCODE) { throw 'bundling the backend failed' }
Copy-Item (Join-Path $root 'server\public') (Join-Path $app 'public') -Recurse
Copy-Item $node (Join-Path $app 'node.exe')
$nodeLicense = Join-Path (Split-Path $node -Parent) 'LICENSE'
if (Test-Path $nodeLicense) { Copy-Item $nodeLicense (Join-Path $app 'NODE-LICENSE.txt') }
Copy-Item (Join-Path $here 'files\*') $app

# 4. installer defaults
Step 'Writing installer settings'
function Read-Secret($name) {
  $p = Join-Path $SecretsDir $name
  if (-not (Test-Path $p)) { throw "Secret file not found: $p" }
  (Get-Content $p -Raw).Trim()
}
# value inside  #define X "..."  that also ends up inside a Pascal '...' string
function IssValue($s) { ($s -replace '"', '""') -replace "'", "''" }
$vals = [ordered]@{
  DefGitlabGroup = $GitlabGroup; DefGitlabToken = ''; DefOktopusUrl = $OktopusUrl; DefOktopusEmail = $OktopusEmail
  DefOktopusPassword = ''; DefRegistryUser = $RegistryUser; DefRegistryPassword = ''; DefAccessCode = $AccessCode
  DefDeviceHw = $DeviceHw; DefAllowedSns = $AllowedSns; Embed = '0'; AppVersion = $Version
}
if ($EmbedSecrets) {
  if (-not $OktopusEmail -or -not $RegistryUser) { throw '-EmbedSecrets needs -OktopusEmail and -RegistryUser.' }
  $vals.DefGitlabToken = Read-Secret 'gitlab-token.txt'
  $vals.DefOktopusPassword = Read-Secret 'oktopus-password.txt'
  $vals.DefRegistryPassword = Read-Secret 'deploy-token.txt'
  $vals.Embed = '1'
  Write-Warning 'Secrets are built into the installer. Share the .exe only with people allowed to use them.'
}
$buildDir = Join-Path $here 'build'
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }   # never reuse settings from an earlier build
New-Item -ItemType Directory -Force $buildDir | Out-Null
if ($ConfigFile) {
  if ($EmbedSecrets) { throw 'Use either -ConfigFile or -EmbedSecrets, not both.' }
  if (-not (Test-Path $ConfigFile)) { throw "Settings file not found: $ConfigFile" }
  try { $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json } catch { throw "$ConfigFile is not valid JSON: $($_.Exception.Message)" }
  foreach ($k in 'GITLAB_GROUP', 'OKTOPUS_EMAIL', 'OKTOPUS_PASSWORD') {
    if (-not $cfg.$k) { throw "$ConfigFile has no $k" }
  }
  if (-not $cfg.REGISTRY_USERNAME -or -not $cfg.REGISTRY_PASSWORD) { Write-Warning 'No REGISTRY_USERNAME/REGISTRY_PASSWORD: installs will only work from a public registry.' }
  Copy-Item $ConfigFile (Join-Path $buildDir 'config.json')
  $vals.Embed = '1'
  Write-Warning "Settings from $ConfigFile are built into the installer. Share the .exe only with people allowed to use them."
}
$lines = $vals.GetEnumerator() | ForEach-Object { '#define {0} "{1}"' -f $_.Key, (IssValue $_.Value) }
Set-Content -Path (Join-Path $buildDir 'defaults.iss') -Value $lines -Encoding UTF8

# 5. compile
Step 'Compiling the installer'
& $iscc /Q (Join-Path $here 'lcm-dashboard.iss'); if ($LASTEXITCODE) { throw 'Inno Setup failed (see messages above)' }
if ($EmbedSecrets -or $ConfigFile) { Remove-Item $buildDir -Recurse -Force }   # do not leave secrets lying around
$exe = Join-Path $here "output\TINNO-LCM-Dashboard-Setup-$Version.exe"
Step "Done: $exe"
