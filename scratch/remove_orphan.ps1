$src = "app/(tabs)/profile.tsx"
$all = Get-Content $src
$out = $all[0..1473] + $all[1665..($all.Length-1)]
$out | Set-Content $src -Encoding UTF8
Write-Host "Done. Lines: $($out.Length)"
