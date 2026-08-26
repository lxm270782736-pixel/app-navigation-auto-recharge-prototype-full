param(
    [int]$Port = 4178
)

$ErrorActionPreference = 'Stop'
$uiDirectory = Join-Path $PSScriptRoot 'ui'
$previewUrl = "http://127.0.0.1:$Port/settings?tab=recharge&auto=on"
$healthUrl = "http://127.0.0.1:$Port/"
$runtimeDirectory = Join-Path $PSScriptRoot '.preview-runtime'
$stdoutLog = Join-Path $runtimeDirectory "vite-$Port.out.log"
$stderrLog = Join-Path $runtimeDirectory "vite-$Port.err.log"

function Test-PreviewHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $uiDirectory)) {
    throw "UI directory not found: $uiDirectory"
}

if (-not (Test-PreviewHealth)) {
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

    $command = "`"$npm`" run dev:standalone -- --host 127.0.0.1 --port $Port"
    Start-Process `
        -FilePath $env:ComSpec `
        -ArgumentList @('/d', '/c', $command) `
        -WorkingDirectory $uiDirectory `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden | Out-Null

    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-PreviewHealth) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        throw "Preview failed to start. Check logs in $runtimeDirectory"
    }
}

Write-Output $previewUrl
