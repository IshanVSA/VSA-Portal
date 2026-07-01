/**
 * Ticket visibility rules.
 *
 * Tickets are routed ONLY to the department where they were created.
 * The single exception is "Promote on Social Media: Yes" being present in
 * the description, which also fans the ticket out to social_media.
 *
 * This map is kept for any UI that wants to show "where will this be visible".
 * Each ticket type lists only its originating department.
 */
export const TICKET_VISIBILITY: Record<string, string[]> = {
  "Time Changes": ["website", "google_ads"],
  "Pop-up Offers": ["website"],
  "Third Party Integrations": ["website"],
  "Payment Options": ["website"],
  "Add/Remove Team Members": ["website"], // social_media is conditional via "Promote on Social Media: Yes"
  "New Forms": ["website"],
  "Price List Updates": ["website"],
  "Emergency": ["website"],
  "Dashboard Access": ["google_ads"],
  "Analytics Review": ["google_ads"],
  "Monthly Performance Report": ["google_ads"],
  "Call Volume Issues": ["google_ads"],
  "Wrong Call Tracking": ["google_ads"],
  "Campaign Adjustments": ["google_ads"],
  "Content Request": ["social_media"],
  "Client Visit": ["social_media"],
  "Bulk Uploads": ["social_media"],
  "Special Promotion": ["social_media"],
  "Boost": ["social_media"],
};

const DEPARTMENT_LABELS: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  google_ads: "Google Ads",
  social_media: "Social Media",
};

/**
 * Returns all ticket types that should be visible in a given department.
 */
export function getVisibleTicketTypes(department: string): string[] {
  return Object.entries(TICKET_VISIBILITY)
    .filter(([, depts]) => depts.includes(department))
    .map(([type]) => type);
}

/**
 * Returns human-readable department names where a ticket type is visible.
 */
export function getVisibleDepartmentLabels(ticketType: string): string[] {
  const depts = TICKET_VISIBILITY[ticketType] || [];
  return depts.map((d) => DEPARTMENT_LABELS[d] || d);
}
