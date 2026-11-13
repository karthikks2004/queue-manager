@echo off
title QueueFlow
set ROOT=%~dp0
if exist "%ROOT%frontend\node_modules\.bin\vite.cmd" goto skipfe
if exist "%ROOT%frontend\node_modules" rmdir /s /q "%ROOT%frontend\node_modules"
echo Installing frontend...
pushd "%ROOT%frontend"
call npm install
popd
:skipfe
if exist "%ROOT%backend\node_modules\.bin" goto skipbe
if exist "%ROOT%backend\node_modules" rmdir /s /q "%ROOT%backend\node_modules"
echo Installing backend...
pushd "%ROOT%backend"
call npm install
popd
:skipbe
echo Building frontend...
pushd "%ROOT%frontend"
call npx vite build
popd
start "" http://localhost:5000
echo Running at http://localhost:5000 - keep this window open
pushd "%ROOT%backend"
node server.js
pause
