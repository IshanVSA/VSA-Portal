// Which ticket types in the existing system count as "lead intake".
// Adjust this list as the team formalizes lead capture (e.g. a new
// "Lead Inquiry" or "Website Form Submission" ticket type).
export const LEAD_TICKET_TYPES: string[] = [
  "Lead Inquiry",
  "Website Form Submission",
  "Form Lead",
  "New Patient Inquiry",
  "Contact Form",
];

// Treat anything in this list as a "form" lead source (rest are bucketed as "other").
export const FORM_LEAD_TYPES: string[] = LEAD_TICKET_TYPES;
