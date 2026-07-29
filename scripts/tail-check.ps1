$c = Get-Content -Raw 'dist/index.html'
$idx = $c.IndexOf('new URL(')
Write-Output ("new URL( idx: " + $idx)
if ($idx -ge 0) { Write-Output $c.Substring([Math]::Max(0,$idx-200), 500) }
Write-Output "----"
$idx2 = $c.IndexOf('type="module"')
Write-Output ("type module idx: " + $idx2)
if ($idx2 -ge 0) { Write-Output $c.Substring([Math]::Max(0,$idx2-200), 500) }
