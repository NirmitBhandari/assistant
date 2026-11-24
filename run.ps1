$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$jdk = Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium\jdk-17.0.21.10002-hotspot'
$jar = Join-Path $projectRoot 'target\smart-health-assistant-1.0.0.jar'
if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) { throw "Java 17 JDK was not found at $jdk. Install a Java 17 JDK first." }
if (-not (Test-Path $jar)) { throw 'The app has not been built yet. Run .\build.ps1 first.' }
$client = [Net.Sockets.TcpClient]::new()
try {
    $pending = $client.BeginConnect('127.0.0.1', 7070, $null, $null)
    if ($pending.AsyncWaitHandle.WaitOne(500) -and $client.Connected) {
        Write-Host 'Smart Health Assistant is already running at http://localhost:7070. Use the open site instead of starting a second copy.'
        exit 0
    }
} finally { $client.Dispose() }
Set-Location $projectRoot
& (Join-Path $jdk 'bin\java.exe') -jar $jar
