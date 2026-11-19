import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Surface materials for the 3D models.
//
// A model can name the finish of each part with a glTF material extra
// `{ "role": "<role>" }` (scripts/generate-gbc.ts writes them). Parts without
// a role get the generic treatment: the mesh named "screen" gets the screen
// material, the rest one of three translucent tiers by bounding-box volume
// rank. Every model in models.ts names a role for each of its parts.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = ['shell', 'lens', 'lcd', 'print', 'button', 'rubber', 'cavity'] as const;
export type Role = typeof ROLES[number];

export interface ModelMaterials {
    /** Fallback tiers, largest parts first */
    tiers: [THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial];
    screen: THREE.MeshPhysicalMaterial;
    roles: Map<Role, THREE.MeshPhysicalMaterial>;
}

/** The role a part's glTF material names, if it is one we know. */
export function roleOf(mesh: THREE.Mesh): Role | undefined {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const role = material?.userData.role;
    return (ROLES as readonly string[]).includes(role) ? role as Role : undefined;
}

// ─── Fallback: three translucent tiers by volume, plus the screen ────────────

function makeBodyMat(mat: Record<string, any> = {}) {
    return new THREE.MeshPhysicalMaterial({
        color: mat.color ?? 0x494949,
        metalness: mat.metalness ?? 0.1,
        roughness: mat.roughness ?? 0.35,
        envMapIntensity: 0.5,
        transparent: true,
        opacity: mat.opacity ?? 0.03,
        side: THREE.DoubleSide,
        clearcoat: mat.clearcoat ?? 0.3,
        clearcoatRoughness: 0.15,
        specularIntensity: mat.specularIntensity ?? 0.3,
        specularColor: new THREE.Color(mat.specColor || 0xa0a0a8),
        depthWrite: false,
    });
}

function makeScreenMat() {
    return new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        metalness: 0.0,
        roughness: 0.09,
        emissive: 0x111111,
        emissiveIntensity: 0.15,
        envMapIntensity: 0.03,
        side: THREE.DoubleSide,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        specularIntensity: 1.2,
        specularColor: new THREE.Color(0xcccccc),
        depthWrite: true,
    });
}

const TIER_OPACITY = { light: [0.03, 0.30, 0.42], dark: [0.08, 0.50, 0.60] };
const SCREEN_EMISSIVE = { light: 0.15, dark: 0.4 };

// ─── Roles ───────────────────────────────────────────────────────────────────

/** Per-theme values; the rest of a role's look is shared. */
interface RoleTheme {
    opacity: number;
    /**
     * Clear plastic (see addGloss): how much its reflected light covers what
     * is behind (0 to 1), and the opacity it reaches at the silhouette
     */
    gloss?: { cover: number; rim: number };
    emissiveIntensity?: number;
}

interface RoleDef {
    params: THREE.MeshPhysicalMaterialParameters;
    /** Seen through the lens (see addBehindGlass) */
    behindGlass?: boolean;
    light: RoleTheme;
    dark: RoleTheme;
}

const ROLE_DEFS: Record<Role, RoleDef> = {
    // Molded body plastic: smoky and clear face-on, glossy, denser toward the silhouette.
    shell: {
        params: {
            color: 0x494949, roughness: 0.3, metalness: 0,
            clearcoat: 0.8, clearcoatRoughness: 0.08,
            specularIntensity: 0.5, specularColor: 0xa0a0a8,
            envMapIntensity: 0.8,
        },
        light: { opacity: 0.04, gloss: { cover: 0.5, rim: 0.4 } },
        dark: { opacity: 0.11, gloss: { cover: 1, rim: 0.55 } },
    },
    // Screen lens: black print under clear acrylic, sharp reflections.
    lens: {
        params: {
            color: 0x0e0e0e, roughness: 0.1, metalness: 0,
            clearcoat: 1, clearcoatRoughness: 0.02,
            specularIntensity: 1, specularColor: 0xcccccc,
            envMapIntensity: 2.0,
            emissive: 0x111111,
        },
        light: { opacity: 1, emissiveIntensity: 0.1 },
        dark: { opacity: 1, emissiveIntensity: 0.3 },
    },
    // LCD under the lens: matte and dark, with no reflection of its own;
    // the reflection belongs to the lens around it.
    lcd: {
        params: {
            color: 0x1c1d1d, roughness: 0.9, metalness: 0,
            specularIntensity: 0.05,
            envMapIntensity: 0.4,
            emissive: 0x111111,
        },
        behindGlass: true,
        light: { opacity: 1, emissiveIntensity: 0.15 },
        dark: { opacity: 1, emissiveIntensity: 0.4 },
    },
    // Printing and labels: flat, matte ink under a glossy face. Thin plates
    // lying on other parts, so only their outer face is drawn.
    print: {
        params: {
            color: 0x6a6a70, roughness: 0.7, metalness: 0,
            clearcoat: 1, clearcoatRoughness: 0.05,
            specularIntensity: 0.2,
            envMapIntensity: 0.8,
            side: THREE.FrontSide,
        },
        light: { opacity: 0.45 },
        dark: { opacity: 0.45 },
    },
    // Hard plastic keys: solid, with a glossy molded finish.
    button: {
        params: {
            color: 0x3a3a3e, roughness: 0.3, metalness: 0,
            clearcoat: 0.6, clearcoatRoughness: 0.12,
            specularIntensity: 0.6, specularColor: 0xa0a0a8,
            envMapIntensity: 0.8,
        },
        light: { opacity: 0.5, gloss: { cover: 0.5, rim: 0.8 } },
        dark: { opacity: 0.6, gloss: { cover: 1, rim: 0.85 } },
    },
    // Rubber keys: matte, with only a soft sheen at the edges.
    rubber: {
        params: {
            color: 0x58585c, roughness: 0.85, metalness: 0,
            specularIntensity: 0.15,
            sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0x9a9aa0,
            envMapIntensity: 0.4,
        },
        light: { opacity: 0.5, gloss: { cover: 0.5, rim: 0.7 } },
        dark: { opacity: 0.6, gloss: { cover: 1, rim: 0.8 } },
    },
    // Holes, slots and screw wells: the light falls off into them.
    cavity: {
        params: {
            color: 0x0a0a0a, roughness: 0.9, metalness: 0,
            specularIntensity: 0.05,
            envMapIntensity: 0.1,
        },
        light: { opacity: 0.6 },
        dark: { opacity: 0.85 },
    },
};

/**
 * Clear plastic hides little of what is behind it, but its reflections do
 * not fade with it: highlights stay bright, and the surface turns reflective
 * toward the silhouette (Fresnel). So the coverage rises with the specular
 * light and toward grazing angles, and the outline of a see-through body
 * still reads. Uniforms only, no extra pass.
 */
function addGloss(mat: THREE.MeshPhysicalMaterial) {
    const cover = { value: 0 }, rim = { value: 0 };
    mat.userData.gloss = { cover, rim };
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.glossCover = cover;
        shader.uniforms.rimOpacity = rim;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float glossCover;\nuniform float rimOpacity;')
            .replace('#include <opaque_fragment>', `#include <opaque_fragment>
                vec3 glossLight = totalSpecular;
                #ifdef USE_CLEARCOAT
                    glossLight += ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
                #endif
                float glint = glossCover * saturate( dot( glossLight, vec3( 0.2126, 0.7152, 0.0722 ) ) );
                float rimF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
                gl_FragColor.a = 1.0 - ( 1.0 - gl_FragColor.a ) * ( 1.0 - glint ) * ( 1.0 - rimOpacity * rimF );`);
    };
}

/**
 * A panel seen through the lens. The glass lets less light through toward
 * grazing angles (Fresnel, acrylic's 4 % at normal incidence, twice through
 * the surface), so the panel dims as the model turns while the lens around
 * it reflects more: the panel reads as lying behind the glass.
 */
function addBehindGlass(mat: THREE.MeshPhysicalMaterial) {
    mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
            float glassT = 1.0 - F_Schlick( 0.04, 1.0, saturate( dot( geometryNormal, geometryViewDir ) ) );
            gl_FragColor.rgb *= glassT * glassT;`);
    };
}

function makeRoleMat(role: Role) {
    const { params, behindGlass, light } = ROLE_DEFS[role];
    const opaque = light.opacity >= 1;
    const mat = new THREE.MeshPhysicalMaterial({
        side: THREE.DoubleSide,
        ...params,
        transparent: !opaque,
        depthWrite: opaque,
    });
    if (light.gloss) addGloss(mat);
    if (behindGlass) addBehindGlass(mat);
    return mat;
}

// ─── Assignment ──────────────────────────────────────────────────────────────

/** Gives every mesh of `model` its material and returns the set for theming. */
export function assignMaterials(model: THREE.Object3D): ModelMaterials {
    const set: ModelMaterials = {
        tiers: [
            makeBodyMat(),
            makeBodyMat({ color: 0x858590, roughness: 0.25, opacity: 0.30, clearcoat: 0.5 }),
            makeBodyMat({ color: 0x9a9aa0, roughness: 0.5, opacity: 0.42, metalness: 0.18 }),
        ],
        screen: makeScreenMat(),
        roles: new Map(),
    };

    const bodyParts: { mesh: THREE.Mesh; vol: number }[] = [];
    model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const role = roleOf(child);
        if (role) {
            if (!set.roles.has(role)) set.roles.set(role, makeRoleMat(role));
            child.material = set.roles.get(role)!;
        } else if ((child.name || '').toLowerCase() === 'screen') {
            child.material = set.screen;
            child.renderOrder = 1;
        } else {
            child.geometry.computeBoundingBox();
            const s = child.geometry.boundingBox!.getSize(new THREE.Vector3());
            bodyParts.push({ mesh: child, vol: s.x * s.y * s.z });
        }
    });

    // Parts without a role: tiers by volume rank, thirds of the list
    bodyParts.sort((a, b) => b.vol - a.vol);
    const t1 = Math.ceil(bodyParts.length / 3);
    const t2 = Math.ceil(bodyParts.length * 2 / 3);
    bodyParts.forEach((p, i) => {
        p.mesh.material = set.tiers[i < t1 ? 0 : i < t2 ? 1 : 2];
    });

    return set;
}

/** Light / dark values for every material in the set. */
export function applyMaterialTheme(set: ModelMaterials, dark: boolean) {
    const theme = dark ? 'dark' : 'light';
    set.tiers.forEach((m, i) => { m.opacity = TIER_OPACITY[theme][i]!; });
    set.screen.emissiveIntensity = SCREEN_EMISSIVE[theme];
    for (const [role, mat] of set.roles) {
        const t = ROLE_DEFS[role][theme];
        mat.opacity = t.opacity;
        if (t.emissiveIntensity !== undefined) mat.emissiveIntensity = t.emissiveIntensity;
        if (t.gloss) {
            mat.userData.gloss.cover.value = t.gloss.cover;
            mat.userData.gloss.rim.value = t.gloss.rim;
        }
    }
}
