@echo off
set /p FILE_NAME="Escreve o nome do ficheiro de backup (ex: backup_full_XXX.sql): "

if not exist %FILE_NAME% (
    echo Ficheiro %FILE_NAME% nao encontrado!
    pause
    exit /b
)

for /f "tokens=2 delims==" %%a in ('findstr /C:"DATABASE_URL=" .env') do set DB_URL=%%a

echo A restaurar base de dados a partir de %FILE_NAME%...
echo Esta operacao pode falhar se existirem conflitos de chaves. O ideal e uma base de dados limpa.

"C:\Program Files\PostgreSQL\17\bin\psql.exe" "%DB_URL%" < %FILE_NAME%

if %ERRORLEVEL% EQU 0 (
    echo Restauro concluido!
) else (
    echo Ocorreram erros durante o restauro.
)
pause
