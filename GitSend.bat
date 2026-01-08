@echo off
chcp 65001 >nul
echo ========================================
echo    Git Auto Update Script
echo ========================================
echo.

REM Configuracao (altere com os seus dados)
set REPO_PATH=C:\AntiGravity\Project1\server
set GIT_USER=pocasmen
set GIT_EMAIL=pb.malheiro@gmail.com
set BRANCH_NAME=Main

REM Navega para a pasta do repositorio
cd /d "%REPO_PATH%"
if errorlevel 1 (
    echo ERRO: Nao foi possivel aceder a pasta %REPO_PATH%
    pause
    exit /b 1
)

echo Pasta atual: %CD%
echo.

REM Configura o usuario Git (apenas primeira vez)
git config user.name "%GIT_USER%"
git config user.email "%GIT_EMAIL%"

echo ========================================
echo 1. Verificando branch atual...
echo ========================================
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
echo Branch atual: %CURRENT_BRANCH%

REM Muda para o branch Trae se nao estiver nele
if not "%CURRENT_BRANCH%"=="%BRANCH_NAME%" (
    echo.
    echo Mudando para branch %BRANCH_NAME%...
    git checkout %BRANCH_NAME% 2>nul
    if errorlevel 1 (
        echo Branch %BRANCH_NAME% nao existe. Criando...
        git checkout -b %BRANCH_NAME%
        if errorlevel 1 (
            echo ERRO: Falha ao criar branch
            pause
            exit /b 1
        )
    )
    echo [OK] Agora no branch %BRANCH_NAME%
)
echo.

echo ========================================
echo 2. Verificando estado atual...
echo ========================================
git status
echo.

echo ========================================
echo 3. Adicionando todas as alteracoes...
echo ========================================
git add .
if errorlevel 1 (
    echo ERRO: Falha ao adicionar ficheiros
    pause
    exit /b 1
)
echo Ficheiros adicionados com sucesso!
echo.

REM Verifica se ha algo para commit
git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo ========================================
    echo   Nenhuma alteracao para commit
    echo ========================================
    echo.
    echo Verificando se branch local esta sincronizado com remoto...
    
    REM Tenta fazer push mesmo sem alteracoes (caso o branch seja novo)
    git push -u origin %BRANCH_NAME%
    if errorlevel 1 (
        echo Tudo esta atualizado! Nada a fazer.
    ) else (
        echo [OK] Branch sincronizado com remoto!
    )
    echo.
    pause
    exit /b 0
)

echo ========================================
echo 4. Fazendo commit...
echo ========================================
set /p COMMIT_MSG="Digite a mensagem do commit ou Enter para default: "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update: automated commit

git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo ERRO: Falha ao fazer commit
    pause
    exit /b 1
)
echo Commit realizado com sucesso!
echo.

echo ========================================
echo 5. Enviando TUDO para branch %BRANCH_NAME%...
echo ========================================
git push -u origin %BRANCH_NAME%
if errorlevel 1 (
    echo.
    echo ERRO: Falha ao fazer push para branch %BRANCH_NAME%
    echo.
    echo Tentando forcar push (use com cuidado!)...
    set /p FORCE="Deseja forcar push? ^(sim/nao^): "
    if "!FORCE!"=="sim" (
        git push -u origin %BRANCH_NAME% --force
        if errorlevel 1 (
            echo ERRO: Push forcado tambem falhou
            pause
            exit /b 1
        )
        echo [OK] Push forcado realizado!
    ) else (
        echo Push cancelado
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo    SUCESSO! Codigo enviado para GitHub
echo ========================================
echo Branch: %BRANCH_NAME%
echo.
echo.

pause