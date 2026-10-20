# 공략집을 내 컴퓨터에서 http://localhost 주소로 열어주는 작은 서버입니다.
# (관리자 로그인은 file:// 로 연 화면보다 http:// 주소에서 가장 안정적으로 동작해요)
# 보통은 같은 폴더의 '미리보기.bat' 을 더블클릭해서 실행하세요.
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$Port = 5500,
  [switch]$Open
)
$ErrorActionPreference = 'Stop'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Port $Port is already in use. Close the other preview window first." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "  Preview: http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "  Close this window to stop the server."
Write-Host ""
if ($Open) { Start-Process "http://localhost:$Port/" }

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'
  '.gif' = 'image/gif'; '.avif' = 'image/avif'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'
}
$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel = $rel + 'index.html' }
    $path = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
    if ($path.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    Write-Host "$($ctx.Request.HttpMethod) /$rel $($res.StatusCode)"
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
