# REA report: "This box doesn't exist and I didn't open Blender to make it"

**Source:** 64-second vertical reel (720×1280). Its script comes from the on-screen captions.
**What it really is:** a promo for **Fold Studio** (foldstudio.art), a web tool that turns a flat dieline SVG into a foldable 3D packaging preview. It is not a Blender tutorial.

## Script structure

| Time | Beat | On-screen text |
|---|---|---|
| 0–3s | Hook | "this box doesn't exist." |
| 3–8s | Social proof | "8,673 saved the flat dieline" |
| 8–12s | Problem | "but a flat doesn't sell" |
| 12–17s | Objection | "everyone says learn blender… but that's weeks to fold one box" |
| 17–20s | Discovery | "so i found a website" |
| 20–30s | Demo 1 | drop in the SVG; two colours mean cut and fold; it finds every panel and hinge |
| 30–33s | Mini-problem | "but it's still white" |
| 33–42s | Demo 2 | artwork inside and out; any fold from −180° to 180°; stop halfway; lid over or tuck in |
| 42–44s | Re-hook | "but a still box won't stop a scroll" |
| 44–55s | Demo 3 | 9 camera moves; lid opens mid-shot; 60fps video in the browser; 4K still; record |
| 55–64s | Reveal + CTA | "it's called fold studio", "save this for foldstudio.art" |

A new "but…" lands every 8–10 seconds, so the reel is a chain of problem → solution steps that keeps retention high.

## Product features observed

- SVG upload with stroke colours auto-detected (#FF00FF set to Cut, #00FFFF set to Crease). Each colour can be Cut, Crease or Ignore. Dashed strokes count as one continuous line.
- Example file stats: "12 crease · 1 cut · 13 panels".
- Separate artwork for Exterior and Interior (PNG/JPG).
- Per-hinge fold angle from −180° to 180°.
- Camera presets: Showcase orbit, Corner tour, Full inspection, Turntable, Hero reveal, Top-down reveal, Low-angle arc, Pendulum sway, Floating drift.
- Video options: Cinematic or Steady pace, seamless loop, 1/2/3 cycles, open and close the lid, fit whole box. Renders an MP4 at 60fps and 1920px offline.
- Export: PNG/JPG at 1080p, 4K behind a PRO badge, and SVG dieline (Advanced). Live recording too.
- Business model looks freemium (4K is PRO; there is a "My Dielines" dashboard).

## Approach

Fold Studio is a commercial web app, so this project **rebuilds the behaviour from the spec above with original code**. It does not copy or decompile their site. The `morluto/rea` tool targets native binaries, so it isn't used here.

## Business angle (Navratan Offset)

A client approves faster from a folded 3D preview or video than from a flat dieline. This can become a "3D proof" step inside BOS.
