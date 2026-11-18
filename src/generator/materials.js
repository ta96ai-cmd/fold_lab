// Board list for the Dieline Maker ("Material" picker). Thicknesses are typical starting values:
// always confirm the caliper of the actual board with your supplier (it varies by mill and batch).
export const MATERIALS = [
  { group: 'Folding carton', items: [
    { id: 'duplex230', label: 'Duplex board 230 gsm', t: 0.30 },
    { id: 'duplex300', label: 'Duplex board 300 gsm', t: 0.40 },
    { id: 'duplex350', label: 'Duplex board 350 gsm', t: 0.47 },
    { id: 'duplex400', label: 'Duplex board 400 gsm', t: 0.55 },
    { id: 'sbs300', label: 'SBS / FBB 300 gsm', t: 0.45 },
    { id: 'sbs350', label: 'SBS / FBB 350 gsm', t: 0.52 },
    { id: 'kraft300', label: 'Kraft board 300 gsm', t: 0.42 },
  ] },
  { group: 'Corrugated', items: [
    { id: 'fflute', label: 'F flute (micro)', t: 0.8 },
    { id: 'eflute', label: 'E flute', t: 1.5 },
    { id: 'bflute', label: 'B flute', t: 3.0 },
    { id: 'cflute', label: 'C flute', t: 4.0 },
    { id: 'eb', label: 'EB double wall', t: 4.5 },
    { id: 'bc', label: 'BC double wall', t: 6.5 },
  ] },
  { group: 'Rigid box board', items: [
    { id: 'grey15', label: 'Greyboard 1.5 mm', t: 1.5 },
    { id: 'grey20', label: 'Greyboard 2.0 mm', t: 2.0 },
    { id: 'grey25', label: 'Greyboard 2.5 mm', t: 2.5 },
  ] },
];
export const ALL_MATERIALS = MATERIALS.flatMap(g => g.items.map(m => ({ ...m, group: g.group })));
/** The material whose thickness matches t (within 0.005 mm), or null. */
export const materialFor = t => ALL_MATERIALS.find(m => Math.abs(m.t - t) < 0.005) || null;
