# usage: powershell -File tests\run-browser.ps1 smoke.html   (or flow.html)
# Opens the page in headless Chrome (falls back to Edge) and prints the contents of <pre id="out">.
param([string]$Page = 'smoke.html')
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = 'file:///' + ((Join-Path $here $Page) -replace '\\', '/')
$t = $env:TEMP; $id = [guid]::NewGuid().ToString('N'); $dom = "$t\dice-dom-$id.txt"
Start-Process -FilePath $chrome -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=$t\dice-test-$id", '--allow-file-access-from-files', '--virtual-time-budget=30000', '--dump-dom', $url) -RedirectStandardOutput $dom -RedirectStandardError "$dom.err" -Wait -NoNewWindow | Out-Null
$text = Get-Content $dom -Raw -Encoding UTF8
$m = [regex]::Match($text, '<pre id="out">(.*?)</pre>', 'Singleline')
if ($m.Success) { [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value) } else { "NO OUTPUT"; if ($text) { $text.Substring(0, [Math]::Min(1500, $text.Length)) } }
Remove-Item -Recurse -Force "$t\dice-test-$id", $dom, "$dom.err" -ErrorAction SilentlyContinue
