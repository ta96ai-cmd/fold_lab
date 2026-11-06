# REA: Hunger Inc / Bombay Sweet Shop "Packaging customisation" tool

Source: a public 74-second Instagram reel (shared by the user), analysed frame by frame from its captions and screens. The tool itself is internal and was not accessed. This is a behaviour spec for building our own version: no code, artwork, templates or naming is copied.

## The problem it solves (from the reel's script)
Corporate gifting season (Diwali): every corporate client wants the gift box with **their own logo**. Previously the team asked designers to "send the KLD" (key line drawing = dieline) and re-made artwork for each client, with differences between what was shown on screen and what got printed. They had to do this for **~600 customised orders**, so they built a tool: pick a pre-made template, upload the logo, choose colours, download a print-ready file with the KLD and print instructions built in. "Everything is already pre-made."

## Flow (2 steps + result)

**Step 1: Pick a customisation**
- Templates grouped by **product**, then by **piece type**:
  - *Unravel box*: Sleeves (200 × 451 mm sleeve sheet, 8 designs: Art Deco, Gateway Parchment, Navy Hibiscus, Purple, Purple Sunburst, Red, Retro Arcs, Royal Blue); Horizontal bands (none for this box); Vertical bands (none).
  - *Matchbox*: Sleeves (367 × 576 mm sleeve sheet, 3 designs).
  - *Coastal Bombay box*, *Bag tags*, *Barks Unravel 150g*, *Tin box* (H-band, sleeve, V-band).
- Each design is a thumbnail card; the selected card is highlighted.
- Missing pieces are shown honestly: "no artwork file yet", "2025 artwork only, no 2026 file yet", "nothing selectable yet".
- Form: **Client name** ("used for the filename"), **Client logo** (file upload; vector PDF preferred, PNG/JPG accepted with a resolution note), button **Check logo**.

**Step 2: Check the logo** (title shows the chosen template, e.g. "Unravel Box: Sleeve, Purple (Diwali 2026): artwork")
- Logo preview on a transparent checkerboard.
- Facts: **Type** (Vector PDF: scales to any size), **Source size** (86.3 × 47.3 mm), **Will print at** (36.5 mm wide).
- **Colours found in the logo** (or "no brand colours detected: looks like a single-colour logo").
- Two modes:
  - **Use the client's brand colour**: recolours the template artwork around the client's colour (hex input, e.g. #0B5FA5).
  - **Keep template colours, logo only**: artwork exactly as designed, logo placed in the badge.
- **Logo size** (100% = fitted to the badge).
- **Finish plates to include**: Gold foil plate, Spot UV plate (checkboxes, with notes).
- Buttons: **Generate artwork**, **Generate every collateral for this box** (all pieces of the box at once).

**Result: Print-ready (verified)**
- File name convention: brand_date_campaign_dept_PKG_client_TEMPLATE-PIECE-DESIGN_ARTWORK_V3.pdf. "Version 3 for this client, template and page today. Earlier versions are kept, not overwritten." "Logo placed: vector, 36.5 × 20.0 mm."
- Preview of the artwork with the dieline frame. **Download print file**.
- The PDF opens in Illustrator (CMYK) as artboards: **01 Artwork**, **02 KLD with dimensions**, **03 Gold foil plate**, **04 Spot UV / hot foil plate**, each with dimension lines and the panel scores.

## What makes it work
1. A **template library** prepared once by designers: per design, the artwork, the KLD, a **logo slot** (badge position and maximum size), which colours may be swapped for a brand colour, and which shapes are foil / UV.
2. A **logo check** that tells non-designers whether the file is good enough (vector vs raster, print size, colours).
3. **One-click print file** with all plates and the KLD, consistent naming and versioning, so 600 orders don't depend on a designer each time.

## Our version for Navratan Offset ("Co-brand Studio" inside REA Fold Lab)
Same job from the printer's side, plus what we already have:

| Their tool | Our version |
|---|---|
| Templates by product / piece | Template library: dieline (from the Dieline Maker or an uploaded KLD) + artwork + logo slot + recolourable colours + foil/UV layers |
| Logo upload + check | SVG / PDF / PNG / JPG; vector detection, source size, print size, effective DPI warning, detected colours |
| Brand colour vs keep colours | Same, by swapping the template's marked colours |
| Logo size | Same, plus position nudge inside the slot |
| Foil / spot UV plates | Separate spot-colour plates (e.g. "Foil", "SpotUV") in the PDF |
| Print-ready PDF with KLD | Multi-page PDF: artwork + KLD layer, KLD with dimensions, foil plate, UV plate; naming + version counter |
| (none) | **3D folded preview** and MP4 video of the client's box, to send for approval |
| "every collateral for this box" | Batch: one client, all pieces; **and a CSV + logo folder for hundreds of clients** |

## Open technical points
- Colour accuracy: browsers draw in RGB. For print-exact colour, templates should carry their CMYK values, and our PDF writer should write CMYK and spot colours directly rather than converting RGB.
- Vector logos in PDF: embed the client's PDF logo as a vector form (e.g. pdf-lib), not rasterised.
- Template authoring: simplest is an Illustrator file saved as SVG or PDF with named layers (ARTWORK, KLD, LOGO_SLOT, FOIL, UV).
