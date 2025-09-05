# PowerShell script to activate the virtual environment
Write-Host "Activating Python virtual environment..." -ForegroundColor Green
& ".\venv\Scripts\Activate.ps1"
Write-Host "Virtual environment activated!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run:" -ForegroundColor Yellow
Write-Host "  python run_chat.py     - Start the chat client" -ForegroundColor Cyan
Write-Host "  python run_server.py   - Start the MCP server" -ForegroundColor Cyan
Write-Host "  python example_usage.py - Run the example" -ForegroundColor Cyan
Write-Host ""
