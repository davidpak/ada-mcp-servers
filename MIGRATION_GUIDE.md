# Migration Guide: TypeScript to Python

This guide documents the migration from the TypeScript/Node.js implementation to the new Python implementation of the Google Calendar MCP Server.

## What Changed

### Removed Files
- `src/gcal-mcp-server.ts` → `gcal_mcp_server.py`
- `src/chat.ts` → `chat_client.py`
- `package.json` → `requirements.txt` + `setup.py`
- `tsconfig.json` → (no longer needed)
- `node_modules/` → (replaced with Python virtual environment)
- `dist/` → (Python doesn't need compilation)

### New Files
- `gcal_mcp_server.py` - Main MCP server implementation
- `chat_client.py` - Interactive chat client
- `requirements.txt` - Python dependencies
- `setup.py` - Package setup and installation
- `run_server.py` - Simple server runner script
- `run_chat.py` - Simple chat client runner script
- `example_usage.py` - Example usage demonstration
- `README.md` - Comprehensive documentation
- `MIGRATION_GUIDE.md` - This file

## Key Improvements

### 1. Better Error Handling
- More robust authentication flow
- Better error messages and logging
- Graceful handling of API failures

### 2. Enhanced Features
- Added `delete_event` tool
- Better event listing with more options
- Improved input validation with Pydantic
- More comprehensive tool schemas

### 3. Simplified Setup
- No TypeScript compilation needed
- Direct Python execution
- Better dependency management
- Clearer documentation

### 4. Better User Experience
- More intuitive chat interface
- Better error messages
- Example usage script
- Comprehensive README

## Migration Steps

### 1. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 2. Set Up Environment Variables
Create a `.env` file with your OpenAI API key:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Keep Your Existing Files
- `credentials.json` - Your Google OAuth2 credentials (keep as-is)
- `token.json` - Your authentication token (will be reused)

### 4. Test the New Implementation
```bash
# Test the server
python run_server.py

# Test the chat client
python run_chat.py

# Run the example
python example_usage.py
```

## API Compatibility

The new Python implementation maintains the same MCP tool interface:

- `list_calendars` - Same functionality
- `list_events` - Enhanced with more options
- `create_event` - Same core functionality, better validation
- `delete_event` - New feature

## Benefits of the Migration

1. **Simpler Development**: No TypeScript compilation, direct Python execution
2. **Better Error Handling**: More robust error handling and user feedback
3. **Enhanced Features**: Additional tools and better validation
4. **Improved Documentation**: Comprehensive README and examples
5. **Easier Maintenance**: Python is more straightforward for this type of integration

## Troubleshooting

### Common Issues

1. **Import Errors**: Make sure all dependencies are installed with `pip install -r requirements.txt`
2. **Authentication Issues**: Your existing `token.json` should work, but you may need to re-authenticate
3. **API Errors**: Check that your Google Cloud project has the Calendar API enabled

### Getting Help

- Check the main `README.md` for detailed setup instructions
- Run `python example_usage.py` to test basic functionality
- Check the logs for detailed error messages

## Next Steps

1. Test the new implementation thoroughly
2. Update any external integrations to use the new Python server
3. Consider adding more features like event updates, recurring events, etc.
4. Set up automated testing if needed

The migration is complete! Your Google Calendar MCP Server is now running on Python with enhanced features and better maintainability.
