TINNO LCM Dashboard
===================

What it is
  A web dashboard for installing and managing LCM container apps on a TINNO cable modem
  through the ACS (Oktopus). It runs on this PC only; nothing else needs to be installed.

Start
  Start menu > TINNO LCM Dashboard > "TINNO LCM Dashboard".
  A small window opens (keep it open) and the dashboard opens in your browser at
  http://localhost:18080/ . Close the small window to stop the dashboard.

Sign in
  Enter the serial number of the modem (for example ZT2607000024). Sign-in only works when
  the modem is connected to the ACS. If an access code was set up, enter it as well.

Try it without a modem
  Start menu > TINNO LCM Dashboard > "TINNO LCM Dashboard (demo)".
  Sign in with ZT2607000024. The catalogue and the modem are simulated; nothing is sent to
  a real device.

Pages
  Marketplace     browse services, install, update; progress of the running job
  Installed apps  the apps on the modem: update, stop, start, uninstall
  Jobs            history of every operation with full details (for debugging)

If something goes wrong
  - "This device is not connected to the ACS": the modem is offline or the serial is wrong.
  - The small window shows the reason for most errors; send a screenshot of it to the LCM team.
  - Settings (ACS account, GitLab) are in:  %LOCALAPPDATA%\Programs\TINNO LCM Dashboard\config.json
    (edit it with Notepad, then close and start the dashboard again)
    Job history is in:                       %LOCALAPPDATA%\TINNO LCM Dashboard\data\jobs.json
  - If port 18080 is reserved by Windows or used by another program, the dashboard picks the next free
    port by itself and opens the browser there; the small window shows the address.

Uninstall
  Windows Settings > Apps > TINNO LCM Dashboard > Uninstall.
