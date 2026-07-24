## Goal
Add an animated WebGL "wavy" background behind the left sidebar in `DashboardLayout.tsx`, using a cleaned-up version of the pasted `WavyBackground` component.

## Fixes needed to the pasted snippet
The snippet as pasted won't compile — I'll fix these while porting it into `src/components/ui/wavy.tsx`:
1. Broken `.join("," )` — the palette join string is corrupted with a newline. Restore it to `.join(",\n  ")`.
2. Empty JSX return — the component ends with blank parens and no elements. It needs to return an absolutely-positioned `<canvas>` plus a wrapper that renders `children` above it.
3. Canvas sizes itself to `window.innerWidth/innerHeight`. That's wrong for a sidebar background — it needs to size to its parent container using `ResizeObserver` and `devicePixelRatio`, otherwise the canvas will overflow the sidebar and cover the whole page.
4. Add `prefers-reduced-motion` guard: freeze the shader (render one frame, skip the RAF loop) for users who opt out of motion.
5. Add a WebGL2 fallback: if `gl` is null, render a static CSS gradient instead of erroring.

## Files
- **Create** `src/components/ui/wavy.tsx` — fixed `WavyBackground` component. Props: `children?`, `className?`. Renders `<div className="relative ...">` with an absolutely-positioned `<canvas className="absolute inset-0 w-full h-full">` behind `children`.
- **Edit** `src/components/DashboardLayout.tsx` (the `<aside>` around line 371):
  - Wrap the sidebar's inner content in `<WavyBackground className="absolute inset-0 -z-0">` mounted as a sibling of the existing header/nav, or wrap the whole aside interior.
  - Add `relative overflow-hidden` to the `<aside>` so the canvas is clipped to the sidebar.
  - Add a subtle dark overlay (`bg-[hsl(var(--sidebar-background))]/70` or a gradient) between the canvas and the nav content so existing text/icons stay legible against the animated blues.
  - Do not change the existing sidebar layout, collapse behavior, mobile drawer, active-route styling, or nav structure.
- **Skip** the `demo.tsx` file — it's just an empty example and we're wiring the real usage into `DashboardLayout`.

## Answers to the integration questions
- **Props**: only `children` and `className`. No app data flows in.
- **State/context**: none — self-contained WebGL2 + RAF.
- **Assets/icons**: none.
- **Responsive**: canvas resizes to its parent via `ResizeObserver`, works in both collapsed (`w-[68px]`) and expanded (`w-[260px]`) sidebar widths and on mobile drawer.
- **Placement**: behind the left sidebar in `DashboardLayout.tsx`, per the request.

## Explicit non-goals
- Not touching any other page, department, or route.
- Not changing sidebar tokens in `index.css` — only adding the canvas layer + a legibility overlay in the sidebar markup.
- Not adding the effect to the main content area or headers.

## Notes / trade-offs to flag
- The shader runs continuously (fbm with 10 octaves + swirl). On low-end laptops the sidebar will consume noticeable GPU. Reduced-motion guard mitigates this; if it still feels heavy after you see it, we can drop `FBM_OCTAVES` to 5–6 or pause the RAF when the tab is hidden (`document.visibilitychange`).
- Sidebar text is currently `--sidebar-muted`/`--sidebar-foreground` on a solid dark background. Against the animated blues, some rows may lose contrast — the overlay tint above is the mitigation. If it's still borderline, I'll bump the overlay opacity in a follow-up.
