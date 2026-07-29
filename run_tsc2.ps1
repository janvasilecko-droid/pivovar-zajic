$ErrorActionPreference = 'Continue'
$out = & node_modules\.bin\tsc.CMD --noEmit -p tsconfig.json 2>&1 | Out-String
Set-Content -Path tscD.txt -Value $out -Encoding UTF8
Write-Output "LEN=$($out.Length)"
