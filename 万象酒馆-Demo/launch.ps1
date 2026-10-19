param([switch]$Stop, [switch]$NoBrowser, [ValidateRange(1024,65535)][int]$Port = 4180)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$baseUrl = "http://127.0.0.1:$Port"
$projectVersion = (Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw | ConvertFrom-Json).version
$gameUrl = "$baseUrl/?v=$projectVersion"

function Test-DemoServer {
    try {
        $package = Invoke-RestMethod -Uri "$baseUrl/package.json" -TimeoutSec 2
        return $package.name -eq 'wanxiang-tavern-demo'
    } catch { return $false }
}

try {
    if ($Stop) {
        if (-not (Test-DemoServer)) { Write-Host '游戏服务没有运行。'; exit 0 }
        $controlPath = Join-Path $projectDirectory ".runtime\control-$Port.json"
        if (-not (Test-Path -LiteralPath $controlPath)) { throw '当前服务由旧方式启动。请先关闭旧服务，再使用一键启动。' }
        $controlInfo = Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json
        $status = Invoke-RestMethod -Uri "$baseUrl/__demo/status" -TimeoutSec 2
        if ($status.name -ne 'wanxiang-tavern-demo' -or $status.pid -ne $controlInfo.pid) { throw '服务身份校验失败，未关闭其他程序。' }
        Invoke-RestMethod -Uri "$baseUrl/__demo/stop" -Method Post -Headers @{'X-Demo-Control' = $controlInfo.token} -TimeoutSec 3 | Out-Null
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 100
            if (-not (Test-DemoServer)) { Write-Host '游戏后台服务已关闭。'; exit 0 }
        }
        throw '服务尚未关闭，请稍后重试。'
    }
    if (-not (Test-DemoServer)) {
        $portClient = New-Object System.Net.Sockets.TcpClient
        $portOccupied = $false
        try {
            $connectResult = $portClient.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($connectResult.AsyncWaitHandle.WaitOne(1000)) { $portOccupied = $portClient.Connected }
        } finally { $portClient.Dispose() }
        if ($portOccupied) { throw "端口 $Port 已被其他程序占用，请关闭该程序后再启动。" }
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { $null }
        if (-not $nodeExecutable) {
            $candidates = @(
                "$env:ProgramFiles\nodejs\node.exe",
                "${env:ProgramFiles(x86)}\nodejs\node.exe",
                "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
                "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node.exe"
            )
            $nodeExecutable = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        }
        if (-not $nodeExecutable) { throw '找不到 Node.js。请安装 Node.js 后再次双击一键启动。' }
        $runtimeDirectory = Join-Path $projectDirectory '.runtime'
        New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
        $previousPort = $env:PORT
        try {
            $env:PORT = [string]$Port
            $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList 'server.cjs' -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory "server-$Port.log") -RedirectStandardError (Join-Path $runtimeDirectory "server-$Port.error.log")
        } finally { $env:PORT = $previousPort }
        Set-Content -LiteralPath (Join-Path $runtimeDirectory "server-$Port.pid") -Value $serverProcess.Id -Encoding ASCII
        $ready = $false
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            if (Test-DemoServer) { $ready = $true; break }
            $serverProcess.Refresh()
            if ($serverProcess.HasExited) { break }
            Start-Sleep -Milliseconds 150
        }
        if (-not $ready) { throw "服务启动失败，请查看 .runtime\server-$Port.error.log。" }
        Write-Host '游戏服务已启动。'
    } else { Write-Host '游戏已在运行，直接打开当前版本。' }
    if (-not $NoBrowser) { Start-Process -FilePath $gameUrl }
    Write-Host "游戏地址：$gameUrl"
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
