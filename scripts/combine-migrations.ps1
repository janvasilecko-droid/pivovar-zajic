$files = Get-ChildItem 'supabase/migrations/*.sql' | Sort-Object Name
$out = New-Object System.Text.StringBuilder
foreach ($f in $files) {
  [void]$out.AppendLine("-- ==== $($f.Name) ====")
  [void]$out.AppendLine((Get-Content $f.FullName -Raw))
  [void]$out.AppendLine()
}
Set-Content -Path 'supabase/ALL_MIGRATIONS.sql' -Value $out.ToString() -Encoding UTF8
 