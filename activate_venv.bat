@echo off
echo Activating Python virtual environment...
call venv\Scripts\activate.bat
echo Virtual environment activated!
echo.
echo You can now run:
echo   python run_chat.py     - Start the chat client
echo   python run_server.py   - Start the MCP server
echo   python example_usage.py - Run the example
echo.
cmd /k
