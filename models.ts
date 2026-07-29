// ─────────────────────────────────────────────────────────────────────────────
// 3D model manifest.
// To add a model: drop the .glb into public/models/ and add one entry here.
// It will automatically join the random rotation and the footer selector.
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
}

export const MODELS: ModelDef[] = [
    { path: '/models/gba.glb', label: 'GAME BOY ADVANCE', rotationY: -Math.PI / 2 },
    { path: '/models/gbc.glb', label: 'GAME BOY COLOR', fit: 1.35 },
];
