const DISPLAY_TO_TICKET_TYPE: Record<string, string> = {
  "Time Change": "Time Changes",
  "Pop-up Offer": "Pop-up Offers",
  "Third Party Integration": "Third Party Integrations",
  "Payment Option": "Payment Options",
  "Add/Remove Team Member": "Add/Remove Team Members",
  "New Form": "New Forms",
  "Price List Update": "Price List Updates",
  "Ranking Report": "Ranking Reports",
  "Manual Work Report": "Manual Work Reports",
  "SEO Thread Update": "SEO Thread Updates",
  "Call Volume Issue": "Call Volume Issues",
  "Campaign Adjustment": "Campaign Adjustments",
};

const TICKET_TYPE_TO_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(DISPLAY_TO_TICKET_TYPE).map(([display, value]) => [value, display])
);

export function normalizeTicketType(type: string) {
  return DISPLAY_TO_TICKET_TYPE[type] ?? type;
}

export function getTicketTypeLabel(type: string) {
  return TICKET_TYPE_TO_DISPLAY[type] ?? type;
}

export function getServiceOptions(services: string[]) {
  return services.map((service) => {
    const value = normalizeTicketType(service);
    return {
      value,
      label: getTicketTypeLabel(value),
    };
  });
}