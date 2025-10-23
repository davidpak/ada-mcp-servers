# Google Workspace MCP Server
**Owner:** David Pak

A Model Context Protocol (MCP) server that provides AI assistants with access to Google Calendar and Gmail APIs. This server enables AI assistants like Ada to manage your calendar events and email seamlessly.

## Features

### 📅 Google Calendar Integration
- **List Calendars**: View all available calendars
- **List Events**: Retrieve events with filtering by date range, calendar, etc.
- **Create Events**: Schedule single events with automatic color coding
- **Create Recurring Events**: Schedule recurring events using RRULE patterns
- **Smart Color Coding**: Automatic event color suggestions based on content

### 📧 Gmail Integration
- **List Emails**: Retrieve emails with advanced filtering
- **Get Email Content**: Fetch full email content and metadata
- **Send Emails**: Compose and send emails with CC/BCC support
- **Search Emails**: Use Gmail's powerful search syntax
- **Email Summarization**: AI automatically summarizes email content

## Prerequisites

1. **Node.js** (v18.18 or higher)
2. **Google Cloud Project** with Calendar and Gmail APIs enabled
3. **OAuth2 Credentials** downloaded as `credentials.json`

## Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd google-cal-cli
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Google Cloud**:
   - Create a Google Cloud project
   - Enable Calendar API and Gmail API
   - Create OAuth2 credentials (Desktop application)
   - Download credentials as `credentials.json` in the project root

4. **Environment variables**:
   Create a `.env` file with:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

5. **Build the project**:
   ```bash
   npm run build
   ```

## Usage

### Start the MCP Server
```bash
npm run mcp
```

### Start the Chat Client
```bash
npm run chat
```

### Development Mode
```bash
npm run dev
```

## API Scopes

The server requests the following Google API scopes:
- `https://www.googleapis.com/auth/calendar` - Full calendar access
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail access
- `https://www.googleapis.com/auth/gmail.send` - Send Gmail access

## Available Tools

### Calendar Tools
- `list_calendars` - List available calendars
- `list_events` - List events with filtering
- `create_event` - Create single events
- `create_recurring_event` - Create recurring events

### Gmail Tools
- `list_emails` - List emails with filtering
- `get_email` - Retrieve email content
- `send_email` - Send emails
- `search_emails` - Search emails with Gmail syntax

## Color Coding

Events are automatically color-coded based on content:
- **Work/Professional**: Blue tones (9=Blueberry, 7=Peacock, 8=Graphite)
- **Social/Fun**: Pink/Red tones (4=Flamingo, 11=Tomato, 3=Grape)
- **Health/Wellness**: Green tones (10=Basil, 2=Sage)
- **Learning/Education**: Yellow/Orange tones (5=Banana, 6=Tangerine)
- **Travel**: 7=Peacock
- **Default**: 1=Lavender

## Gmail Search Syntax

Use Gmail's powerful search operators:
- `from:example@gmail.com` - Emails from specific sender
- `subject:meeting` - Emails with specific subject
- `is:unread` - Unread emails
- `has:attachment` - Emails with attachments
- `label:important` - Emails with specific labels

## Project Structure

```
├── src/
│   ├── google-mcp-server.ts    # Main MCP server
│   └── chat.ts                 # Chat client
├── dist/                       # Built JavaScript files
├── credentials.json            # Google OAuth credentials (not in repo)
├── token.json                  # OAuth tokens (not in repo)
├── .env                        # Environment variables (not in repo)
└── package.json               # Dependencies and scripts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Security Note

Never commit `credentials.json`, `token.json`, or `.env` files to version control. These files contain sensitive authentication information.