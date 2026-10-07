; Inno Setup 6 script - eMTA Self-Healing Dashboard (D4.0)
; Build: run build_installer.bat in the dashboard folder (it runs PyInstaller, then this script).
;
; Installs per user (no administrator rights) into
;   %LOCALAPPDATA%\Programs\eMTA Self-Healing Dashboard
; because the dashboard keeps config.json and its logs next to dashboard.exe,
; and that folder must be writable.

#define AppName      "AI based Self healing Dashboard"
#define AppVersion   "5.0"
#define AppPublisher "Tinno"
#define AppExe       "dashboard.exe"

[Setup]
AppId={{6B0E1E57-6C0B-4B0E-9C5E-2D4A7F3B5A10}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=eMTA-SelfHealing-Dashboard-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
; the SNMP tools must be real files next to the .exe (see snmp_bin_path.py)
Source: "..\snmp_bin\*"; DestDir: "{app}\snmp_bin"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
; config.json is NOT copied from the build machine (it holds that machine's
; modem address and SSH password). It is written from the wizard page below.

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{group}\Edit modem settings (config.json)"; Filename: "notepad.exe"; Parameters: """{app}\config.json"""
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\modem_monitor.log"

[Code]
var
  CfgPage: TInputQueryWizardPage;

procedure InitializeWizard();
begin
  CfgPage := CreateInputQueryPage(wpSelectDir,
    'Modem connection', 'How the dashboard reaches the eMTA',
    'These values are saved in config.json in the installation folder. ' +
    'You can change them later from the Start menu (Edit modem settings).');
  CfgPage.Add('Modem (CM) IP address:', False);
  CfgPage.Add('SNMP read community:', False);
  CfgPage.Add('SNMP write community:', False);
  CfgPage.Add('SSH user name (anomaly details and the Anomaly Detection test):', False);
  CfgPage.Add('SSH password:', True);
  CfgPage.Values[0] := '192.168.100.1';
  CfgPage.Values[1] := 'public';
  CfgPage.Values[2] := 'private';
  CfgPage.Values[3] := 'root';
  CfgPage.Values[4] := '';
end;

{ An existing config.json (upgrade / reinstall) is kept: do not ask again. }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = CfgPage.ID) and
            FileExists(AddBackslash(WizardDirValue()) + 'config.json');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = CfgPage.ID then
  begin
    if Trim(CfgPage.Values[0]) = '' then
    begin
      MsgBox('Enter the modem IP address.', mbError, MB_OK);
      Result := False;
    end
    else if Trim(CfgPage.Values[1]) = '' then
    begin
      MsgBox('Enter the SNMP read community.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function JsonStr(S: String): String;
begin
  StringChangeEx(S, '\', '\\', True);
  StringChangeEx(S, '"', '\"', True);
  Result := '"' + S + '"';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Path, WriteCommunity, Json: String;
begin
  if CurStep <> ssPostInstall then
    exit;
  Path := ExpandConstant('{app}\config.json');
  if FileExists(Path) then
    exit;
  WriteCommunity := Trim(CfgPage.Values[2]);
  if WriteCommunity = '' then
    WriteCommunity := Trim(CfgPage.Values[1]);
  Json :=
    '{' + #13#10 +
    '    "cm_ip": ' + JsonStr(Trim(CfgPage.Values[0])) + ',' + #13#10 +
    '    "snmp_community": ' + JsonStr(Trim(CfgPage.Values[1])) + ',' + #13#10 +
    '    "snmp_write_community": ' + JsonStr(WriteCommunity) + ',' + #13#10 +
    '    "snmp_version": "2c",' + #13#10 +
    '    "snmp_port": 161,' + #13#10 +
    '    "snmp_instance": 2,' + #13#10 +
    '    "ssh_username": ' + JsonStr(Trim(CfgPage.Values[3])) + ',' + #13#10 +
    '    "ssh_password": ' + JsonStr(CfgPage.Values[4]) + ',' + #13#10 +
    '    "ssh_port": 22' + #13#10 +
    '}' + #13#10;
  if not SaveStringToFile(Path, Json, False) then
    MsgBox('Could not write ' + Path + '. Create it by hand (see README.md).', mbError, MB_OK);
end;
