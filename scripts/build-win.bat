@echo off
REM MD Writer Windows NSIS build script (ASCII only, no code-block parentheses)
SET "SCRIPT_DIR=%~dp0"
SET "ROOT_DIR=%SCRIPT_DIR%.."
PUSHD "%ROOT_DIR%" >nul 2>&1
SET "TAURI_TARGET=x86_64-pc-windows-msvc"
SET "BUNDLE_DIR=src-tauri\target\%TAURI_TARGET%\release\bundle"
SET "VCVARS=C:/Program Files (x86)\Microsoft Visual Studio\2019\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
echo ============================================================
echo  MD Writer Windows build (NSIS)
echo  repo root : %CD%
echo  target    : %TAURI_TARGET%
echo ============================================================
echo.
where node >nul 2>&1
IF ERRORLEVEL 1 goto NODE_ERR
where cargo >nul 2>&1
IF ERRORLEVEL 1 goto CARGO_ERR
IF NOT EXIST "%VCVARS%" goto VCVARS_ERR
echo [1/4] dependency check passed
echo.
echo [2/4] loading VS2019 MSVC env
call "%VCVARS%" >nul 2>&1
IF ERRORLEVEL 1 goto VCVARS_FAIL
where link.exe >nul 2>&1
IF ERRORLEVEL 1 goto LINK_ERR
echo       MSVC env ready
echo.
echo [3/4] building... this may take several minutes
echo.
npx @tauri-apps/cli build --target %TAURI_TARGET%
IF ERRORLEVEL 1 goto BUILD_ERR
echo.
echo [4/4] build done, locating installer
echo.
IF EXIST "%BUNDLE_DIR%\nsis" goto LIST
echo [WARN] NSIS output not found: %BUNDLE_DIR%\nsis
goto DONE
:LIST
echo NSIS installer:
for %%f in ("%BUNDLE_DIR%\nsis\*setup*.exe") do echo   %%~ff (%%~zf bytes)
goto DONE
:NODE_ERR
echo [ERROR] Node.js not found. Install Node.js and add to PATH.
goto FAIL
:CARGO_ERR
echo [ERROR] Rust cargo not found. Install Rust.
goto FAIL
:VCVARS_ERR
echo [ERROR] VS2019 vcvars64.bat not found at %VCVARS%
echo         Install VS2019 Enterprise or edit VCVARS at top of script.
goto FAIL
:VCVARS_FAIL
echo [ERROR] vcvars64 load failed; cannot locate MSVC linker.
goto FAIL
:LINK_ERR
echo [ERROR] link.exe not on PATH after vcvars64.
goto FAIL
:BUILD_ERR
echo [ERROR] build failed. See log above.
goto FAIL
:FAIL
echo.
echo Build did NOT complete successfully.
POPD
pause
exit /b 1
:DONE
echo.
echo Done. Installer at: %CD%\%BUNDLE_DIR%\nsis\
POPD
exit /b 0
