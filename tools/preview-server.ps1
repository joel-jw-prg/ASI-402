param(
    [int]$Port = 0,
    [string]$Root = ''
)
# Port: -Port argument, else the PORT environment variable, else 8123.
if ($Port -le 0) { if ($env:PORT) { $Port = [int]$env:PORT } else { $Port = 8123 } }
# Minimal static file server for previewing this site on Windows without Python or Node.
#
#   Right-click this file > "Run with PowerShell", or from a terminal in the site folder:
#       powershell -ExecutionPolicy Bypass -File tools\preview-server.ps1
#   then open http://localhost:8123/  (Ctrl+C stops the server)
#
# The site also works when index.html is opened directly; this server is only a convenience.
$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }
$Root = [System.IO.Path]::GetFullPath($Root)

$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
    '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
    '.ico' = 'image/x-icon'; '.pdf' = 'application/pdf'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port/  (Ctrl+C to stop)"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $res = $ctx.Response
        try {
            $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
            if ($rel -eq '') { $rel = 'index.html' }
            $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
            if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 403
            }
            elseif (Test-Path -LiteralPath $full -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($full)
                $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
                if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
                $res.Headers['Cache-Control'] = 'no-store'
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            else {
                $res.StatusCode = 404
            }
            Write-Host ("{0} {1} /{2}" -f $res.StatusCode, $ctx.Request.HttpMethod, $rel)
        }
        catch {
            Write-Host "error: $($_.Exception.Message)"
            try { $res.StatusCode = 500 } catch { }
        }
        finally {
            try { $res.Close() } catch { }
        }
    }
}
finally {
    $listener.Stop()
}
