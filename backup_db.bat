@echo off
setlocal enabledelayedexpansion

:: Extrair credenciais do .env (ajustado para o teu formato)
for /f "tokens=2 delims==" %%a in ('findstr /C:"DATABASE_URL=" .env') do set DB_URL=%%a

:: Gerar nome do ficheiro com data
set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=backup_full_%TIMESTAMP%.sql

echo Fazendo backup integral da base de dados...
:: Usamos o pg_dump com o caminho completo para garantir que funciona
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" "%DB_URL%" > %BACKUP_FILE%

if %ERRORLEVEL% EQU 0 (
    echo Backup concluido com sucesso: %BACKUP_FILE%
) else (
    echo Erro ao realizar backup. Verifica se o PostgreSQL 16 esta instalado e no PATH.
)
pause
