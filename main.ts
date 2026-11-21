import { safeGetItem, safeSetItem } from './public/storage.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MODELS, type ModelDef } from './models';
import { applyMaterialTheme, assignMaterials, type ModelMaterials } from './model-materials';
import { CAMERA, MOBILE_BP, MOBILE_CANVAS, floatHeight, frameZoom, placeModel } from './view';
import { advanceAutoMomentum, idleMotion, removeAutoMomentum, shouldClearMomentum } from './idle-motion';
import './theme-switch';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let model: THREE.Object3D | null = null;
let edgeMat: LineMaterial;
let materials: ModelMaterials | null = null;
let ambientLight: THREE.AmbientLight | null = null;
let keyLight: THREE.DirectionalLight | null = null;
let fillLight: THREE.DirectionalLight | null = null;

let currentIndex = 0;
// The model on screen (currentIndex moves on while the next one loads)
let shown: ModelDef = MODELS[currentIndex]!;
let isLoadingModel = false;
let targetScale = 1;
// How far below the user's angle the camera looks up at the model: easing
// toward the shown model's lookUp like the scale, and the part of it applied
// within the controls' polar limits
let lookUp = 0;
let targetLookUp = 0;
let applied = 0;

const clock = new THREE.Clock();
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionQuery.matches;
let previousReducedMotion: boolean | undefined;
let autoMomentum = 0;
reducedMotionQuery.addEventListener('change', (event) => {
    reducedMotion = event.matches;
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE SETUP
// ═══════════════════════════════════════════════════════════════════════════════

function initThree() {
    const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene & Environment
    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
    pmrem.dispose();

    // Camera
    camera = new THREE.PerspectiveCamera(CAMERA.desktop.fov, 1, 0.1, 100);
    camera.position.set(...CAMERA.desktop.position);

    // Controls
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.04;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = idleMotion(reducedMotion, 0).autoRotate;
    controls.autoRotateSpeed = 0.5;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.62;

    const orbitControls = controls as OrbitControls & {
        _sphericalDelta: THREE.Spherical;
        _getAutoRotationAngle(deltaTime: number | null): number;
    };
    const update = controls.update.bind(controls);
    // Pointer handlers also call update(), so track their damping steps too.
    controls.update = (deltaTime = null) => {
        controls.autoRotate = !reducedMotion;
        if (shouldClearMomentum(previousReducedMotion, reducedMotion)) {
            orbitControls._sphericalDelta.theta = removeAutoMomentum(orbitControls._sphericalDelta.theta, autoMomentum);
            autoMomentum = 0;
        }
        previousReducedMotion = reducedMotion;
        const angle = controls.autoRotate && controls.state === -1
            ? orbitControls._getAutoRotationAngle(deltaTime) : 0;
        const changed = update(deltaTime);
        autoMomentum = advanceAutoMomentum(autoMomentum, angle, controls.enableDamping ? controls.dampingFactor : 1);
        return changed;
    };

    // Lighting
    ambientLight = new THREE.AmbientLight(0x405570, 2.0);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xc0d8f0, 2.5);
    keyLight.position.set(3, 5, 6);
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0x90a8c8, 1.5);
    fillLight.position.set(-4, 2, 4);
    scene.add(fillLight);

    handleResize();
    window.addEventListener('resize', handleResize);

    loadModel(MODELS[currentIndex]!, { initial: true });

    // Apply theme to Three.js objects (lighting)
    applyTheme();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL LOADING
// ═══════════════════════════════════════════════════════════════════════════════

function disposeModel() {
    if (!model) return;
    scene.remove(model);
    model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
    model = null;
    materials = null;
}

function loadModel(def: ModelDef, opts: { initial?: boolean } = {}) {
    if (isLoadingModel) return;
    isLoadingModel = true;
    updateModelHud(true);

    const loader = new GLTFLoader();
    const fill = document.querySelector('.loader-fill') as HTMLElement | null;

    loader.load(
        def.path,
        (gltf) => {
            disposeModel();
            model = gltf.scene;
            shown = def;
            const scaleFactor = placeModel(model, def);
            targetScale = scaleFactor;
            targetLookUp = def.lookUp ?? 0;
            // Pop-in: start slightly small, animate() eases toward targetScale
            model.scale.setScalar(scaleFactor * 0.85);

            // ─────────────────────────────────────────────────────────────────
            // Materials
            // ─────────────────────────────────────────────────────────────────
            edgeMat = new LineMaterial({
                color: 0x222222,
                linewidth: 0.8,
                transparent: true,
                opacity: 0.25,
                depthWrite: false,
                depthTest: true,
                worldUnits: false,
                resolution: new THREE.Vector2(
                    renderer.domElement.width,
                    renderer.domElement.height
                ),
            });

            // ─────────────────────────────────────────────────────────────────
            // Mesh Processing
            // ─────────────────────────────────────────────────────────────────
            // Role materials where the model names them, volume tiers elsewhere
            materials = assignMaterials(model);

            scene.add(model);

            // Create edge lines
            const meshes: THREE.Mesh[] = [];
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) meshes.push(child);
            });

            meshes.forEach((child) => {
                const edges = new THREE.EdgesGeometry(child.geometry, 8);
                const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
                const line = new LineSegments2(lineGeo, edgeMat);

                line.position.copy(child.position);
                line.quaternion.copy(child.quaternion);
                line.scale.copy(child.scale);
                line.renderOrder = 3;
                line.computeLineDistances();

                child.parent!.add(line);
            });

            // Apply current theme to newly created materials
            applyTheme();

            isLoadingModel = false;
            updateModelHud();

            // Fade out loader (initial load only)
            if (opts.initial) {
                if (fill) fill.style.width = '100%';
                setTimeout(() => {
                    const loaderEl = document.getElementById('loader');
                    if (loaderEl) loaderEl.classList.add('hidden');
                }, 600);
            }
        },
        (xhr) => {
            if (opts.initial && fill && xhr.total > 0) {
                fill.style.width = (xhr.loaded / xhr.total * 100) + '%';
            }
        },
        (err) => {
            console.error('Model load error:', err);
            isLoadingModel = false;
            updateModelHud();
            if (opts.initial) {
                const loaderText = document.querySelector('.loader-text') as HTMLElement | null;
                if (loaderText) loaderText.textContent = 'LOAD ERROR';
            }
        }
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL SELECTOR
// ═══════════════════════════════════════════════════════════════════════════════

function updateModelHud(loading = false) {
    const label = document.getElementById('model-label');
    const count = document.getElementById('model-count');
    if (label) {
        label.textContent = loading ? 'LOADING...' : MODELS[currentIndex]!.label;
        label.classList.toggle('loading', loading);
    }
    if (count) count.textContent = `${currentIndex + 1}/${MODELS.length}`;
}

function switchModel(dir: 1 | -1) {
    if (isLoadingModel) return;
    currentIndex = (currentIndex + dir + MODELS.length) % MODELS.length;
    loadModel(MODELS[currentIndex]!);
}

document.getElementById('model-prev')?.addEventListener('click', () => switchModel(-1));
document.getElementById('model-next')?.addEventListener('click', () => switchModel(1));

// ═══════════════════════════════════════════════════════════════════════════════
// RESIZE
// ═══════════════════════════════════════════════════════════════════════════════

function handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;

    const isMobile = w <= MOBILE_BP;
    // On mobile, canvas is 60vh
    const canvasH = isMobile ? h * MOBILE_CANVAS : h;
    const view = isMobile ? CAMERA.mobile : CAMERA.desktop;

    camera.aspect = w / canvasH;
    camera.fov = view.fov;
    // On desktop, framed for the virtual screen between its bands
    camera.zoom = isMobile ? 1 : frameZoom(h, h - frameBands());
    camera.position.set(...view.position);
    renderer.setSize(w, canvasH, false);
    applied = lowerCamera(lookUp);

    camera.updateProjectionMatrix();
    if (edgeMat) edgeMat.resolution.set(w, canvasH);
}

/** Height of the bands above and below the virtual screen (style.css) */
function frameBands() {
    const style = getComputedStyle(document.documentElement);
    return (parseFloat(style.getPropertyValue('--vs-top')) || 0) + (parseFloat(style.getPropertyValue('--vs-bottom')) || 0);
}

const orbit = new THREE.Spherical();
const offset = new THREE.Vector3();

/**
 * Swings the camera `angle` radians down around the target, keeping its
 * distance and side, as far as the controls' polar limits let it.
 * Returns the angle it swung.
 */
function lowerCamera(angle: number) {
    orbit.setFromVector3(offset.subVectors(camera.position, controls.target));
    const phi = orbit.phi + angle;
    orbit.phi = THREE.MathUtils.clamp(phi, controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(offset.setFromSpherical(orbit));
    return angle - (phi - orbit.phi);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const motion = idleMotion(reducedMotion, t);
    controls.autoRotate = motion.autoRotate;

    if (model) {
        model.position.y = floatHeight(shown, motion.floatTime);
        // Ease scale toward target (pop-in on model switch)
        const s = model.scale.x + (targetScale - model.scale.x) * 0.08;
        model.scale.setScalar(s);
        // Swing to the new model's angle at the same pace
        lookUp += (targetLookUp - lookUp) * 0.08;
    }

    // The controls keep the user's own angle (auto-rotation, drag and its
    // inertia) within the polar limits; the model's angle goes on top, cut at
    // the limits. Switching back leaves the user's angle as it would have been.
    lowerCamera(-applied);
    controls.update();
    applied = lowerCamera(lookUp);
    camera.lookAt(controls.target);

    renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

let isDarkMode = false;

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDarkMode);
    // The switch follows body.dark-mode (style.css, theme-switch-3d.ts); aria-checked tells assistive tech
    document.getElementById('theme-toggle')?.setAttribute('aria-checked', String(isDarkMode));

    // Update Three.js materials and lighting for theme
    if (!ambientLight) return; // Three.js not initialized yet

    if (isDarkMode) {
        // Edge lines: brighter and more opaque
        if (edgeMat) {
            edgeMat.color.set(0xaaaaaa);
            edgeMat.opacity = 0.5;
        }
        // Lighting: increase intensity
        ambientLight.intensity = 3.0;
        if (keyLight) keyLight.intensity = 3.5;
        if (fillLight) fillLight.intensity = 2.5;
    } else {
        // Edge lines: original values
        if (edgeMat) {
            edgeMat.color.set(0x222222);
            edgeMat.opacity = 0.25;
        }
        // Lighting: original intensity
        ambientLight.intensity = 2.0;
        if (keyLight) keyLight.intensity = 2.5;
        if (fillLight) fillLight.intensity = 1.5;
    }
    // Body, screen and role materials
    if (materials) applyMaterialTheme(materials, isDarkMode);
}

// Initialize theme from localStorage
const savedTheme = safeGetItem('portfolio-theme');
isDarkMode = savedTheme === 'dark';
applyTheme();

// Theme toggle event listener
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    safeSetItem('portfolio-theme', isDarkMode ? 'dark' : 'light');
    applyTheme();
});

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

initThree();
animate();
