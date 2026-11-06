# REA: client-logo packaging customisation (from a public Instagram reel)

Source: a 74-second reel in which a packaging team demos an internal web tool, read frame by frame from the laptop screens and the captions. This is a behaviour spec only; we build our own version.

## The problem the reel describes
- Corporate gifting (e.g. Diwali): **~600 customised** packs, each a client's logo on one of the brand's standard sleeves/boxes.
- Designers redid every file by hand; "what you see vs what's actually printed" differed (RGB vs CMYK); the printer needed separate files and instructions ("calling KLD", i.e. the key-line drawing / dieline).
- Goal: anyone on the team picks a template, adds the client logo, and downloads a file that is **already print-ready, with print instructions**.

## Workflow seen on screen

### Step 1 – Pick a customisation
- Page title "Packaging customization": *client name and logo onto a brand template; the output opens in Illustrator for you to finish.*
- Templates grouped **by product**, each group showing the **sheet size and number of designs**:
  - Unravel box → Sleeves: "200 × 451 mm sleeve sheet · 8 designs" (Art Deco, Gateway Parchment, Navy Hibiscus, Purple, Purple Sunburst, Red, Retro Arcs, Royal Blue); "Horizontal bands / Vertical bands – none for this box".
  - Matchbox → Sleeves: "387 × 576 mm sleeve sheet · 3 designs".
  - Large box, large coin box, bag tags, tin box … some marked "no artwork file yet".
- Thumbnail cards; the chosen design gets a highlighted border.
- **Client name** (e.g. a company name, used in the file name) and **Client logo** upload (PDF preferred; note says PDF/vector is best, PNG/JPG work, and explains what happens with RGB / transparency). Button **Check logo**.

### Step 2 of 2 – Check the logo
- Logo preview on a checkerboard.
- **Type:** "Vector PDF – scales to any size"; **Source size** (e.g. 86.3 × 42.3 mm); **Will print at** (e.g. 35.0 mm wide).
- **Colours found in the logo**, with a choice: *Use the client's brand colour* (recolours the artwork) or **Keep brand colours, logo only**.
- **Logo size**: 100 % (fitted to the template's logo zone).
- **Finish plates to include:** **Gold foil plate**, **Spot UV plate** (checkboxes).
- Button **Generate artwork**.

### Step 3 – Print-ready
- Badge "verified"; product line (e.g. "Unravel Box – Sleeve, Purple (Diwali 2026) – artwork").
- A **systematic file name**: `BRAND_YYYYMMDD_CAMPAIGN_…_CLIENT_PRODUCT-DESIGN_ARTWORK_V3.pdf` with a note that earlier versions are kept, not overwritten.
- **Download print file**; preview of the sleeve with the client logo placed.

### Step 4 – Opened in Illustrator
- One PDF with **several artboards**: the artwork, the **plates** (foil / spot UV as separate artboards), the **key-line (dieline)** and the **print instructions**: "everything I see is exactly what is printed".

## Spec for our version ("Personalise" in Fold Lab)
1. **Template library** (admin): upload a design's print PDF + dieline, set its **logo zone** (position, max width/height in mm), product, sheet size, available finishes. Thumbnails generated automatically.
2. **Job form:** client name, campaign, logo upload (PDF/SVG/PNG/JPG).
3. **Logo check:** vector vs raster; source size; print size; **effective DPI** for raster (warn below 300); colours found (RGB → CMYK warning); transparency; choose brand colours vs logo only; size %.
4. **Finishes:** gold foil, spot UV (and later emboss) → separate plates as **spot colours**.
5. **Generate:** print-ready PDF: artwork page (logo placed in the zone), one page per finish plate, key-line page (CutContour / Crease), print-instructions page (sizes, finishes, colours, quantity, version, date). Systematic file name + version history.
6. **3D proof:** fold the result in Fold Lab with the artwork (our existing 3D + MP4).
7. **Batch:** one template, many clients (CSV of client names + logo files) for gifting season.
