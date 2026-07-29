$path = 'd:\stazene\zajic\project\src\screens\Orders.tsx'
$lines = Get-Content -LiteralPath $path -Encoding UTF8

function ReplaceBlock($lines, $startMarker, $endMarkerInclusive, $newLines) {
  $startIdx = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $startMarker) { $startIdx = $i; break }
  }
  if ($startIdx -lt 0) { return $null }
  $endIdx = -1
  for ($j = $startIdx; $j -lt $lines.Count; $j++) {
    if ($lines[$j] -match $endMarkerInclusive) { $endIdx = $j; break }
  }
  if ($endIdx -lt 0) { return $null }
  $result = @()
  if ($startIdx -gt 0) { $result += $lines[0..($startIdx-1)] }
  $result += $newLines
  if ($endIdx -lt $lines.Count - 1) { $result += $lines[($endIdx+1)..($lines.Count-1)] }
  return $result
}

$new1 = @(
'          <VoiceRecorder',
'            compact',
'            beerNames={beers.map((b) => b.name)}',
'            placeNames={places.map((p) => p.name)}',
'            onResult={(text) => {',
'              const parsedOrder = parseVoiceOrder(text, beers, packages, places);',
'              const parsed = parsedOrder.items;',
'              if (!parsed.length && !parsedOrder.placeName) { setErr(''Nerozpoznal jsem zadnou polozku z hlasu. Zkus to znovu, napr. "hospoda U Zajice 6x jantar 0.5".''); return; }',
'              if (parsedOrder.placeId) {',
'                setPlaceId(parsedOrder.placeId);',
'                setPlaceNameFree(parsedOrder.placeName ?? '''');',
'              } else if (parsedOrder.placeName) {',
'                setPlaceId('''');',
'                setPlaceNameFree(parsedOrder.placeName);',
'              }',
'              if (parsed.length) {',
'                setBeerRows((rs) => {',
'                  const next = [...rs];',
'                  let cursor = 0;',
'                  for (const p of parsed) {',
'                    while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;',
'                    if (cursor >= next.length) { next.push({ beerId: '''', pkgId: '''', qty: '''' }); }',
'                    next[cursor] = {',
'                      beerId: p.beer_id ?? '''',',
'                      pkgId: p.package_id ?? '''',',
'                      qty: p.quantity != null ? String(p.quantity) : '''',',
'                    };',
'                    cursor++;',
'                  }',
'                  return next;',
'                });',
'              }',
'              setErr(null);',
'            }}',
'          />'
)

$new2 = @(
'            <VoiceRecorder',
'              compact',
'              beerNames={beers.map((b) => b.name)}',
'              placeNames={places.map((p) => p.name)}',
'              onResult={(text) => {',
'                const parsedOrder = parseVoiceOrder(text, beers, packages, places);',
'                const parsed = parsedOrder.items;',
'                if (!parsed.length && !parsedOrder.placeName) { setErr(''Nerozpoznal jsem zadnou polozku z hlasu. Zkus to znovu, napr. "hospoda U Zajice 6x jantar 0.5".''); return; }',
'                if (parsedOrder.placeId) {',
'                  setPlaceId(parsedOrder.placeId);',
'                  setPlaceNameFree(parsedOrder.placeName ?? '''');',
'                } else if (parsedOrder.placeName) {',
'                  setPlaceId('''');',
'                  setPlaceNameFree(parsedOrder.placeName);',
'                }',
'                if (parsed.length) {',
'                  setBeerRows((rs) => {',
'                    const next = [...rs];',
'                    let cursor = 0;',
'                    for (const p of parsed) {',
'                      while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;',
'                      if (cursor >= next.length) { next.push({ beerId: '''', pkgId: '''', qty: '''' }); }',
'                      next[cursor] = {',
'                        beerId: p.beer_id ?? '''',',
'                        pkgId: p.package_id ?? '''',',
'                        qty: p.quantity != null ? String(p.quantity) : '''',',
'                      };',
'                      cursor++;',
'                    }',
'                    return next;',
'                  });',
'                }',
'                setErr(null);',
'              }}',
'            />'
)

# Block 1: first VoiceRecorder near top nav (line ~480), ends at closing "/>" before the photo button
$r1 = ReplaceBlock $lines '^\s*<VoiceRecorder\s*$' '^\s*/>\s*$' $new1
if ($null -eq $r1) {
  Write-Output "WARNING: block1 not found"
} else {
  $lines = $r1
  Write-Output "block1 replaced"
}

$r2 = ReplaceBlock $lines '^\s*<VoiceRecorder\s*$' '^\s*/>\s*$' $new2
if ($null -eq $r2) {
  Write-Output "WARNING: block2 not found"
} else {
  $lines = $r2
  Write-Output "block2 replaced"
}

Set-Content -LiteralPath $path -Value $lines -Encoding UTF8
Write-Output "Done."
