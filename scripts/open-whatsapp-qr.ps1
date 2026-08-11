# Otevře živou QR stránku pro spárování WhatsApp bridgu.
# Stránka https://<sluzba>/qr se sama obnovuje každé 4 s, takže QR je VŽDY čerstvý
# (QR v logu Renderu platí jen ~20 s a nestihne se naskenovat — proto párování
# končilo hláškou „Zařízení se nepodařilo propojit s účtem“).
#
# Použití: powershell -ExecutionPolicy Bypass -File scripts\open-whatsapp-qr.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envTxt = Get-Content (Join-Path $root '.env') -Raw
$m = [regex]::Match($envTxt, '(?m)^RENDER_API_KEY=(.*)$')
$key = $m.Groups[1].Value.Trim()
if (-not $key) { Write-Error 'Chybí RENDER_API_KEY v root .env'; exit 1 }

$h = @{ Authorization = 'Bearer ' + $key }
$sid = 'srv-d9t2ov3ncjis73brhhe0'   # whatsapp-bridge
$svc = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$sid" -Headers $h
$url = ($svc.serviceDetails.url).TrimEnd('/')
if (-not $url) { Write-Error 'Nepodařilo se zjistit URL služby.'; exit 1 }

$qrUrl = "$url/qr"
Write-Host "Oteviram zivou QR stranku: $qrUrl"
Write-Host ''
Write-Host '1. Na telefonu otevri:  WhatsApp -> Nastaveni -> Propojena zarizeni -> Propojit zarizeni'
Write-Host '2. Na strance pockej, az se objevi QR (stranka se sama obnovuje = vzdy cerstvy).'
Write-Host '3. Naskenuj QR telefonem behem ~15 sekund po zobrazeni.'
Start-Process $qrUrl

