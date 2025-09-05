@echo off
echo Setting up Google Calendar MCP Server environment...
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo Error: Failed to create virtual environment
        pause
        exit /b 1
    )
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Setup complete! 
echo.
echo To activate the environment in the future, run:
echo   activate_venv.bat
echo.
echo Or manually:
echo   venv\Scripts\activate.bat
echo.
echo Then you can run:
echo   python run_chat.py
echo.
pause
