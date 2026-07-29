$out = npx tsc --noEmit -p tsconfig.json 2>&1 | Out-String
Set-Content -Path tsc5.txt -Value $out -Encoding UTF8
