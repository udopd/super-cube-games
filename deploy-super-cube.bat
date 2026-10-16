@echo off
setlocal EnableExtensions
chcp 65001 >nul
title SUPER CUBE - Deploy

rem Run this file from the root of the extracted super-cube-platform project.
pushd "%~dp0"

echo ==================================================
echo  SUPER CUBE Games Platform - deployment helper
echo ==================================================
echo.

if not exist "docker-compose.yml" if not exist "compose.yaml" if not exist "compose.yml" (
  echo [ERROR] Cannot find docker-compose.yml / compose.yaml.
  echo Put this .bat file in the project root, next to the Compose file.
  goto :fail
)

if not exist ".env" (
  echo [ERROR] .env is missing.
  echo Create .env from .env.example and fill required secrets first.
  goto :fail
)

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker CLI was not found. Install Docker Desktop and reopen PowerShell/cmd.
  goto :fail
)

echo [1/4] Checking Docker Engine...
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker Engine is unavailable.
  echo Start Docker Desktop, wait until it says Engine running, then run this file again.
  goto :fail
)

echo [2/4] Validating Compose configuration...
docker compose config --quiet
if errorlevel 1 (
  echo [ERROR] Compose configuration is invalid. Check .env and the output above.
  goto :fail
)

echo.
echo Choose deployment scope:
echo   1. Update Platform API only (recommended for UI/text/CSS/HTML changes)
echo   2. Rebuild and recreate all application services (platform, data-api, game-runtime)
echo      Do not choose this while a server game match must remain alive.
echo   0. Cancel
set "DEPLOY_CHOICE=1"
set /p "DEPLOY_CHOICE=Choice [1]: "
if "%DEPLOY_CHOICE%"=="" set "DEPLOY_CHOICE=1"

echo.
if "%DEPLOY_CHOICE%"=="0" (
  echo Deployment cancelled.
  goto :done
)

if "%DEPLOY_CHOICE%"=="1" (
  echo [3/4] Building and restarting platform...
  docker compose up -d --build --force-recreate platform
  if errorlevel 1 goto :deployfail
) else if "%DEPLOY_CHOICE%"=="2" (
  echo [3/4] Building and restarting application services...
  docker compose up -d --build --force-recreate data-api game-runtime platform
  if errorlevel 1 goto :deployfail
) else (
  echo [ERROR] Invalid choice: %DEPLOY_CHOICE%
  goto :fail
)

echo [4/4] Current service status:
docker compose ps

echo.
echo Recent Platform API logs:
docker compose logs --tail=60 platform

echo.
echo Deployment command completed.
echo Open http://localhost:3000/ and verify the updated feature.
echo Existing PostgreSQL volumes were not removed.
goto :done

:deployfail
echo.
echo [ERROR] Compose deployment failed. Recent logs:
docker compose logs --tail=100 platform data-api game-runtime
goto :fail

:fail
echo.
echo Deployment did not complete. Review the error above.
set "EXITCODE=1"
goto :finish

:done
set "EXITCODE=0"
:finish
popd
endlocal & exit /b %EXITCODE%
