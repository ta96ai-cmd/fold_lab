# REA: Packmage online (online.packmage.com)

Observed on 6 Nov 2026 in a browser, without signing in: template library, one template editor (E037, a flip-lid shoe box), all three editor tabs. This is a behaviour spec for building our own features. No templates, codes, geometry or design are copied.

## 1. Template library

- **1,247 templates** in 18 categories (count per category in brackets):
  A Tube folding carton (227) · B Tube carton extension (168) · D Tray folding carton (97) · C Lid and base box (32) · E Lid hinge base box (102) · I Slide box (9) · Z Special shape carton (86) · L Display carton (68) · J Common corrugated box (50) · M Inserts and dividers (128) · F Paper bag with handle (19) · G Envelope and folder (40) · S Label, hang tag, card (31) · Q Display frame / rack (35) · R PVC box (15) · JP Rigid box (139) · BQ Other (5) · Uncategorized (26). **17 free.**
- Every template has a short code (category letter + number, e.g. E037) and a tag-heavy SEO name.
- Card grid with a **view mode: Struct / 3D / Struct + 3D** thumbnails.

## 2. Template editor: three tabs

### Dimensions (structure)
- Dieline drawn with **cut lines blue, crease lines red, dimension values in green, main sizes (L, W, D) in orange**, sizes printed on every panel and flap.
- **Size mode:** Inside / Outside / Die-cutting size (the same box can be specified three ways).
- **Caliper** (board thickness) 0.01 – 20, in **mm or pt**.
- **Units:** mm, cm, inch, inch (1/64).
- **Parameter table** grouped in numbered layers: main L, W, D, then many detail parameters (offsets, flap lengths, radii, corner guard width, socket length, glue flap length…), with "Hide details params" and **Run edit** to regenerate.
- Display: font size, **sign** (show code + number / code / number / none), **output size mode**, colour setting, **transform** (turn left / right, mirror X / Y).
- **statistics tab:** width, height, **cut-line length, fold-line length**, actual used area, bounding-rectangle area, **paper utilisation %** (E037: 4,428.9 mm cut, 3,214 mm fold, 70.72 %).

### Artworks
- Front and **Back** (inside) artwork sides.
- Import image, undo / redo, **printing bleed** (default 3 mm), zoom, image pan, rotate, fit to width / height, **layer list**, keyboard shortcuts.

### 3D
- **Auto-fold animation** with speed, **19 preset poses** (fold states) you can step through, play / reset.
- Camera presets: **Unfold, Front, Left, Back, Right, Top, Bottom**.
- **Paper colour**, **paper texture**, front/back pattern switch, background colour, light controls, model rotation.
- **Save works**, **Share link**, **Iframe embed code**, alternative domain.

## 3. Download and business model
- Download options: **zip, PDF, DXF, zip with parameters**; toggles for **bleed**, **merge cutter lines**, **QR code**.
- Paid: pay per single download (die-cut file for the current size only) or **annual membership** for unlimited downloads. Account area with purchase history; "Works Share" public gallery.

## 4. Comparison with REA Fold Lab (v0.6)

| Area | Packmage | REA Fold Lab | Gap to close |
|---|---|---|---|
| Library | 1,247 templates, 18 categories | 7 styles | Gallery UI + more families (lid & base, rigid, inserts, bags, display, corrugated FEFCO) |
| Size modes | Inside / outside / die-cut | Inside only | Add outside and die-cut modes |
| Units | mm, cm, inch, 1/64 inch; caliper mm or pt | mm, inch | cm, 1/64 inch, caliper in pt |
| Detail parameters | Many per template | A few per style | "Advanced" parameters per style (flap lengths, radii, offsets) |
| Dimensions on dieline | Every panel/flap | Main sizes | Per-panel dimension labels |
| Statistics | Cut/fold length, area, utilisation | Area, segment count, sheet utilisation | Cut-line and crease-line length (die-maker pricing uses these) |
| Transform | Rotate, mirror | None | Rotate / mirror dieline |
| Artwork | Front/back, bleed, layers, pan/zoom | Upload one image per side, no positioning | Place/scale/move art on the dieline |
| 3D | Auto-fold, 19 poses, paper colour/texture, light | Fold animation, presets, 9 camera moves, MP4 video | Paper colour/texture, view presets (front/left/top…) |
| Share | Share link + iframe embed | None | Client share link (BOS 3D proof) |
| Export | PDF, DXF, zip; bleed, merged lines, QR | SVG, PDF (spot colours, layers), DXF (layers), GLB, MP4, PNG, sheet PDF/DXF | QR code option; zip of all files |
| Nesting | Not seen on the page | Yes | (ahead) |
| Price | Paid downloads / membership | Free, own tool | (ahead) |

## 5. Build plan (our own implementation)
1. **Style gallery** with categories and auto-drawn thumbnails (dieline + 3D), search.
2. **Size modes** (inside / outside / die-cut) + cm, 1/64 inch, caliper in pt.
3. **Statistics:** cut-line length, crease-line length, used area, rectangle area, utilisation.
4. **New families:** lid & base (two-piece), slide/drawer box, insert/divider, paper bag with handle, corrugated FEFCO 0201 / 0427, rigid lid & base (grey board + wrap).
5. **Advanced parameters** per style; transform (rotate / mirror).
6. **3D:** paper colour / texture (white, kraft, corrugated edge), view presets.
7. **Share link** for clients (needs hosting decision: Vercel + storage).
