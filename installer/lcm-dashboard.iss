; TINNO LCM Dashboard - Windows installer (Inno Setup 6).
; Built by build-installer.ps1, which fills staging\app and writes build\defaults.iss.
; Per-user install: no administrator rights needed. Includes its own node.exe.

#include "build\defaults.iss"
#ifndef AppVersion
  #define AppVersion "0.5.1"
#endif

[Setup]
AppId={{6C2B7E2A-3F1D-4C55-9A8E-7D41B0E6A9C3}
AppName=TINNO LCM Dashboard
AppVersion={#AppVersion}
AppVerName=TINNO LCM Dashboard {#AppVersion}
AppPublisher=TINNO
DefaultDirName={localappdata}\Programs\TINNO LCM Dashboard
DefaultGroupName=TINNO LCM Dashboard
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=TINNO-LCM-Dashboard-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=TINNO LCM Dashboard
UninstallDisplayIcon={app}\node.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "staging\app\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
#if FileExists(AddBackslash(SourcePath) + "build\config.json")
; settings built into the installer (build-installer.ps1 -ConfigFile); an existing config.json is kept
Source: "build\config.json"; DestDir: "{app}"; Flags: onlyifdoesntexist ignoreversion
#endif

[Icons]
Name: "{group}\TINNO LCM Dashboard"; Filename: "{app}\start.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\node.exe"; Comment: "Open the LCM Service Marketplace"
Name: "{group}\TINNO LCM Dashboard (demo)"; Filename: "{app}\demo.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\node.exe"; Comment: "Try the dashboard with a simulated modem"
Name: "{group}\Read me"; Filename: "{app}\README.txt"
Name: "{group}\Uninstall TINNO LCM Dashboard"; Filename: "{uninstallexe}"
Name: "{userdesktop}\TINNO LCM Dashboard"; Filename: "{app}\start.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\node.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\start.cmd"; Description: "Open the dashboard now"; Flags: postinstall nowait skipifsilent shellexec unchecked
Filename: "{app}\demo.cmd"; Description: "Try the demo (simulated modem)"; Flags: postinstall nowait skipifsilent shellexec unchecked

[UninstallDelete]
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\config.json.bak"

[Code]
var
  SettingsPage: TInputQueryWizardPage;   { ACS + GitLab catalogue }
  RegistryPage: TInputQueryWizardPage;   { image pull credentials + access code }

function JsonStr(const S: String): String;
var
  R: String;
begin
  R := S;
  StringChangeEx(R, '\', '\\', True);
  StringChangeEx(R, '"', '\"', True);
  Result := '"' + R + '"';
end;

function ConfigFile(): String;
begin
  Result := ExpandConstant('{app}\config.json');
end;

{ config.json placed next to Setup.exe: used instead of the settings pages }
function SourceConfig(): String;
begin
  Result := ExpandConstant('{src}\config.json');
end;

procedure InitializeWizard();
begin
  SettingsPage := CreateInputQueryPage(wpSelectTasks,
    'Connection settings',
    'How the dashboard reaches the ACS (Oktopus) and the GitLab catalogue.',
    'Ask the LCM team for these values. They are stored only on this PC.');
  SettingsPage.Add('GitLab group:', False);
  SettingsPage.Add('GitLab token (read_api):', True);
  SettingsPage.Add('Oktopus URL:', False);
  SettingsPage.Add('Oktopus service account e-mail:', False);
  SettingsPage.Add('Oktopus service account password:', True);
  SettingsPage.Values[0] := '{#DefGitlabGroup}';
  SettingsPage.Values[1] := '{#DefGitlabToken}';
  SettingsPage.Values[2] := '{#DefOktopusUrl}';
  SettingsPage.Values[3] := '{#DefOktopusEmail}';
  SettingsPage.Values[4] := '{#DefOktopusPassword}';

  RegistryPage := CreateInputQueryPage(SettingsPage.ID,
    'Image download and sign-in',
    'Credentials the modem uses to download app images, and an optional sign-in code.',
    'Registry user is the GitLab deploy token name (for example gitlab+deploy-token-12345678); ' +
    'registry password is the deploy token itself. The access code, if set, is asked at sign-in together with the serial number.');
  RegistryPage.Add('Registry user (GitLab deploy token name):', False);
  RegistryPage.Add('Registry password (GitLab deploy token):', True);
  RegistryPage.Add('Access code for sign-in (optional):', True);
  RegistryPage.Values[0] := '{#DefRegistryUser}';
  RegistryPage.Values[1] := '{#DefRegistryPassword}';
  RegistryPage.Values[2] := '{#DefAccessCode}';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = SettingsPage.ID) or (PageID = RegistryPage.ID) then
    { settings built in, config.json next to Setup.exe, or an update that keeps the existing settings }
    Result := ('{#Embed}' = '1') or FileExists(SourceConfig()) or FileExists(ConfigFile());
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = SettingsPage.ID then
  begin
    if (Trim(SettingsPage.Values[0]) = '') or (Trim(SettingsPage.Values[2]) = '') or
       (Trim(SettingsPage.Values[3]) = '') or (SettingsPage.Values[4] = '') then
    begin
      MsgBox('GitLab group, Oktopus URL, e-mail and password are required.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = RegistryPage.ID then
  begin
    if (Trim(RegistryPage.Values[0]) = '') <> (Trim(RegistryPage.Values[1]) = '') then
    begin
      MsgBox('Fill in both the registry user and the registry password, or leave both empty (public images only).', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure WriteConfig();
var
  Lines: TArrayOfString;
begin
  SetArrayLength(Lines, 13);
  Lines[0]  := '{';
  Lines[1]  := '  "GITLAB_GROUP": ' + JsonStr(Trim(SettingsPage.Values[0])) + ',';
  Lines[2]  := '  "GITLAB_TOKEN": ' + JsonStr(Trim(SettingsPage.Values[1])) + ',';
  Lines[3]  := '  "OKTOPUS_URL": ' + JsonStr(Trim(SettingsPage.Values[2])) + ',';
  Lines[4]  := '  "OKTOPUS_EMAIL": ' + JsonStr(Trim(SettingsPage.Values[3])) + ',';
  Lines[5]  := '  "OKTOPUS_PASSWORD": ' + JsonStr(SettingsPage.Values[4]) + ',';
  Lines[6]  := '  "REGISTRY_USERNAME": ' + JsonStr(Trim(RegistryPage.Values[0])) + ',';
  Lines[7]  := '  "REGISTRY_PASSWORD": ' + JsonStr(Trim(RegistryPage.Values[1])) + ',';
  Lines[8]  := '  "LCM_ACCESS_CODE": ' + JsonStr(RegistryPage.Values[2]) + ',';
  Lines[9]  := '  "LCM_DEVICE_HW": ' + JsonStr('{#DefDeviceHw}') + ',';
  Lines[10] := '  "LCM_ALLOWED_SNS": ' + JsonStr('{#DefAllowedSns}') + ',';
  Lines[11] := '  "LCM_AUTH": "serial"';
  Lines[12] := '}';
  SaveStringsToUTF8File(ConfigFile(), Lines, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then Exit;
  if FileExists(SourceConfig()) then
  begin
    { a config.json shipped next to Setup.exe always wins; the previous one is kept as config.json.bak }
    if FileExists(ConfigFile()) then
      FileCopy(ConfigFile(), ConfigFile() + '.bak', False);
    if not FileCopy(SourceConfig(), ConfigFile(), False) then
      MsgBox('Could not copy config.json from the installer folder. Copy it to ' + ConfigFile() + ' yourself.', mbError, MB_OK);
  end
  else if not FileExists(ConfigFile()) then
    WriteConfig();
end;
