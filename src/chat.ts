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
const GOOGLE_SERVER_PATH = path.join(__dirname, "google-mcp-server.js");
const ORDERING_SERVER_PATH = path.join(__dirname, "ordering-mcp-server.js");

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
  // ---- Ordering MCP Server Tools --------------------------------------------
  {
    type: "function",
    function: {
      name: "order_food_item",
      description: "Add a food item to your order from the restaurant menu",
      parameters: {
        type: "object",
        properties: {
          itemName: { type: "string", description: "Name of the food item to order (e.g., 'bacon sandwich', 'coffee')" },
          quantity: { type: "number", description: "Quantity to order (default: 1)" },
          customizations: { type: "object", description: "Item customizations (e.g., {'size': 'large', 'milk': 'oat'})" }
        },
        required: ["itemName"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_menu",
      description: "Browse the restaurant menu to see available items",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category (e.g., 'breakfast', 'lunch', 'beverages')" },
          search: { type: "string", description: "Search for specific items" }
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description: "View current items in your cart",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_cart",
      description: "Remove all items from your cart",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "checkout",
      description: "Complete your order and proceed to payment",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
] as const satisfies OpenAI.Chat.Completions.ChatCompletionTool[];

// ---- OpenAI client/model ----------------------------------------------------
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- MCP wiring: connect to both servers -------------------------------
async function connectMcpServers(): Promise<{ googleClient: Client; orderingClient: Client }> {
  console.log("🔗 Connecting to MCP servers...");
  
  // Connect to Google MCP server
  console.log("📁 Google server path:", GOOGLE_SERVER_PATH);
  const googleTransport = new StdioClientTransport({
    command: process.execPath,
    args: [GOOGLE_SERVER_PATH],
    stderr: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  const googleClient = new Client({ name: "ada-chat-google", version: "0.1.0" });
  await googleClient.connect(googleTransport);
  console.log("✅ Google MCP client connected successfully");

  // Connect to Ordering MCP server
  console.log("📁 Ordering server path:", ORDERING_SERVER_PATH);
  const orderingTransport = new StdioClientTransport({
    command: process.execPath,
    args: [ORDERING_SERVER_PATH],
    stderr: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  const orderingClient = new Client({ name: "ada-chat-ordering", version: "0.1.0" });
  await orderingClient.connect(orderingTransport);
  console.log("✅ Ordering MCP client connected successfully");

  return { googleClient, orderingClient };
}

// ---- Chat loop --------------------------------------------------------------
async function chatLoop() {
  const { googleClient, orderingClient } = await connectMcpServers();
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
        `You are a helpful assistant named Ada that can help with both Google Calendar/Gmail tasks and restaurant ordering. The current date and time is: ${currentDate} at ${currentTime} (America/Los_Angeles timezone). Default to America/Los_Angeles unless the user specifies otherwise. On bootup, inform the user of your capabilities and the current date/time. Always use the current date/time provided above when scheduling events or answering date-related questions.

Your capabilities include:
- Google Calendar: Create events, list events, manage calendars
- Gmail: Send emails, search emails, read emails  
- Restaurant Ordering: Browse menu, order food items, manage cart, checkout

Always use the current date/time provided above when scheduling events or answering date-related questions.

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

          // Route tool calls to the appropriate MCP server
          const isOrderingTool = ['order_food_item', 'browse_menu', 'get_cart', 'clear_cart', 'checkout'].includes(name);
          const client = isOrderingTool ? orderingClient : googleClient;
          
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
