# Phase 3 — test on the real modem

Backend running on the operator PC (README §3), modem online in Oktopus, usp-pa v9 + cthulhu fix on the
modem, `oktopus-lcm-results.lua` active in Oktopus. Commands are PowerShell (`curl.exe`, not the `curl` alias).
Watch the modem in a second window: `journalctl -u usp-pa -f | grep "LCM:"` and `lxc-ls -f`.

```powershell
$api = "http://localhost:8080/api/v1"
$sn  = "ZT2607000024"
$svc = "tinno-lcm/tinno-ai-service"
function job($op, $ver) {
  $b = @{ op = $op; service = $svc }; if ($ver) { $b.version = $ver }
  $j = Invoke-RestMethod -Method Post -Uri "$api/devices/$sn/jobs" -ContentType "application/json" -Body ($b | ConvertTo-Json)
  "job $($j.id) $op -> $($j.state)"
  do { Start-Sleep 5; $j = Invoke-RestMethod "$api/jobs/$($j.id)"; "  $($j.state) $($j.message)" } while ($j.state -in "queued","sent","running")
  $j | Select-Object op, state, version, fromVersion, faultCode, message, duPath, euPath | Format-List
}
```

| # | Step | Command | Expected |
|---|------|---------|----------|
| 1 | Backend sees Oktopus | `Invoke-RestMethod "$api/health"` | `oktopus: configured`, catalogue has services |
| 2 | Device list | `Invoke-RestMethod "$api/devices?online=true"` | ZT2607000024, online |
| 3 | Installed apps (empty) | `Invoke-RestMethod "$api/devices/$sn/apps"` | `[]` (uninstall leftovers from Phase 2 first) |
| 4 | Install | `job install v25.0.0` | `succeeded`, message `Installed v25.0.0`; modem `RUNNING` |
| 5 | Apps | `Invoke-RestMethod "$api/devices/$sn/apps"` | v25.0.0, euStatus Active, managed true, updateAvailable true |
| 6 | Rules | `job install v25.0.1` | HTTP 409 ALREADY_INSTALLED (no job created) |
| 7 | Update | `job update v25.0.1` | `succeeded`, fromVersion v25.0.0; modem log "Active again after update" |
| 8 | Stop | `job stop` | `succeeded` Idle; modem container STOPPED |
| 9 | Start | `job start` | `succeeded` Active; modem RUNNING |
| 10 | Uninstall | `job uninstall` | `succeeded`; `lxc-ls` no container; apps `[]` |
| 11 | Restart safety | start `job install v25.0.0`, stop the backend (Ctrl+C) while `running`, start it again | log "resumed 1 active job(s)", job ends `succeeded` |
| 12 | Offline device | `Invoke-RestMethod -Method Post "$api/devices/<an offline SN>/jobs" ...` | HTTP 409 DEVICE_OFFLINE |
| 13 | Job history | `Invoke-RestMethod "$api/jobs?device=$sn"` | all jobs above with states |

Bad image is not reachable through the backend on purpose (versions must exist in the catalogue); the
failure path is covered by the tests and by Phase 2 step 13.

Send back: the output of steps 4, 7, 10 and 11, and anything that did not match.
