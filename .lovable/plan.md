

## Book a Meeting - UI/UX Redesign

### Current Issues
- Plain layout with basic cards and raw iframe embeds
- No visual hierarchy or personality
- Iframes may not render well (Google Calendar embeds can be blocked)
- No engaging header or visual differentiation between the two team members

### Redesigned Approach

**Page Header**: Add a centered hero section with a gradient-text heading, a warm subtitle, and a subtle dot-grid background pattern for visual depth.

**Team Member Cards**: Replace the plain cards with premium styled cards featuring:
- Initials-based avatar circles (matching the platform's existing pattern) with gradient backgrounds - "VC" for Vedant, "AA" for Avi
- Role/title beneath each name (e.g., "Founder" or "Co-Founder")
- A short friendly description line
- Remove the iframe embed entirely (Google Calendar appointment links don't embed well) and replace with a prominent, styled CTA button that opens the scheduling link
- Add a subtle hover-lift effect on cards
- Use stagger entrance animations

**Layout**: Center the content with a max-width container. Cards side by side on desktop, stacked on mobile. Add generous spacing and the dot-grid background.

**Dark/Light Mode**: Use existing CSS variables and card styles (glass-card patterns). The gradient avatars and primary-colored CTAs will naturally adapt.

### File Changes

**`src/pages/BookMeeting.tsx`** - Complete rewrite:
- Centered layout with `max-w-3xl mx-auto`
- Hero section with gradient heading and descriptive subtitle
- Two cards with: initials avatar (gradient bg), name, role, email, description, and a primary CTA button linking to the Google Calendar appointment page
- "Open in new tab" button replaced with a single prominent "Schedule a Meeting" button
- Add `Video` or `CalendarCheck` icon to the CTA
- Use `stagger-children` class for entrance animation
- Use `hover-lift` class on cards

