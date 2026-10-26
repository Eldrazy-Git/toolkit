@echo off
rem Installateur de Toolkit : double-clique sur ce fichier.
rem Le travail est fait par scripts\installer.ps1 (voir les explications dans ce fichier).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\installer.ps1" %*
echo.
pause
