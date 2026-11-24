@echo off
setlocal
set "PROJECT_DIR=%~dp0"
set "JAVA_HOME=%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-17.0.21.10002-hotspot"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo Java 17 JDK not found at "%JAVA_HOME%".
  pause
  exit /b 1
)
if not exist "%PROJECT_DIR%target\smart-health-assistant-1.0.0.jar" (
  echo The app has not been built yet. Double-click build.bat first.
  pause
  exit /b 1
)
if exist "%PROJECT_DIR%.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%PROJECT_DIR%.env") do (
    set "%%A=%%B"
  )
)
cd /d "%PROJECT_DIR%"
"%JAVA_HOME%\bin\java.exe" -jar "%PROJECT_DIR%target\smart-health-assistant-1.0.0.jar"
pause
