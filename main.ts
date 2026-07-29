import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MODELS, type ModelDef } from './models';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let model: THREE.Object3D | null = null;
let edgeMat: LineMaterial;
let screenMesh: THREE.Mesh | null = null;
let bodyShell: THREE.MeshPhysicalMaterial | null = null;
let bodyMid: THREE.MeshPhysicalMaterial | null = null;
let bodyDetail: THREE.MeshPhysicalMaterial | null = null;
let screenMat: THREE.MeshPhysicalMaterial | null = null;
let ambientLight: THREE.AmbientLight | null = null;
let keyLight: THREE.DirectionalLight | null = null;
let fillLight: THREE.DirectionalLight | null = null;

let currentIndex = Math.floor(Math.random() * MODELS.length);
let isLoadingModel = false;
let targetScale = 1;

const clock = new THREE.Clock();
const MOBILE_BP = 768;

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
    camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
    camera.position.set(0, 0.5, 4.5);

    // Controls
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.04;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.62;

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
    screenMesh = null;
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
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());

            model.position.sub(center);
            model.rotation.y = def.rotationY ?? 0;
            model.position.y += 0.05;

            const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scaleFactor = (def.fit ?? 1.5) / maxDim;
            targetScale = scaleFactor;
            // Pop-in: start slightly small, animate() eases toward targetScale
            model.scale.setScalar(scaleFactor * 0.85);

            // ─────────────────────────────────────────────────────────────────
            // Materials
            // ─────────────────────────────────────────────────────────────────
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

            bodyShell = makeBodyMat();
            bodyMid = makeBodyMat({
                color: 0x858590,
                roughness: 0.25,
                opacity: 0.30,
                clearcoat: 0.5,
            });
            bodyDetail = makeBodyMat({
                color: 0x9a9aa0,
                roughness: 0.5,
                opacity: 0.42,
                metalness: 0.18,
            });

            screenMat = new THREE.MeshPhysicalMaterial({
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
            const bodyParts: { mesh: THREE.Mesh; vol: number }[] = [];

            model.traverse((child) => {
                if (!(child instanceof THREE.Mesh)) return;
                const n = (child.name || '').toLowerCase();

                if (n === 'screen') {
                    child.material = screenMat;
                    child.renderOrder = 1;
                    screenMesh = child;
                } else {
                    child.geometry.computeBoundingBox();
                    const s = child.geometry.boundingBox!.getSize(new THREE.Vector3());
                    bodyParts.push({ mesh: child, vol: s.x * s.y * s.z });
                }
            });

            // Assign materials by volume (3 tiers)
            bodyParts.sort((a, b) => b.vol - a.vol);
            const t1 = Math.ceil(bodyParts.length / 3);
            const t2 = Math.ceil(bodyParts.length * 2 / 3);

            bodyParts.forEach((p, i) => {
                p.mesh.material = i < t1 ? bodyShell! :
                    i < t2 ? bodyMid! : bodyDetail!;
            });

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

    if (isMobile) {
        // On mobile, canvas is 60vh
        const canvasH = h * 0.6;
        camera.aspect = w / canvasH;
        camera.fov = 28;
        camera.position.set(0, 0.5, 4.8);
        renderer.setSize(w, canvasH, false);
    } else {
        camera.aspect = w / h;
        camera.fov = 24;
        camera.position.set(0, 0.5, 4.5);
        renderer.setSize(w, h, false);
    }

    camera.updateProjectionMatrix();
    if (edgeMat) edgeMat.resolution.set(w, isMobile ? h * 0.6 : h);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (model) {
        model.position.y = 0.05 + Math.sin(t * 0.7) * 0.025;
        // Ease scale toward target (pop-in on model switch)
        const s = model.scale.x + (targetScale - model.scale.x) * 0.08;
        model.scale.setScalar(s);
    }

    controls.update();
    renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════

let isDarkMode = false;

function applyTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = 'LIGHT';
        themeToggle.classList.add('active');
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.textContent = 'DARK';
        themeToggle.classList.remove('active');
    }

    // Update Three.js materials and lighting for theme
    if (!ambientLight) return; // Three.js not initialized yet

    if (isDarkMode) {
        // Edge lines: brighter and more opaque
        if (edgeMat) {
            edgeMat.color.set(0xaaaaaa);
            edgeMat.opacity = 0.5;
        }
        // Body materials: increase opacity
        if (bodyShell) bodyShell.opacity = 0.08;
        if (bodyMid) bodyMid.opacity = 0.50;
        if (bodyDetail) bodyDetail.opacity = 0.60;
        // Lighting: increase intensity
        ambientLight.intensity = 3.0;
        if (keyLight) keyLight.intensity = 3.5;
        if (fillLight) fillLight.intensity = 2.5;
        // Screen: brighter emissive
        if (screenMat) screenMat.emissiveIntensity = 0.4;
    } else {
        // Edge lines: original values
        if (edgeMat) {
            edgeMat.color.set(0x222222);
            edgeMat.opacity = 0.25;
        }
        // Body materials: original opacity
        if (bodyShell) bodyShell.opacity = 0.03;
        if (bodyMid) bodyMid.opacity = 0.30;
        if (bodyDetail) bodyDetail.opacity = 0.42;
        // Lighting: original intensity
        ambientLight.intensity = 2.0;
        if (keyLight) keyLight.intensity = 2.5;
        if (fillLight) fillLight.intensity = 1.5;
        // Screen: original emissive
        if (screenMat) screenMat.emissiveIntensity = 0.15;
    }
}

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('portfolio-theme');
isDarkMode = savedTheme === 'dark';
applyTheme();

// Theme toggle event listener
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        localStorage.setItem('portfolio-theme', isDarkMode ? 'dark' : 'light');
        applyTheme();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

initThree();
animate();
