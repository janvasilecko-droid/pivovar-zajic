$path = 'd:\stazene\zajic\project\src\screens\Orders.tsx'
$lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $path -Encoding UTF8)

# Find remaining old block (parseFreeTextEntries) start/end
$startIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*<VoiceRecorder\s*$') {
    # check if within next 5 lines there's parseFreeTextEntries
    $found = $false
    for ($k = $i; $k -lt [Math]::Min($i+8, $lines.Count); $k++) {
      if ($lines[$k] -match 'parseFreeTextEntries') { $found = $true; break }
    }
    if ($found) { $startIdx = $i; break }
  }
}
if ($startIdx -lt 0) {
  Write-Output "No old block found - nothing to do"
  exit 0
}
$endIdx = -1
for ($j = $startIdx; $j -lt $lines.Count; $j++) {
  if ($lines[$j] -match '^\s*/>\s*$') { $endIdx = $j; break }
}
if ($endIdx -lt 0) {
  Write-Output "ERROR: end not found"
  exit 1
}

$indent = '            '
$new2 = @(
"$indent<VoiceRecorder",
"$indent  compact",
"$indent  beerNames={beers.map((b) => b.name)}",
"$indent  placeNames={places.map((p) => p.name)}",
"$indent  onResult={(text) => {",
"$indent    const parsedOrder = parseVoiceOrder(text, beers, packages, places);",
"$indent    const parsed = parsedOrder.items;",
"$indent    if (!parsed.length && !parsedOrder.placeName) { setErr('Nerozpoznal jsem zadnou polozku z hlasu. Zkus to znovu, napr. `"hospoda U Zajice 6x jantar 0.5`".'); return; }",
"$indent    if (parsedOrder.placeId) {",
"$indent      setPlaceId(parsedOrder.placeId);",
"$indent      setPlaceNameFree(parsedOrder.placeName ?? '');",
"$indent    } else if (parsedOrder.placeName) {",
"$indent      setPlaceId('');",
"$indent      setPlaceNameFree(parsedOrder.placeName);",
"$indent    }",
"$indent    if (parsed.length) {",
"$indent      setBeerRows((rs) => {",
"$indent        const next = [...rs];",
"$indent        let cursor = 0;",
"$indent        for (const p of parsed) {",
"$indent          while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;",
"$indent          if (cursor >= next.length) { next.push({ beerId: '', pkgId: '', qty: '' }); }",
"$indent          next[cursor] = {",
"$indent            beerId: p.beer_id ?? '',",
"$indent            pkgId: p.package_id ?? '',",
"$indent            qty: p.quantity != null ? String(p.quantity) : '',",
"$indent          };",
"$indent          cursor++;",
"$indent        }",
"$indent        return next;",
"$indent      });",
"$indent    }",
"$indent    setErr(null);",
"$indent  }}",
"$indent/>"
)

$result = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $startIdx; $i++) { $result.Add($lines[$i]) }
foreach ($nl in $new2) { $result.Add($nl) }
for ($i = $endIdx+1; $i -lt $lines.Count; $i++) { $result.Add($lines[$i]) }

Set-Content -LiteralPath $path -Value $result -Encoding UTF8
Write-Output "Replaced remaining old block ($startIdx to $endIdx)"
