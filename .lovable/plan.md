## Goal
Rebrand every in-product AI feature so it's named **"Tony AI"** consistently across the UI — the chat assistant, the voice dictation/autofill, and the various "AI" labels users see in forms and dialogs.

## Scope (what counts as "AI in the UI")
The chat bubble, the dictation/autofill button, and any UI copy that currently says "AI" when referring to the assistant or generation engine. The product **department name "AI SEO"** is a department brand, not the assistant — it stays as "AI SEO" (renaming it would break navigation, breadcrumbs, and saved memory).

## Copy changes

### 1. Chat Assistant — `src/components/chat/ChatAssistant.tsx`
- Header title: `Chat Assistant` → **`Tony AI`**
- Header subtitle: `AI-powered help` → **`Your VSA assistant`**
- Welcome message: `"I'm your VSA assistant…"` → **`"I'm Tony AI, your VSA assistant…"`**

### 2. Voice Dictation — `src/components/department/ticket-forms/VoiceDictation.tsx`
- Tooltip: `Speak to autofill the form with AI` → **`Speak to autofill the form with Tony AI`**

### 3. SEO PDF Upload — `src/components/department/UpdateSeoAnalyticsDialog.tsx`
- Helper text: `AI will extract all metrics automatically` → **`Tony AI will extract all metrics automatically`**

### 4. Social Media Monthly Signals — `src/components/social/MonthlySignalsForm.tsx`
- `…for the AI content engine this month.` → **`…for Tony AI's content engine this month.`**
- `AI-generated posts this month (max 10 default)` → **`Tony AI–generated posts this month (max 10 default)`**

### 5. Social Media Promotions — `src/components/social/PromotionModule.tsx`
- `…so the AI can reference them in generated posts.` → **`…so Tony AI can reference them in generated posts.`**

### 6. Clinic Detail (AI Insights tab) — `src/pages/ClinicDetail.tsx`
- Tab label `AI Insights` → **`Tony AI Insights`**
- Card title `AI Monthly Insights` → **`Tony AI Monthly Insights`**
- Empty-state: `…regenerate insights to get an up-to-date AI analysis.` → **`…regenerate insights to get an up-to-date Tony AI analysis.`**

### 7. Settings — AI Templates tab — `src/pages/Settings.tsx`
- Sidebar item label `AI Templates` → **`Tony AI Templates`**
- Card description `Base prompt used for AI content generation` → **`Base prompt used for Tony AI content generation`**
- Field label `AI Content Generation Prompt` → **`Tony AI Content Generation Prompt`**

## Out of scope (intentionally not changed)
- **`AI SEO` department** name (sidebar, page title, clinic flag, route `/ai-seo`) — that's a product department, not the assistant.
- Internal code comments, variable names, edge function names, and database fields — back-end identifiers stay the same.
- Privacy Policy / Terms of Service legal copy that references "AI" generically.

## Notes
Pure copy change — no logic, schema, or API impact. All changes ship in a single edit pass.