$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$jdk = Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium\jdk-17.0.21.10002-hotspot'
$maven = Join-Path $env:USERPROFILE 'Downloads\apache-maven-3.10.2-bin\apache-maven-3.10.2\bin\mvn.cmd'
if (-not (Test-Path (Join-Path $jdk 'bin\javac.exe'))) { throw "Java 17 JDK was not found at $jdk. Install a Java 17 JDK first." }
if (-not (Test-Path $maven)) { throw "Maven was not found at $maven. Update build.ps1 to your extracted Maven location." }
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"
Set-Location $projectRoot
& $maven clean package
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
