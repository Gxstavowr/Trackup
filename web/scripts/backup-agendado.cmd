@echo off
rem Backup semanal do Trackly (tarefa "Trackly - Backup semanal" no Agendador de Tarefas).
rem Roda `npm run backup` e acrescenta o resultado em %USERPROFILE%\TracklyBackups\backup.log.
if not exist "%USERPROFILE%\TracklyBackups" mkdir "%USERPROFILE%\TracklyBackups"
cd /d "%~dp0.."
echo ===== %date% %time% ===== >> "%USERPROFILE%\TracklyBackups\backup.log"
call npm run backup >> "%USERPROFILE%\TracklyBackups\backup.log" 2>&1
