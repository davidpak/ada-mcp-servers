#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Command } from "commander";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import * as readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.join(__dirname, "google-mcp-server.js");

// ---- OpenAI tools spec (unchanged) -----------------------------------------
const tools = [
  {
    type: "function",
    function: {
      name: "list_calendars",
      description: "List calendars for the authorized user",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description: "List events from a calendar with optional filtering",
      parameters: {
        type: "object",
        properties: {
          calendarId: { type: "string" },
          maxResults: { type: "number", description: "Maximum number of events to return (default: 10)" },
          timeMin: { type: "string", description: "Lower bound for event start times (ISO 8601 datetime)" },
          timeMax: { type: "string", description: "Upper bound for event start times (ISO 8601 datetime)" },
          singleEvents: { type: "boolean", description: "Whether to expand recurring events into instances (default: true)" },
          orderBy: { type: "string", enum: ["startTime", "updated"], description: "Order of the events returned (default: startTime)" },
        },
        required: ["calendarId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Create a Google Calendar event with ISO datetimes and automatic color coding",
      parameters: {
        type: "object",
        properties: {
          calendarId: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          start: { type: "string", description: "ISO 8601 datetime" },
          end:   { type: "string", description: "ISO 8601 datetime" },
          timeZone: { type: "string", default: "America/Los_Angeles" },
          colorId: { type: "string", description: "Optional color ID (1-11). If not provided, will auto-suggest based on event content" },
        },
        required: ["calendarId", "summary", "start", "end", "timeZone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_recurring_event",
      description: "Create a recurring Google Calendar event with RRULE pattern and automatic color coding",
      parameters: {
        type: "object",
        properties: {
          calendarId: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          start: { type: "string", description: "ISO 8601 datetime" },
          end:   { type: "string", description: "ISO 8601 datetime" },
          timeZone: { type: "string", default: "America/Los_Angeles" },
          recurrence: { type: "string", description: "RRULE string without 'RRULE:' prefix (e.g., 'FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE,TH,FR' for weekdays)" },
          colorId: { type: "string", description: "Optional color ID (1-11). If not provided, will auto-suggest based on event content" },
        },
        required: ["calendarId", "summary", "start", "end", "timeZone", "recurrence"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_emails",
      description: "List emails from Gmail with optional filtering",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", default: "me", description: "User's email address or 'me' for authenticated user" },
          maxResults: { type: "number", description: "Maximum number of emails to return (default: 10)" },
          q: { type: "string", description: "Gmail search query (e.g., 'from:example@gmail.com', 'subject:meeting', 'is:unread')" },
          labelIds: { type: "array", items: { type: "string" }, description: "Only return emails with these label IDs" },
          includeSpamTrash: { type: "boolean", description: "Include emails from spam and trash (default: false)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_email",
      description: "Retrieve a specific email by ID with full content",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", default: "me", description: "User's email address or 'me' for authenticated user" },
          id: { type: "string", description: "Email message ID" },
          format: { type: "string", enum: ["full", "metadata", "minimal", "raw"], description: "Format of the email content (default: full)" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Compose and send an email",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", default: "me", description: "User's email address or 'me' for authenticated user" },
          to: { type: "array", items: { type: "string" }, description: "Recipient email addresses" },
          cc: { type: "array", items: { type: "string" }, description: "CC email addresses" },
          bcc: { type: "array", items: { type: "string" }, description: "BCC email addresses" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body content (plain text)" },
          isHtml: { type: "boolean", description: "Whether the body content is HTML (default: false)" },
        },
        required: ["to", "subject", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search emails using Gmail search syntax",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", default: "me", description: "User's email address or 'me' for authenticated user" },
          query: { type: "string", description: "Gmail search query (e.g., 'from:example@gmail.com', 'subject:meeting', 'is:unread')" },
          maxResults: { type: "number", description: "Maximum number of emails to return (default: 10)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
] as const satisfies OpenAI.Chat.Completions.ChatCompletionTool[];

// ---- OpenAI client/model ----------------------------------------------------
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- MCP wiring: use the ONE-ARG constructor -------------------------------
async function connectMcpServer(): Promise<{ client: Client }> {
  console.log("🔗 Connecting to MCP server...");
  console.log("📁 Server path:", SERVER_PATH);
  console.log("📁 Working directory:", path.resolve(__dirname, ".."));
  
  const transport = new StdioClientTransport({
    // Use the current Node executable
    command: process.execPath,
    // Point to your built MCP server entry
    args: [SERVER_PATH],
    // Show server stderr in your terminal (or set to "pipe" to capture)
    stderr: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  // Connect the MCP client over this transport
  const client = new Client({ name: "ada-chat", version: "0.1.0" });
  await client.connect(transport);
  console.log("✅ MCP client connected successfully");

  return { client };
}

// ---- Chat loop --------------------------------------------------------------
async function chatLoop() {
  const { client } = await connectMcpServer();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Get current date and time in America/Los_Angeles timezone
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { 
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTime = now.toLocaleTimeString('en-US', { 
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        `You are a helpful scheduling assistant named Ada. The current date and time is: ${currentDate} at ${currentTime} (America/Los_Angeles timezone). Default to America/Los_Angeles unless the user specifies otherwise. On bootup, inform the user of your capabilities and the current date/time. Always use the current date/time provided above when scheduling events or answering date-related questions.

YOUR CAPABILITIES:
- List available calendars
- List events from any calendar (with optional filtering by date range, max results, etc.)
- Create single events with automatic color coding
- Create recurring events with RRULE patterns and automatic color coding
- List emails from Gmail with optional filtering
- Retrieve specific email content by ID
- Send emails with support for CC, BCC, and HTML content
- Search emails using Gmail's powerful search syntax

IMPORTANT: You have automatic color coding capabilities! When creating events, the system will automatically suggest appropriate colors based on the event content:
- Work/Professional events: Blue tones (9=Blueberry, 7=Peacock, 8=Graphite)
- Social/Fun events: Pink/Red tones (4=Flamingo, 11=Tomato, 3=Grape)  
- Health/Wellness: Green tones (10=Basil, 2=Sage)
- Learning/Education: Yellow/Orange tones (5=Banana, 6=Tangerine)
- Travel: 7=Peacock
- Default: 1=Lavender

Color ID Reference: 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana, 6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato

You can also manually specify a colorId (1-11) if the user requests a specific color, but be careful to use the correct ID for the color you want.

GMAIL CAPABILITIES:
- Use Gmail search syntax for powerful email filtering (e.g., 'from:example@gmail.com', 'subject:meeting', 'is:unread', 'has:attachment')
- When listing emails, you can filter by labels, search queries, and other criteria
- For sending emails, you can include CC, BCC recipients and choose between plain text or HTML content
- IMPORTANT: When users ask for emails, automatically fetch and summarize the email content using get_email. Don't just show email IDs - provide meaningful summaries of the actual email content including sender, subject, date, and key message points`,
    },
  ];

  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  try {
    while (true) {
      const user = await ask("> ");
      if (!user.trim() || user.trim().toLowerCase() === "exit") break;

      history.push({ role: "user", content: user });

      const resp = await openai.chat.completions.create({
        model: MODEL,
        messages: history,
        tools,
      });

      const msg = resp.choices[0]?.message;
      if (!msg) {
        console.log("No response from OpenAI");
        continue;
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        console.log("🔧 Tool calls detected:", msg.tool_calls.length);
        const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        for (const tc of msg.tool_calls) {
          if (tc.type !== "function") continue; // narrow before accessing .function
          const name = tc.function.name;
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          
          console.log(`🔧 Calling tool: ${name} with args:`, args);

          const result = await client.callTool({ name, arguments: args });
          console.log(`✅ Tool result:`, result);

          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result, null, 2), // tool role expects string content
          });
        }

        history.push(msg, ...toolResults);

        const final = await openai.chat.completions.create({
          model: MODEL,
          messages: history,
        });

        const text = final.choices[0]?.message?.content || "(no content)";
        console.log(text);
        history.push({ role: "assistant", content: text });
      } else {
        const text = msg.content || "(no content)";
        console.log(text);
        history.push({ role: "assistant", content: text });
      }
    }
  } finally {
    rl.close();
    // Transport exposes close() via client.disconnect() in some SDKs;
    // Here, just let the spawned process die with the parent.
  }
}

// ---- CLI entry --------------------------------------------------------------
const program = new Command();
program.command("chat").description("Start the Jarvis chat").action(chatLoop);
program.parse(process.argv);
