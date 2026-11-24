@echo off
setlocal
set "PROJECT_DIR=%~dp0"
set "JAVA_HOME=%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-17.0.21.10002-hotspot"
set "MAVEN_CMD=%USERPROFILE%\Downloads\apache-maven-3.10.2-bin\apache-maven-3.10.2\bin\mvn.cmd"
if not exist "%JAVA_HOME%\bin\javac.exe" (
  echo Java 17 JDK not found at "%JAVA_HOME%".
  pause
  exit /b 1
)
if not exist "%MAVEN_CMD%" (
  echo Maven not found at "%MAVEN_CMD%". Update build.bat to match your Maven folder.
  pause
  exit /b 1
)
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "%PROJECT_DIR%"
call "%MAVEN_CMD%" clean package
if errorlevel 1 pause
exit /b %ERRORLEVEL%
