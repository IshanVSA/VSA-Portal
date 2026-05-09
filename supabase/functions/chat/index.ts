import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const tools = [
  {
    name: "create_ticket",
    description:
      "Create a support ticket for a department. Use when the user wants to submit a request, report an issue, or create a task for Website, SEO, Google Ads, or Social Media teams.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Brief summary of the issue or request (max 200 chars)",
        },
        department: {
          type: "string",
          enum: ["website", "seo", "google_ads", "social_media"],
          description: "Which department this ticket is for",
        },
        ticket_type: {
          type: "string",
          description:
            "Category of the ticket. Website: Time Changes, Pop-up Offers, Theme Updates, Add/Remove Team Members, New Forms, Paper-to-Digital Conversion, Price List Updates, Tech Issues, Others. SEO: Backlinking, Ranking Reports, Keyword Research, Manual Work Reports, Search Atlas Integration, SEO Thread Updates, Others. Google Ads: Dashboard Access, Analytics Review, Monthly Performance Report, Call Volume Issues, Wrong Call Tracking, Campaign Adjustments, Others. Social Media: Content Calendar, Post Approval, Analytics, Campaign Planning, Others.",
        },
        priority: {
          type: "string",
          enum: ["regular", "urgent", "emergency"],
          description: "Ticket priority. Default to regular unless user indicates urgency.",
        },
        description: {
          type: "string",
          description: "Detailed description of the issue or request",
        },
      },
      required: ["title", "department", "ticket_type"],
    },
  },
];

const systemPrompt = `You are the VSA Vet Media assistant, embedded inside a veterinary marketing platform. You help users with:
- Navigating the platform (Dashboard, Departments: Website/SEO/Google Ads/Social Media, Clinics, Settings)
- Understanding their analytics and content calendar
- Creating support tickets for departments when users have issues or requests
- General veterinary marketing advice (social media best practices, SEO tips, Google Ads optimization)

When a user describes a problem or wants to submit a request, use the create_ticket tool to create a ticket for them. Ask for any missing details if the request is unclear.

Be friendly, concise, and professional. Use markdown formatting for structured answers.`;

async function executeCreateTicket(
  args: {
    title: string;
    department: string;
    ticket_type: string;
    priority?: string;
    description?: string;
  },
  userId: string
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.from("department_tickets").insert({
    title: args.title,
    department: args.department,
    ticket_type: args.ticket_type,
    priority: args.priority || "regular",
    description: args.description || null,
    created_by: userId,
  }).select("id, title, department, priority").single();

  if (error) {
    console.error("Ticket creation error:", error);
    return { success: false, error: error.message };
  }
  return { success: true, ticket: data };
}

// Convert OpenAI-style messages from client to Anthropic format
function convertMessages(messages: { role: string; content: string }[]) {
  return messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Extract user ID from auth header
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
        userId = data?.claims?.sub as string || null;
      } catch (e) {
        console.error("Auth error:", e);
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicHeaders = {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };

    const anthropicMessages = convertMessages(messages);

    // First pass: non-streaming with tools to detect tool calls
    const r1 = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
        tools,
      }),
    });

    if (!r1.ok) {
      const status = r1.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await r1.text();
      console.error("Anthropic API error:", status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j1 = await r1.json();

    // Check for tool use in the response
    const toolUseBlock = j1.content?.find((b: any) => b.type === "tool_use");

    if (toolUseBlock && toolUseBlock.name === "create_ticket") {
      // Execute tool
      let toolResult: any;
      if (!userId) {
        toolResult = { success: false, error: "User not authenticated. Please log in to create tickets." };
      } else {
        toolResult = await executeCreateTicket(toolUseBlock.input, userId);
      }

      // Send tool result back for final response, streaming
      const r2 = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: anthropicHeaders,
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            ...anthropicMessages,
            { role: "assistant", content: j1.content },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUseBlock.id,
                  content: JSON.stringify(toolResult),
                },
              ],
            },
          ],
          stream: true,
        }),
      });

      if (!r2.ok) {
        const t = await r2.text();
        console.error("Anthropic API error (2nd pass):", r2.status, t);
        return new Response(JSON.stringify({ error: "AI service unavailable" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Convert Anthropic SSE stream to OpenAI-compatible SSE for the client
      return convertAnthropicStreamToOpenAI(r2);
    }

    // No tool call - extract text and return as SSE
    const textBlock = j1.content?.find((b: any) => b.type === "text");
    const content = textBlock?.text || "";
    const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(sseData, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function convertAnthropicStreamToOpenAI(response: Response): Response {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async pull(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              const openAIChunk = {
                choices: [{ delta: { content: event.delta.text } }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
            }
          } catch {
            // skip
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}
