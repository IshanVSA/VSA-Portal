# Live Voice Waveform Visualizer

Add an interactive frequency/waveform line that pulses with the user's voice pitch and volume while recording, making the dictation feel responsive and alive.

## Scope

The dictation feature is used in two places, both will get the visualizer:
- `src/components/ui/voice-textarea.tsx` — inline mic on textareas (used across the app)
- `src/components/department/ticket-forms/VoiceDictation.tsx` — ticket form "Dictate" button

## Approach

Create a single reusable component `src/components/ui/voice-waveform.tsx` that:
- Accepts the live `MediaStream` from `getUserMedia` as a prop
- Uses Web Audio API (`AudioContext` + `AnalyserNode`) to read frequency data in real time
- Renders bars/line on a `<canvas>` via `requestAnimationFrame`
- Auto cleans up the analyser, source, and animation frame when stream ends or component unmounts

Visual style:
- Thin horizontal strip of vertical bars (or a smooth mirrored line) using `hsl(var(--primary))` with subtle glow
- Bars react to frequency bins; height scales with amplitude so loud/high-pitch speech makes taller spikes
- Smooth easing between frames (lerp) so it feels organic, not jittery
- Compact height (~28–36px) to slot into existing layouts without disrupting them

## Integration points

**voice-textarea.tsx**
- Lift the `MediaStream` to component state (currently only the recorder is stored)
- When `recording === true`, replace the existing "Recording…" indicator at the bottom-right with the waveform spanning the bottom of the textarea (or just above it), keeping the red dot label

**VoiceDictation.tsx**
- Lift the `MediaStream` to state (already kept in `streamRef`, mirror to state to trigger re-render)
- When recording, render the waveform inline next to the Stop button, replacing the "Recording… speak now" text

## Technical notes

- `AnalyserNode.fftSize = 256` → 128 frequency bins, plenty for a smooth bar visual
- Use `getByteFrequencyData` each frame
- Guard against SSR / missing `AudioContext` (fallback: render nothing)
- Stop and close the `AudioContext` on unmount to free the mic indicator
- No new dependencies required

## Files changed

- new: `src/components/ui/voice-waveform.tsx`
- edit: `src/components/ui/voice-textarea.tsx`
- edit: `src/components/department/ticket-forms/VoiceDictation.tsx`
