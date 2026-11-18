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
    { path: '/models/gbasp.glb', label: 'GAME BOY ADVANCE SP', fit: 1.4 },
    { path: '/models/ds.glb', label: 'NINTENDO DS', fit: 1.34 },
    { path: '/models/psp.glb', label: 'PSP', fit: 1.45 },
    { path: '/models/3ds.glb', label: 'NINTENDO 3DS', fit: 1.22 },
];
