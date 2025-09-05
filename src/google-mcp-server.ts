import { authenticate } from "@google-cloud/local-auth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config";
import fs from "fs/promises";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { fileURLToPath } from "node:url";
import path from "path";
import { z } from "zod";


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CREDENTIALS_PATH = path.join(ROOT, "credentials.json");
const TOKEN_PATH       = path.join(ROOT, "token.json");
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send"
];

type AuthorizedUserToken = {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

const server = new McpServer({ name: "gcal-mcp", version: "0.1.0" });

// ... your existing constants: CREDENTIALS_PATH, TOKEN_PATH, SCOPES, etc.

type InstalledOrWeb = {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
};

type GoogleOAuthClientCredentials = {
  installed?: InstalledOrWeb;
  web?: InstalledOrWeb;
};
// Load token.json and build OAuth2Client using google.auth.fromJSON
async function loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
  try {
    console.log("📁 Checking for saved credentials at:", TOKEN_PATH);
    const content = await fs.readFile(TOKEN_PATH, "utf-8");
    const credentials = JSON.parse(content);
    
    console.log("✅ Creating OAuth2Client from saved credentials");
    return google.auth.fromJSON(credentials) as unknown as OAuth2Client;
  } catch (error) {
    console.log("❌ Error loading saved credentials:", error);
    return null;
  }
}

async function saveCredentials(client: OAuth2Client): Promise<void> {
  const raw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const keys = JSON.parse(raw) as GoogleOAuthClientCredentials;
  const key = keys.installed ?? keys.web;

  if (!key?.client_id || !key?.client_secret) {
    throw new Error("credentials.json missing client_id/client_secret (expected OAuth client credentials).");
  }

  const payload: AuthorizedUserToken = {
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    // refresh_token is present after the first consent
    refresh_token: client.credentials.refresh_token as string,
  };

  await fs.writeFile(TOKEN_PATH, JSON.stringify(payload, null, 2), "utf-8");
}

/** Get an authenticated OAuth2 client for Google Calendar. */
export async function getAuth(): Promise<OAuth2Client> {
  try {
    console.log("🔐 Starting authentication...");
    
    // 1) Try existing token
    const saved = await loadSavedCredentialsIfExist();
    if (saved) {
      console.log("✅ Using saved credentials");
      return saved;
    }

    console.log("🔄 No saved credentials, starting OAuth flow...");
    
    // 2) Run local OAuth flow (opens browser on first run)
    const client = (await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    })) as OAuth2Client;

    console.log("✅ OAuth flow completed");

    // 3) Persist refresh token for next runs
    if (client.credentials?.refresh_token) {
      await saveCredentials(client);
      console.log("✅ Credentials saved");
    }

    return client;
  } catch (error) {
    console.log("❌ Authentication error:", error);
    throw new Error(`Authentication failed: ${error}`);
  }
}


server.registerTool(
    "list_calendars",
    {
        title: "List calendars",
        description: "List calendars for the authorized user",
        inputSchema: {},
    },
    async (_args, _extra) => {
        try {
            console.log("🔍 Starting list_calendars tool...");
            const auth = await getAuth();
            console.log("✅ Authentication successful");
            const calendar = google.calendar({version: "v3", auth: auth as any});
            const { data } = await calendar.calendarList.list();
            console.log("✅ Calendar list retrieved");
            const calendars = (data.items ?? []).map(i => ({ id: i.id!, summary: i.summary! }));
            return {
                content: [
                    { type: "text", text: JSON.stringify({ calendars }, null, 2) }
                ],
            };
        } catch (err: any) {
            console.log("❌ Google API error: ", err?.response?.status, err?.response.data || err?.message);
            return {
                content: [
                    { type: "text", text: `Error: ${err?.message || err}` }
                ],
            };
        }
    }
);

const CreateEvent = z.object({
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  start: z.string().describe("ISO 8601 datetime"),
  end: z.string().describe("ISO 8601 datetime"),
  timeZone: z.string().default("America/Los_Angeles"),
  colorId: z.string().optional().describe("Color ID (1-11) for event color coding"),
});

const CreateRecurringEvent = z.object({
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  start: z.string().describe("ISO 8601 datetime"),
  end: z.string().describe("ISO 8601 datetime"),
  timeZone: z.string().default("America/Los_Angeles"),
  recurrence: z.string().describe("RRULE string (e.g., 'FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE,TH,FR' for weekdays)"),
  colorId: z.string().optional().describe("Color ID (1-11) for event color coding"),
});

// Smart color detection based on event context
function suggestColorId(summary: string, description?: string): string {
  const text = `${summary} ${description || ''}`.toLowerCase();
  
  // Work/Professional (Blue tones)
  if (text.match(/\b(work|meeting|call|conference|deadline|project|client|business|office|interview|presentation|review|standup|sprint|team|manager|boss|hr|hrs)\b/)) {
    if (text.match(/\b(meeting|call|conference|standup|presentation)\b/)) return '7'; // Peacock
    if (text.match(/\b(deadline|urgent|important|critical)\b/)) return '8'; // Graphite
    return '9'; // Blueberry (default work)
  }
  
  // Personal/Fun (Pink/Red tones)
  if (text.match(/\b(party|social|fun|celebration|birthday|anniversary|date|romantic|dinner|movie|show|concert|game|gaming|friends|hangout|drinks|club|bar)\b/)) {
    if (text.match(/\b(date|romantic|anniversary|valentine)\b/)) return '11'; // Tomato
    if (text.match(/\b(movie|show|concert|entertainment|theater)\b/)) return '3'; // Grape
    return '4'; // Flamingo (default social)
  }
  
  // Health/Wellness (Green tones)
  if (text.match(/\b(gym|workout|exercise|fitness|run|running|yoga|pilates|swim|cycling|doctor|medical|appointment|therapy|dentist|checkup|health|wellness|massage|spa)\b/)) {
    if (text.match(/\b(doctor|medical|appointment|therapy|dentist|checkup|health)\b/)) return '2'; // Sage
    return '10'; // Basil (default fitness)
  }
  
  // Learning/Education (Yellow/Orange tones)
  if (text.match(/\b(study|class|course|lesson|workshop|training|seminar|lecture|school|university|college|exam|test|homework|assignment|learning|education|book|reading)\b/)) {
    if (text.match(/\b(workshop|conference|seminar|training)\b/)) return '6'; // Tangerine
    return '5'; // Banana (default learning)
  }
  
  // Travel
  if (text.match(/\b(travel|trip|vacation|flight|airport|hotel|booking|reservation|holiday|getaway)\b/)) {
    return '7'; // Peacock
  }
  
  // Default
  return '1'; // Lavender
}

const ListEvents = z.object({
  calendarId: z.string(),
  maxResults: z.number().optional().default(10).describe("Maximum number of events to return (default: 10)"),
  timeMin: z.string().optional().describe("Lower bound for event start times (ISO 8601 datetime)"),
  timeMax: z.string().optional().describe("Upper bound for event start times (ISO 8601 datetime)"),
  singleEvents: z.boolean().optional().default(true).describe("Whether to expand recurring events into instances"),
  orderBy: z.enum(["startTime", "updated"]).optional().default("startTime").describe("Order of the events returned"),
});

// Gmail API Schemas
const ListEmails = z.object({
  userId: z.string().default("me").describe("User's email address or 'me' for authenticated user"),
  maxResults: z.number().optional().default(10).describe("Maximum number of emails to return (default: 10)"),
  q: z.string().optional().describe("Gmail search query (e.g., 'from:example@gmail.com', 'subject:meeting', 'is:unread')"),
  labelIds: z.array(z.string()).optional().describe("Only return emails with these label IDs"),
  includeSpamTrash: z.boolean().optional().default(false).describe("Include emails from spam and trash"),
});

const GetEmail = z.object({
  userId: z.string().default("me").describe("User's email address or 'me' for authenticated user"),
  id: z.string().describe("Email message ID"),
  format: z.enum(["full", "metadata", "minimal", "raw"]).optional().default("full").describe("Format of the email content"),
});

const SendEmail = z.object({
  userId: z.string().default("me").describe("User's email address or 'me' for authenticated user"),
  to: z.array(z.string().email()).describe("Recipient email addresses"),
  cc: z.array(z.string().email()).optional().describe("CC email addresses"),
  bcc: z.array(z.string().email()).optional().describe("BCC email addresses"),
  subject: z.string().describe("Email subject"),
  body: z.string().describe("Email body content (plain text)"),
  isHtml: z.boolean().optional().default(false).describe("Whether the body content is HTML"),
});

const SearchEmails = z.object({
  userId: z.string().default("me").describe("User's email address or 'me' for authenticated user"),
  query: z.string().describe("Gmail search query (e.g., 'from:example@gmail.com', 'subject:meeting', 'is:unread')"),
  maxResults: z.number().optional().default(10).describe("Maximum number of emails to return (default: 10)"),
});

const createEventShape = (CreateEvent as any).shape;
const createRecurringEventShape = (CreateRecurringEvent as any).shape;
const listEventsShape = (ListEvents as any).shape;
const listEmailsShape = (ListEmails as any).shape;
const getEmailShape = (GetEmail as any).shape;
const sendEmailShape = (SendEmail as any).shape;
const searchEmailsShape = (SearchEmails as any).shape;

server.registerTool(
    "create_event",
    {
        title: "Create event",
        description: "Create an event with start/end in ISO 8601",
        inputSchema: createEventShape,
    },
    async (args, _extra) => {
     const parsed = CreateEvent.parse({
      ...args,
      timeZone: args.timeZone ?? "America/Los_Angeles",
    });

    const auth = await getAuth();
    const calendar = google.calendar({version: "v3", auth: auth as any});

    // Auto-suggest color if not provided
    const colorId = parsed.colorId || suggestColorId(parsed.summary, parsed.description);
    console.log("🎨 Using color ID:", colorId, "for event:", parsed.summary);

    const event: any = {
      summary: parsed.summary,
      start: { dateTime: parsed.start, timeZone: parsed.timeZone },
      end:   { dateTime: parsed.end,   timeZone: parsed.timeZone },
      colorId: colorId,
    };

    if (parsed.description) {
      event.description = parsed.description;
    }
    if (parsed.location) {
      event.location = parsed.location;
    }
    if (parsed.attendees && parsed.attendees.length > 0) {
      event.attendees = parsed.attendees.map(e => ({ email: e }));
    }

    const response = await calendar.events.insert({
      calendarId: parsed.calendarId,
      requestBody: event,
      sendUpdates: "all",
    });

    const data = response.data;

    return {
      content: [
        { type: "text", text: JSON.stringify({ id: data.id, htmlLink: data.htmlLink }, null, 2) },
      ],
    };
  }
);

server.registerTool(
    "create_recurring_event",
    {
        title: "Create recurring event",
        description: "Create a recurring event with RRULE pattern (e.g., 'FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE,TH,FR' for weekdays)",
        inputSchema: createRecurringEventShape,
    },
    async (args, _extra) => {
     const parsed = CreateRecurringEvent.parse({
      ...args,
      timeZone: args.timeZone ?? "America/Los_Angeles",
    });

    const auth = await getAuth();
    const calendar = google.calendar({version: "v3", auth: auth as any});

    console.log("🔄 Creating recurring event with RRULE:", parsed.recurrence);

    // Auto-suggest color if not provided
    const colorId = parsed.colorId || suggestColorId(parsed.summary, parsed.description);
    console.log("🎨 Using color ID:", colorId, "for recurring event:", parsed.summary);

    const event: any = {
      summary: parsed.summary,
      start: { dateTime: parsed.start, timeZone: parsed.timeZone },
      end:   { dateTime: parsed.end,   timeZone: parsed.timeZone },
      recurrence: [`RRULE:${parsed.recurrence}`],
      colorId: colorId,
    };
    
    console.log("📅 Event recurrence array:", event.recurrence);

    if (parsed.description) {
      event.description = parsed.description;
    }
    if (parsed.location) {
      event.location = parsed.location;
    }
    if (parsed.attendees && parsed.attendees.length > 0) {
      event.attendees = parsed.attendees.map(e => ({ email: e }));
    }

    try {
      const response = await calendar.events.insert({
        calendarId: parsed.calendarId,
        requestBody: event,
        sendUpdates: "all",
      });

      const data = response.data;

      return {
        content: [
          { type: "text", text: JSON.stringify({ 
            id: data.id, 
            htmlLink: data.htmlLink,
            recurrence: data.recurrence 
          }, null, 2) },
        ],
      };
    } catch (error: any) {
      console.log("❌ Error creating recurring event:", error);
      return {
        content: [
          { type: "text", text: `Error creating recurring event: ${error.message || error}` },
        ],
      };
    }
  }
);

server.registerTool(
    "list_events",
    {
        title: "List events",
        description: "List events from a calendar with optional filtering",
        inputSchema: listEventsShape,
    },
    async (args, _extra) => {
        const parsed = ListEvents.parse(args);

        const auth = await getAuth();
        const calendar = google.calendar({version: "v3", auth: auth as any});

        console.log("📅 Listing events from calendar:", parsed.calendarId);

        try {
            const listParams: any = {
                calendarId: parsed.calendarId,
                maxResults: parsed.maxResults,
                singleEvents: parsed.singleEvents,
                orderBy: parsed.orderBy,
            };

            // Only add timeMin and timeMax if they are provided
            if (parsed.timeMin) {
                listParams.timeMin = parsed.timeMin;
            }
            if (parsed.timeMax) {
                listParams.timeMax = parsed.timeMax;
            }

            const response = await calendar.events.list(listParams);
            const data = response.data;
            const events = data.items || [];
            console.log(`✅ Found ${events.length} events`);

            const formattedEvents = events.map((event: any) => ({
                id: event.id,
                summary: event.summary || 'No title',
                start: event.start?.dateTime || event.start?.date,
                end: event.end?.dateTime || event.end?.date,
                location: event.location,
                description: event.description,
                colorId: event.colorId,
                htmlLink: event.htmlLink,
                status: event.status,
            }));

            return {
                content: [
                    { type: "text", text: JSON.stringify(formattedEvents, null, 2) },
                ],
            };
        } catch (error: any) {
            console.log("❌ Error listing events:", error);
            return {
                content: [
                    { type: "text", text: `Error listing events: ${error.message || error}` },
                ],
            };
        }
    }
);

// Gmail API Tools
server.registerTool(
    "list_emails",
    {
        title: "List emails",
        description: "List emails from Gmail with optional filtering",
        inputSchema: listEmailsShape,
    },
    async (args, _extra) => {
        const parsed = ListEmails.parse(args);
        const auth = await getAuth();
        const gmail = google.gmail({version: "v1", auth: auth as any});

        console.log("📧 Listing emails for user:", parsed.userId);

        try {
            const listParams: any = {
                userId: parsed.userId,
                maxResults: parsed.maxResults,
                includeSpamTrash: parsed.includeSpamTrash,
            };

            if (parsed.q) {
                listParams.q = parsed.q;
            }
            if (parsed.labelIds && parsed.labelIds.length > 0) {
                listParams.labelIds = parsed.labelIds;
            }

            const response = await gmail.users.messages.list(listParams);
            const messages = response.data.messages || [];
            console.log(`✅ Found ${messages.length} emails`);

            const formattedEmails = messages.map((message: any) => ({
                id: message.id,
                threadId: message.threadId,
            }));

            return {
                content: [
                    { type: "text", text: JSON.stringify(formattedEmails, null, 2) },
                ],
            };
        } catch (error: any) {
            console.log("❌ Error listing emails:", error);
            return {
                content: [
                    { type: "text", text: `Error listing emails: ${error.message || error}` },
                ],
            };
        }
    }
);

server.registerTool(
    "get_email",
    {
        title: "Get email",
        description: "Retrieve a specific email by ID with full content",
        inputSchema: getEmailShape,
    },
    async (args, _extra) => {
        const parsed = GetEmail.parse(args);
        const auth = await getAuth();
        const gmail = google.gmail({version: "v1", auth: auth as any});

        console.log("📧 Getting email:", parsed.id);

        try {
            const response = await gmail.users.messages.get({
                userId: parsed.userId,
                id: parsed.id,
                format: parsed.format,
            });

            const message = response.data;
            const headers = message.payload?.headers || [];
            
            // Extract common headers
            const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

            const emailData = {
                id: message.id,
                threadId: message.threadId,
                snippet: message.snippet,
                subject: getHeader('Subject'),
                from: getHeader('From'),
                to: getHeader('To'),
                date: getHeader('Date'),
                labels: message.labelIds,
                sizeEstimate: message.sizeEstimate,
            };

            return {
                content: [
                    { type: "text", text: JSON.stringify(emailData, null, 2) },
                ],
            };
        } catch (error: any) {
            console.log("❌ Error getting email:", error);
            return {
                content: [
                    { type: "text", text: `Error getting email: ${error.message || error}` },
                ],
            };
        }
    }
);

server.registerTool(
    "send_email",
    {
        title: "Send email",
        description: "Compose and send an email",
        inputSchema: sendEmailShape,
    },
    async (args, _extra) => {
        const parsed = SendEmail.parse(args);
        const auth = await getAuth();
        const gmail = google.gmail({version: "v1", auth: auth as any});

        console.log("📧 Sending email to:", parsed.to.join(", "));

        try {
            // Create email message
            const to = parsed.to.join(", ");
            const cc = parsed.cc ? `Cc: ${parsed.cc.join(", ")}\r\n` : "";
            const bcc = parsed.bcc ? `Bcc: ${parsed.bcc.join(", ")}\r\n` : "";
            
            const emailLines = [
                `To: ${to}\r\n`,
                cc,
                bcc,
                `Subject: ${parsed.subject}\r\n`,
                `Content-Type: ${parsed.isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n`,
                "\r\n",
                parsed.body
            ];

            const email = emailLines.join("");
            const encodedEmail = Buffer.from(email).toString("base64").replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const response = await gmail.users.messages.send({
                userId: parsed.userId,
                requestBody: {
                    raw: encodedEmail,
                },
            });

            return {
                content: [
                    { type: "text", text: `Email sent successfully! Message ID: ${response.data.id}` },
                ],
            };
        } catch (error: any) {
            console.log("❌ Error sending email:", error);
            return {
                content: [
                    { type: "text", text: `Error sending email: ${error.message || error}` },
                ],
            };
        }
    }
);

server.registerTool(
    "search_emails",
    {
        title: "Search emails",
        description: "Search emails using Gmail search syntax",
        inputSchema: searchEmailsShape,
    },
    async (args, _extra) => {
        const parsed = SearchEmails.parse(args);
        const auth = await getAuth();
        const gmail = google.gmail({version: "v1", auth: auth as any});

        console.log("🔍 Searching emails with query:", parsed.query);

        try {
            const response = await gmail.users.messages.list({
                userId: parsed.userId,
                q: parsed.query,
                maxResults: parsed.maxResults,
            });

            const messages = response.data.messages || [];
            console.log(`✅ Found ${messages.length} emails matching search`);

            const formattedEmails = messages.map((message: any) => ({
                id: message.id,
                threadId: message.threadId,
            }));

            return {
                content: [
                    { type: "text", text: JSON.stringify(formattedEmails, null, 2) },
                ],
            };
        } catch (error: any) {
            console.log("❌ Error searching emails:", error);
            return {
                content: [
                    { type: "text", text: `Error searching emails: ${error.message || error}` },
                ],
            };
        }
    }
);


const transport = new StdioServerTransport();
await server.connect(transport);
