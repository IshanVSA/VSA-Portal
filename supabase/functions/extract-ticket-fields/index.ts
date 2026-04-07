import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOLS_BY_FORM: Record<string, any> = {
  "Time Changes": {
    name: "extract_time_changes",
    description: "Extract business hours change details from user speech",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
        endDate: { type: "string", description: "End date in YYYY-MM-DD format, or empty if ongoing" },
        mondayOpen: { type: "string", description: "Monday open time HH:MM" },
        mondayClose: { type: "string", description: "Monday close time HH:MM" },
        mondayClosed: { type: "boolean", description: "Is Monday closed?" },
        tuesdayOpen: { type: "string" },
        tuesdayClose: { type: "string" },
        tuesdayClosed: { type: "boolean" },
        wednesdayOpen: { type: "string" },
        wednesdayClose: { type: "string" },
        wednesdayClosed: { type: "boolean" },
        thursdayOpen: { type: "string" },
        thursdayClose: { type: "string" },
        thursdayClosed: { type: "boolean" },
        fridayOpen: { type: "string" },
        fridayClose: { type: "string" },
        fridayClosed: { type: "boolean" },
        saturdayOpen: { type: "string" },
        saturdayClose: { type: "string" },
        saturdayClosed: { type: "boolean" },
        sundayOpen: { type: "string" },
        sundayClose: { type: "string" },
        sundayClosed: { type: "boolean" },
        statHolidayOpen: { type: "boolean" },
        statHolidayOpenTime: { type: "string" },
        statHolidayCloseTime: { type: "string" },
      },
      required: [],
    },
  },
  Emergency: {
    name: "extract_emergency",
    description: "Extract emergency issue details from user speech",
    parameters: {
      type: "object",
      properties: {
        issueType: { type: "string", description: "One of: Website Down, Form Not Working, Broken Links / 404 Errors, Payment Gateway Failure, SSL Certificate Issue, Login / Authentication Failure, Data Not Loading, Security Breach / Hack, Email System Down, Other" },
        affectedUrl: { type: "string", description: "The affected URL or page" },
        description: { type: "string", description: "Description of the issue" },
        impact: { type: "string", description: "Business impact" },
      },
      required: [],
    },
  },
  "Third Party Integrations": {
    name: "extract_integrations",
    description: "Extract third party integration details from user speech",
    parameters: {
      type: "object",
      properties: {
        integrationType: { type: "string", description: "One of: Online Booking / Scheduling, Payment Gateway, Loyalty / Rewards Program, Review / Reputation Management, Telemedicine / Virtual Visits, Email Marketing (e.g. Mailchimp), CRM / Client Management, Lab Results Integration, Pharmacy Integration, Other" },
        providerName: { type: "string" },
        accountUrl: { type: "string" },
        description: { type: "string" },
        urgencyReason: { type: "string" },
      },
      required: [],
    },
  },
  "Payment Options": {
    name: "extract_payment",
    description: "Extract payment options request details from user speech",
    parameters: {
      type: "object",
      properties: {
        requestType: { type: "string", description: "One of: Add New Payment Method, Remove Payment Method, Update Existing Payment Setup, Payment Page / Portal Setup, Invoicing Integration, Other" },
        paymentMethods: { type: "array", items: { type: "string" }, description: "IDs: credit_card, e_transfer, apple_pay, google_pay, paypal, financing, other" },
        providerName: { type: "string" },
        pageLocation: { type: "string" },
        details: { type: "string" },
      },
      required: [],
    },
  },
  "Add/Remove Team": {
    name: "extract_team",
    description: "Extract team member add/remove details from user speech",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "remove"] },
        memberName: { type: "string" },
        memberRole: { type: "string" },
      },
      required: [],
    },
  },
  "New Forms": {
    name: "extract_forms",
    description: "Extract new form request details from user speech",
    parameters: {
      type: "object",
      properties: {
        formName: { type: "string" },
        fieldsNeeded: { type: "string", description: "List of fields, one per line" },
      },
      required: [],
    },
  },
  "Price List": {
    name: "extract_price_list",
    description: "Extract price list update details from user speech",
    parameters: {
      type: "object",
      properties: {
        changes: { type: "string" },
        terms: { type: "string" },
      },
      required: [],
    },
  },
  "Pop-up Offers": {
    name: "extract_popup",
    description: "Extract popup offer details from user speech",
    parameters: {
      type: "object",
      properties: {
        offerTitle: { type: "string" },
        offerText: { type: "string" },
        termsAndConditions: { type: "string" },
        additionalNotes: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: [],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {

    const { transcript, formType } = await req.json();
    if (!transcript || !formType) {
      return new Response(JSON.stringify({ error: "transcript and formType required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toolDef = TOOLS_BY_FORM[formType];
    if (!toolDef) {
      return new Response(JSON.stringify({ error: `Unknown form type: ${formType}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const anthropicTool = {
      name: toolDef.name,
      description: toolDef.description,
      input_schema: toolDef.parameters,
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: `You are a form field extractor. The user dictated a request for a "${formType}" ticket. Extract all relevant fields from their speech. Only include fields you can confidently extract. Use 24-hour time format (HH:MM). For dates use YYYY-MM-DD. Today's date is ${new Date().toISOString().split("T")[0]}.`,
        messages: [
          { role: "user", content: transcript },
        ],
        tools: [anthropicTool],
        tool_choice: { type: "tool", name: toolDef.name },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Anthropic API error:", response.status, text);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI extraction error: ${response.status}`);
    }

    const data = await response.json();
    const toolBlock = data.content?.find((b: any) => b.type === "tool_use" && b.name === toolDef.name);

    if (!toolBlock?.input) {
      return new Response(JSON.stringify({ fields: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fields = toolBlock.input;

    return new Response(JSON.stringify({ fields }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-ticket-fields error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
