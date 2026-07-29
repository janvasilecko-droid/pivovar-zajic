$path = 'd:\stazene\zajic\project\src\screens\Orders.tsx'
$bytes = [System.IO.File]::ReadAllBytes($path)
# The file was corrupted by reading as UTF8 raw bytes and writing as UTF8 text,
# which for a file that was actually Windows-1250 (or similar) encoded produces
# mojibake. We attempt to detect and fix by re-decoding.
# Strategy: read current content as UTF8 (which is what's on disk now, broken),
# then re-encode those characters back to Windows-1250 bytes, then decode as UTF8.
# This reverses a "read as CP1250, saved as UTF8" mistake... but actually here
# the reverse happened: file was correct UTF8, PowerShell decoded as default
# (probably CP1250) then saved as UTF8, causing double-encoding.

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$cp1250 = [System.Text.Encoding]::GetEncoding(1250)
$utf8 = [System.Text.Encoding]::UTF8

# Re-encode: take the (wrongly interpreted) string, get its UTF8 bytes back,
# but wait - simpler: get bytes using CP1250 encoding of the current (broken) string,
# then decode those bytes as UTF8 to recover original.
$origBytes = $cp1250.GetBytes($content)
$fixed = $utf8.GetString($origBytes)

[System.IO.File]::WriteAllText($path, $fixed, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Done fixing mojibake"
