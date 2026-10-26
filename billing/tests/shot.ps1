# usage: powershell -File tests\shot.ps1 -Name po-list -Hash '#/pos' [-Do 'js'] [-Scn default] [-W 1600] [-H 1000]
param([string]$Name, [string]$Hash = '#/pos', [string]$Do = '', [string]$Scn = 'default', [int]$W = 1600, [int]$H = 1000)
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $env:TEMP "dice-shots"; New-Item -ItemType Directory -Force $out | Out-Null
$file = (Join-Path $here 'shot.html') -replace '\\', '/'
$q = "scn=$Scn"; if ($Do) { $q += '&do=' + [uri]::EscapeDataString($Do) }
$url = "file:///$file`?$q$Hash"
$png = Join-Path $out "$Name.png"
$prof = Join-Path $env:TEMP 'dice-shot-profile'
& $chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir=$prof --allow-file-access-from-files --window-size=$W,$H --virtual-time-budget=4000 --screenshot=$png $url 2>$null | Out-Null
Write-Output $png
