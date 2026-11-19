// ─────────────────────────────────────────────────────────────────────────────
// 3D model manifest.
// To add a model: drop the .glb into public/models/ and add one entry here.
// It joins the rotation and the footer selector in list order; the first entry
// is shown on load.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelDef {
    /** URL path to the .glb (served from public/) */
    path: string;
    /** Label shown in the footer model selector */
    label: string;
    /** Y-axis correction so the model faces the camera (radians) */
    rotationY?: number;
    /** Normalized size on screen — largest dimension in world units (default 1.5) */
    fit?: number;
    /** How far below the default angle the camera looks up at the model (radians, default 0) */
    lookUp?: number;
    /**
     * How far below the usual height the model floats (world units, default 0).
     * Seen from below, the near top corners rise on screen as the model turns;
     * this keeps the whole turn inside the frame (view.test.ts)
     */
    sink?: number;
}

/** Open clamshells: from a little below, so the upper screen faces the camera too */
const CLAMSHELL_LOOK_UP = 12 * Math.PI / 180;

// In the order I played them. The sinks center each clamshell's whole turn in the frame at 1440×900.
export const MODELS: ModelDef[] = [
    { path: '/models/gbc.glb', label: 'GAME BOY COLOR', fit: 1.35 },
    { path: '/models/gbasp.glb', label: 'GAME BOY ADVANCE SP', fit: 1.4, lookUp: CLAMSHELL_LOOK_UP, sink: 0.076 },
    { path: '/models/ds.glb', label: 'NINTENDO DS', fit: 1.34, lookUp: CLAMSHELL_LOOK_UP, sink: 0.098 },
    { path: '/models/dsi.glb', label: 'NINTENDO DSi', fit: 1.25, lookUp: CLAMSHELL_LOOK_UP, sink: 0.098 },
    { path: '/models/3ds.glb', label: 'NINTENDO 3DS', fit: 1.22, lookUp: CLAMSHELL_LOOK_UP, sink: 0.098 },
    { path: '/models/psp.glb', label: 'PSP', fit: 1.45 },
];
