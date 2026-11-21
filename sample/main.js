import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SHADERS
// ═══════════════════════════════════════════════════════════════════════════════

const PixelDitherShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        varying vec2 vUv;

        float bayer4(vec2 p) {
            ivec2 c = ivec2(mod(p, 4.0));
            int idx = c.x + c.y * 4;
            float m[16];
            m[0]  =  0.0/16.0; m[1]  =  8.0/16.0; m[2]  =  2.0/16.0; m[3]  = 10.0/16.0;
            m[4]  = 12.0/16.0; m[5]  =  4.0/16.0; m[6]  = 14.0/16.0; m[7]  =  6.0/16.0;
            m[8]  =  3.0/16.0; m[9]  = 11.0/16.0; m[10] =  1.0/16.0; m[11] =  9.0/16.0;
            m[12] = 15.0/16.0; m[13] =  7.0/16.0; m[14] = 13.0/16.0; m[15] =  5.0/16.0;
            return m[idx];
        }

        void main() {
            float pixelSize = 2.0;
            vec2 snapped = floor(vUv * resolution / pixelSize) * pixelSize / resolution;
            vec4 color = texture2D(tDiffuse, snapped);

            vec2 px = vUv * resolution;
            float d = bayer4(px) - 0.5;
            float levels = 32.0;
            color.rgb += d * (1.0 / levels);
            color.rgb = floor(color.rgb * levels + 0.5) / levels;

            gl_FragColor = color;
        }
    `,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
    teal: '#2a6878',
    val: '#111',
    green: '#2a7858',
    amber: '#107090',
    pink: '#405898',
    purple: '#485890',
    cyan: '#1a6080',
    dim: '#d0d0d0',
    txt: '#777',
};

let scene, camera, renderer, composer, controls, fxPass, edgeMat;
let model;
const clock = new THREE.Clock();
let frame = 0;

let gbaEmu = null;
let gbaTexture = null;
let screenMesh = null;
let screenMatOriginal = null;
let emuRunning = false;
let zoomTarget = null;
const prevRegs = new Uint32Array(16);
let frameCount = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// EMULATOR INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

function initEmulator() {
    if (typeof GameBoyAdvance === 'undefined') return;

    gbaEmu = new GameBoyAdvance();
    gbaEmu.setRenderPath(new GameBoyAdvanceSoftwareRenderer());
    gbaEmu.logLevel = gbaEmu.LOG_ERROR;

    const gbaCanvas = document.getElementById('gba-canvas');
    gbaEmu.setCanvas(gbaCanvas);

    const texSource = gbaEmu.indirectCanvas || gbaCanvas;
    gbaTexture = new THREE.CanvasTexture(texSource);
    gbaTexture.minFilter = THREE.NearestFilter;
    gbaTexture.magFilter = THREE.NearestFilter;
    gbaTexture.colorSpace = THREE.SRGBColorSpace;

    const loadMask = document.getElementById('load-mask');
    const unloadBtn = document.getElementById('unload-btn');
    const savedOpacities = new Map();

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    function showMask(msg) {
        loadMask.querySelector('.mask-text').textContent = msg || 'LOADING ROM...';
        loadMask.classList.remove('hidden');
    }

    function hideMask() {
        loadMask.classList.add('hidden');
    }

    function setBodyDim(dim) {
        if (model) {
            model.traverse(child => {
                if (!child.isMesh || !child.material || !child.material.transparent) return;
                if (!savedOpacities.has(child)) savedOpacities.set(child, child.material.opacity);
                const base = savedOpacities.get(child);
                child.material.opacity = dim ? base * 0.4 : base;
            });
        }
        if (edgeMat) edgeMat.opacity = dim ? 0.08 : 0.25;
    }

    function resetAndStart(name) {
        if (emuRunning) {
            gbaEmu.pause();
            emuRunning = false;
        }
        document.getElementById('rom-name').textContent = name.toUpperCase();

        if (gbaEmu.audio && gbaEmu.audio.context) gbaEmu.audio.context.resume();

        gbaEmu.runStable();
        emuRunning = true;
        applyScreenTexture();
        setBodyDim(true);
        unloadBtn.style.display = '';
        zoomTarget = { pos: new THREE.Vector3(0, 0, 3.5), target: new THREE.Vector3(0, 0.05, 0) };
        hideMask();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Listeners
    // ─────────────────────────────────────────────────────────────────────────

    unloadBtn.addEventListener('click', () => {
        if (emuRunning) {
            gbaEmu.pause();
            emuRunning = false;
        }
        gbaEmu.reset();
        document.getElementById('rom-name').textContent = '';
        unloadBtn.style.display = 'none';
        document.getElementById('rom-select').selectedIndex = 0;
        setBodyDim(false);

        if (screenMesh && screenMatOriginal) {
            screenMesh.material = screenMatOriginal;
        }
        zoomTarget = { pos: new THREE.Vector3(0, 0.5, 4.5), target: new THREE.Vector3(0, 0, 0) };
    });

    document.getElementById('rom-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showMask('LOADING ' + file.name.replace(/\.\w+$/, '').toUpperCase() + '...');

        gbaEmu.loadRomFromFile(file, (result) => {
            if (result) resetAndStart(file.name.replace(/\.\w+$/, ''));
            else hideMask();
        });
    });

    const romSelect = document.getElementById('rom-select');
    romSelect.addEventListener('change', (e) => {
        const url = e.target.value;
        if (!url) return;

        const label = e.target.options[e.target.selectedIndex].text;
        showMask('LOADING ' + label.toUpperCase() + '...');

        fetch(url)
            .then(r => r.arrayBuffer())
            .then(buf => {
                if (gbaEmu.setRom(buf)) resetAndStart(label);
                else hideMask();
            })
            .catch(() => hideMask());
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Keyboard Mapping
    // ─────────────────────────────────────────────────────────────────────────
    const keyMap = {
        'ArrowUp': gbaEmu.keypad.UP,
        'ArrowDown': gbaEmu.keypad.DOWN,
        'ArrowLeft': gbaEmu.keypad.LEFT,
        'ArrowRight': gbaEmu.keypad.RIGHT,
        'z': gbaEmu.keypad.A, 'Z': gbaEmu.keypad.A,
        'x': gbaEmu.keypad.B, 'X': gbaEmu.keypad.B,
        'Enter': gbaEmu.keypad.START,
        'Backspace': gbaEmu.keypad.SELECT,
        'Shift': gbaEmu.keypad.SELECT,
        'a': gbaEmu.keypad.L, 'A': gbaEmu.keypad.L,
        's': gbaEmu.keypad.R, 'S': gbaEmu.keypad.R,
    };

    window.addEventListener('keydown', (e) => {
        if (!emuRunning) return;
        if (keyMap[e.key] !== undefined) {
            gbaEmu.keypad.pressKey(keyMap[e.key]);
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!emuRunning) return;
        if (keyMap[e.key] !== undefined) {
            gbaEmu.keypad.releaseKey(keyMap[e.key]);
            e.preventDefault();
        }
    });
}

function applyScreenTexture() {
    if (!screenMesh || !gbaTexture) return;

    gbaTexture.colorSpace = THREE.SRGBColorSpace;

    screenMesh.material = new THREE.MeshStandardMaterial({
        map: gbaTexture,
        emissiveMap: gbaTexture,
        emissive: new THREE.Color(1.0, 1.0, 1.0),
        emissiveIntensity: 0.8,
        metalness: 0.0,
        roughness: 1.0,
        envMapIntensity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: true,
    });
    screenMesh.renderOrder = 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREE.JS SCENE SETUP
// ═══════════════════════════════════════════════════════════════════════════════

function initThree() {
    const canvas = document.getElementById('three-canvas');

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    window.renderer = renderer;

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
    controls.autoRotate = false;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.62;

    // Lighting
    scene.add(new THREE.AmbientLight(0x405570, 2.0));

    const keyLight = new THREE.DirectionalLight(0xc0d8f0, 2.5);
    keyLight.position.set(3, 5, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x90a8c8, 1.5);
    fillLight.position.set(-4, 2, 4);
    scene.add(fillLight);

    handleResize();

    // Post-processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
        0.15, 0.3, 0.92
    ));

    fxPass = new ShaderPass(PixelDitherShader);
    fxPass.uniforms.resolution.value.set(
        renderer.domElement.width,
        renderer.domElement.height
    );
    composer.addPass(fxPass);

    window.addEventListener('resize', handleResize);
    loadModel();
}

function handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);

    if (composer) composer.setSize(w, h);
    if (fxPass) fxPass.uniforms.resolution.value.set(w, h);
    if (edgeMat) edgeMat.resolution.set(w, h);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL LOADING
// ═══════════════════════════════════════════════════════════════════════════════

function loadModel() {
    const loader = new GLTFLoader();
    const fill = document.querySelector('.loader-fill');

    loader.load('gba.glb',
        (gltf) => {
            model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());

            model.position.sub(center);
            model.rotation.y = -Math.PI / 2;
            model.position.y += 0.05;

            const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scaleFactor = 1.5 / maxDim;
            model.scale.setScalar(scaleFactor);

            // ─────────────────────────────────────────────────────────────────────
            // Materials
            // ─────────────────────────────────────────────────────────────────────
            function makeBodyMat(opts = {}) {
                return new THREE.MeshPhysicalMaterial({
                    color: 0x494949,
                    metalness: opts.metalness ?? 0.1,
                    roughness: opts.roughness ?? 0.35,
                    envMapIntensity: 0.5,
                    transparent: true,
                    opacity: 0.03,
                    side: THREE.DoubleSide,
                    clearcoat: opts.clearcoat ?? 0.3,
                    clearcoatRoughness: 0.15,
                    specularIntensity: opts.specularIntensity ?? 0.3,
                    specularColor: new THREE.Color(opts.specColor || 0xa0a0a8),
                    depthWrite: false,
                });
            }

            const bodyShell = makeBodyMat();
            const bodyMid = makeBodyMat({
                color: 0x858590,
                roughness: 0.25,
                opacity: 0.30,
                clearcoat: 0.5,
                transmission: 0.15
            });
            const bodyDetail = makeBodyMat({
                color: 0x9a9aa0,
                roughness: 0.5,
                opacity: 0.42,
                metalness: 0.18,
                transmission: 0.05,
                thickness: 0.3
            });

            const screenMat = new THREE.MeshPhysicalMaterial({
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

            // ─────────────────────────────────────────────────────────────────────
            // Mesh Processing
            // ─────────────────────────────────────────────────────────────────────
            const bodyParts = [];

            model.traverse(child => {
                if (!child.isMesh) return;
                const n = (child.name || '').toLowerCase();

                if (n === 'screen') {
                    child.material = screenMat;
                    child.renderOrder = 1;
                    screenMesh = child;
                    screenMatOriginal = screenMat;

                    // Fix UVs for screen
                    const geo = child.geometry;
                    const pos = geo.attributes.position;
                    geo.computeBoundingBox();
                    const bb = geo.boundingBox;
                    const ex = bb.max.x - bb.min.x;
                    const ey = bb.max.y - bb.min.y;
                    const ez = bb.max.z - bb.min.z;

                    const flatAxis = (ex <= ey && ex <= ez) ? 0 :
                        (ey <= ex && ey <= ez) ? 1 : 2;

                    const uvArr = new Float32Array(pos.count * 2);
                    for (let i = 0; i < pos.count; i++) {
                        const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
                        const mins = [bb.min.x, bb.min.y, bb.min.z];
                        const exts = [ex, ey, ez];
                        let uAxis, vAxis;

                        if (flatAxis === 0) { uAxis = 2; vAxis = 1; }
                        else if (flatAxis === 1) { uAxis = 0; vAxis = 2; }
                        else { uAxis = 0; vAxis = 1; }

                        uvArr[i * 2] = exts[vAxis] > 0.001 ? 1.0 - (p[vAxis] - mins[vAxis]) / exts[vAxis] : 0.5;
                        uvArr[i * 2 + 1] = exts[uAxis] > 0.001 ? 1.0 - (p[uAxis] - mins[uAxis]) / exts[uAxis] : 0.5;
                    }
                    geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
                } else {
                    child.geometry.computeBoundingBox();
                    const s = child.geometry.boundingBox.getSize(new THREE.Vector3());
                    bodyParts.push({ mesh: child, vol: s.x * s.y * s.z });
                }
            });

            // Assign materials by volume
            bodyParts.sort((a, b) => b.vol - a.vol);
            const t1 = Math.ceil(bodyParts.length / 3);
            const t2 = Math.ceil(bodyParts.length * 2 / 3);

            bodyParts.forEach((p, i) => {
                p.mesh.material = i < t1 ? bodyShell :
                    i < t2 ? bodyMid : bodyDetail;
            });

            scene.add(model);

            // Create edge lines
            const meshes = [];
            model.traverse(child => {
                if (child.isMesh) meshes.push(child);
            });

            meshes.forEach(child => {
                const edges = new THREE.EdgesGeometry(child.geometry, 8);
                const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
                const line = new LineSegments2(lineGeo, edgeMat);

                line.position.copy(child.position);
                line.quaternion.copy(child.quaternion);
                line.scale.copy(child.scale);
                line.renderOrder = 3;
                line.computeLineDistances();

                child.parent.add(line);
            });

            if (fill) fill.style.width = '100%';
            setTimeout(() => document.getElementById('loader').classList.add('hidden'), 600);
        },
        (xhr) => {
            if (fill && xhr.total > 0) {
                fill.style.width = (xhr.loaded / xhr.total * 100) + '%';
            }
        },
        (err) => {
            console.error('Model load error:', err);
            document.querySelector('.loader-text').textContent = 'LOAD ERROR';
        }
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL UPDATE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const h32 = v => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const h16 = v => '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
const h8 = v => '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
const bar = (n, t) => '\u2588'.repeat(Math.max(0, Math.min(n, t))) + '\u2591'.repeat(Math.max(0, t - Math.max(0, n)));

function countUsed(memRegion, maxSize) {
    try {
        const buf = memRegion.buffer || memRegion.vram || memRegion;
        if (!buf || !buf.byteLength) return 0;

        const view = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf);
        const len = Math.min(view.length, maxSize);
        const step = Math.max(1, len >> 8);
        let nonZero = 0;

        for (let i = 0; i < len; i += step) {
            if (view[i] !== 0) nonZero++;
        }
        return nonZero / (len / step);
    } catch (e) {
        return 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function updateCPU() {
    const el = document.getElementById('pc-cpu');
    if (!el) return;

    const names = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7',
        'R8', 'R9', 'R10', 'R11', 'R12', 'SP', 'LR', 'PC'];

    let h = '<div class="cpu-grid">';
    for (let i = 0; i < 16; i++) {
        const val = (emuRunning && gbaEmu) ? (gbaEmu.cpu.gprs[i] >>> 0) : 0;
        const cls = val !== prevRegs[i] ? 'rv ch' : 'rv';
        h += `<div class="rr"><span class="rn">${names[i].padEnd(3)}</span><span class="${cls}">${h32(val)}</span></div>`;
        prevRegs[i] = val;
    }
    el.innerHTML = h + '</div>';
}

function updateFlags() {
    const el = document.getElementById('pc-flags');
    if (!el) return;

    const cpu = (emuRunning && gbaEmu) ? gbaEmu.cpu : null;
    const N = cpu ? (cpu.cpsrN ? 1 : 0) : 0;
    const Z = cpu ? (cpu.cpsrZ ? 1 : 0) : 0;
    const Cf = cpu ? (cpu.cpsrC ? 1 : 0) : 0;
    const V = cpu ? (cpu.cpsrV ? 1 : 0) : 0;
    const I = cpu ? (cpu.cpsrI ? 1 : 0) : 0;
    const F = cpu ? (cpu.cpsrF ? 1 : 0) : 0;
    const T = cpu ? (cpu.execMode === 1 ? 1 : 0) : 0;

    const modeMap = {
        16: 'USR', 17: 'FIQ', 18: 'IRQ', 19: 'SVC',
        23: 'ABT', 27: 'UND', 31: 'SYS'
    };
    const modeName = cpu ? (modeMap[cpu.mode] || h8(cpu.mode)) : '---';

    el.innerHTML =
        `<span class="rn">N:</span> <span class="rv">${N}</span>  <span class="rn">Z:</span> <span class="rv">${Z}</span>\n` +
        `<span class="rn">C:</span> <span class="rv">${Cf}</span>  <span class="rn">V:</span> <span class="rv">${V}</span>\n\n` +
        `<span class="rn">I:</span> <span class="rv">${I}</span>  <span class="rn">F:</span> <span class="rv">${F}</span>  <span class="rn">T:</span> <span class="rv">${T}</span>\n` +
        `<span class="rn">MODE:</span> <span class="rv" style="color:${C.amber}">${modeName}</span>`;
}

function updateDisp() {
    const el = document.getElementById('pc-disp');
    if (!el) return;

    const rp = (emuRunning && gbaEmu) ? gbaEmu.video.renderPath : null;
    const vid = (emuRunning && gbaEmu) ? gbaEmu.video : null;

    const mode = rp ? rp.backgroundMode : 0;
    const bg0 = rp ? !!rp.bg[0].enabled : false;
    const bg1 = rp ? !!rp.bg[1].enabled : false;
    const bg2 = rp ? !!rp.bg[2].enabled : false;
    const bg3 = rp ? !!rp.bg[3].enabled : false;
    const obj = rp ? !!rp.objLayers[0].enabled : false;
    const win = rp ? !!(rp.win0 || rp.win1 || rp.objwin) : false;
    const vc = vid ? vid.vcount : 0;
    const hb = vid ? (vid.inHblank ? 8 : Math.floor((vc % 4) * 2)) : 0;

    const onOff = (v, pad) => v
        ? `<span class="rv on">ON${pad ? ' ' : ''}</span>`
        : `<span class="rv off">OFF</span>`;

    el.innerHTML =
        `<span class="rn">MODE:</span>   <span class="rv">${mode}</span>\n` +
        `<span class="rn">BG0:</span> ${onOff(bg0, true)} <span class="rn">BG1:</span> ${onOff(bg1)}\n` +
        `<span class="rn">BG2:</span> ${onOff(bg2)} <span class="rn">BG3:</span> ${onOff(bg3)}\n` +
        `<span class="rn">OBJ:</span> ${onOff(obj, true)} <span class="rn">WIN:</span> ${onOff(win)}\n\n` +
        `<span class="rn">HBLANK:</span> <span class="rv">${bar(hb, 8)}</span>\n` +
        `<span class="rn">VCOUNT:</span> <span class="rv">${h8(vc >= 0 ? vc : 0)}</span>`;
}

function updateBG() {
    const el = document.getElementById('pc-bg');
    if (!el) return;

    const rp = (emuRunning && gbaEmu) ? gbaEmu.video.renderPath : null;
    let h = '';

    for (let i = 0; i < 4; i++) {
        const bg = rp ? rp.bg[i] : null;
        const pri = bg ? bg.priority : i;
        const cbb = bg ? (bg.charBase >> 14) : 0;
        const sbb = bg ? (bg.screenBase >> 11) : 0;
        h += `<span class="rn">BG${i}</span> PRI=<span class="rv">${pri}</span> CBB=<span class="rv">${cbb}</span> SBB=<span class="rv">${sbb}</span>\n`;
    }

    const bg0 = rp ? rp.bg[0] : null;
    const hofs = bg0 ? (bg0.x & 0x1FF) : 0;
    const vofs = bg0 ? (bg0.y & 0x1FF) : 0;

    h += `\n<span class="rn">HOFS:</span> <span class="rv">${h16(hofs)}</span>\n`;
    h += `<span class="rn">VOFS:</span> <span class="rv">${h16(vofs)}</span>`;
    el.innerHTML = h;
}

function updatePal() {
    const el = document.getElementById('pc-pal');
    if (!el) return;

    const pal = (emuRunning && gbaEmu) ? gbaEmu.video.renderPath.palette : null;
    let h = '<div class="pg">';

    for (let i = 0; i < 30; i++) {
        let r = 0, g = 0, b = 0;
        if (pal && pal.colors && pal.colors[0]) {
            const c = pal.colors[0][i] || 0;
            r = (c & 0x1F) << 3;
            g = ((c >> 5) & 0x1F) << 3;
            b = ((c >> 10) & 0x1F) << 3;
        }
        h += `<div class="ps" style="background:rgb(${r},${g},${b})"></div>`;
    }
    el.innerHTML = h + '</div>';
}

function updateOAM() {
    const el = document.getElementById('pc-oam');
    if (!el) return;

    const oam = (emuRunning && gbaEmu) ? gbaEmu.video.renderPath.oam : null;
    let h = '';
    let shown = 0;

    for (let i = 0; i < 128 && shown < 6; i++) {
        const spr = oam ? oam.objs[i] : null;
        if (spr && !spr.disable) {
            const w = spr.cachedWidth || 8;
            const hh = spr.cachedHeight || 8;
            h += `<span class="rn">OBJ${i}</span> <span class="rv">(${String(spr.x).padStart(3)},${String(spr.y).padStart(3)})</span> ${w}x${hh}\n`;
            shown++;
        }
    }

    if (shown === 0) {
        for (let i = 0; i < 6; i++) {
            h += `<span class="rn">OBJ${i}</span> <span class="rv">(  0,  0)</span> ---\n`;
        }
    }
    el.innerHTML = h;
}

function updateMem() {
    const el = document.getElementById('pc-mem');
    if (!el) return;

    let biosP = 0, ewramP = 0, iwramP = 0, ioP = 0, vramP = 0, romP = 0;

    if (emuRunning && gbaEmu) {
        biosP = 1.0;
        const romMem = gbaEmu.rom && gbaEmu.rom.memory;
        romP = romMem ? Math.min((romMem.byteLength || romMem.length || 0) / (32 * 1024 * 1024), 1.0) : 0;

        const mmu = gbaEmu.mmu;
        ewramP = countUsed(mmu.memory[2], 256 * 1024);
        iwramP = countUsed(mmu.memory[3], 32 * 1024);
        ioP = 0.3;
        vramP = countUsed(gbaEmu.video.renderPath.vram, 96 * 1024);
    }

    const regions = [
        ['BIOS', biosP, C.cyan],
        ['EWRAM', ewramP, C.green],
        ['IWRAM', iwramP, C.green],
        ['I/O', ioP, C.amber],
        ['VRAM', vramP, C.teal],
        ['ROM', romP, C.pink],
    ];

    el.innerHTML = regions.map(([n, p, c]) =>
        `<div class="mb"><span class="ml">${n}</span><div class="mbar"><div class="mfill" style="width:${p * 100}%;background:${c}"></div></div></div>`
    ).join('');
}

function updateVRAM() {
    const el = document.getElementById('pc-vram');
    if (!el) return;

    let bgP = 0, objP = 0, tileCount = 0, mapCount = 0;

    if (emuRunning && gbaEmu) {
        const rp = gbaEmu.video.renderPath;
        const vram = rp.vram.vram || rp.vram;

        if (vram && vram.length) {
            const bgEndIdx = 0x10000 >> 1;
            const totalIdx = Math.min(0x18000 >> 1, vram.length);
            let bgUsed = 0, objUsed = 0;
            const step = 32;

            for (let i = 0; i < Math.min(bgEndIdx, vram.length); i += step) {
                if (vram[i] !== 0) bgUsed++;
            }
            bgP = bgUsed / (Math.min(bgEndIdx, vram.length) / step);

            for (let i = bgEndIdx; i < totalIdx; i += step) {
                if (vram[i] !== 0) objUsed++;
            }
            const objRange = totalIdx - bgEndIdx;
            objP = objRange > 0 ? objUsed / (objRange / step) : 0;
        }

        tileCount = Math.round(bgP * 2048);
        let activeMaps = 0;
        for (let i = 0; i < 4; i++) {
            if (rp.bg[i].enabled) activeMaps++;
        }
        mapCount = activeMaps;
    }

    el.innerHTML =
        `<span class="rn">BG VRAM</span>\n` +
        `<div class="mb"><div class="mbar"><div class="mfill" style="width:${bgP * 100}%;background:${C.cyan}"></div></div></div>\n` +
        `<span class="rn">OBJ VRAM</span>\n` +
        `<div class="mb"><div class="mbar"><div class="mfill" style="width:${objP * 100}%;background:${C.amber}"></div></div></div>\n\n` +
        `<span class="rn">TILES:</span> <span class="rv">${tileCount}/2048</span>\n` +
        `<span class="rn">MAPS :</span> <span class="rv">${mapCount}/4</span>`;
}

function updateDMA() {
    const el = document.getElementById('pc-dma');
    if (!el) return;

    const irq = (emuRunning && gbaEmu) ? gbaEmu.irq : null;
    const chs = [];

    for (let i = 0; i < 4; i++) {
        const dma = irq ? irq.dma[i] : null;
        const on = dma ? !!dma.enable : false;
        const p = (dma && dma.enable && dma.count > 0)
            ? Math.min(1, (dma.nextCount || 0) / Math.max(1, dma.count))
            : 0;
        chs.push([i, on, on ? Math.max(0.1, 1 - p) : 0]);
    }

    el.innerHTML = chs.map(([i, on, p]) =>
        `<div class="dc"><span class="dl">CH${i}</span>` +
        `<div class="db"><div class="df" style="width:${p * 100}%;background:${on ? C.green : C.dim}"></div></div>` +
        `<span class="ds ${on ? 'on' : 'off'}">${on ? 'ACTIVE' : 'IDLE'}</span></div>`
    ).join('');
}

function updateTimer() {
    const el = document.getElementById('pc-timer');
    if (!el) return;

    const irq = (emuRunning && gbaEmu) ? gbaEmu.irq : null;
    const prescaleMap = { 0: '16MHz', 6: '262kHz', 8: '65kHz', 10: '16kHz' };
    const tms = [];

    for (let i = 0; i < 4; i++) {
        const tm = irq ? irq.timers[i] : null;
        if (tm && tm.enable) {
            let val = 0;
            try { val = irq.timerRead(i); } catch (e) { val = tm.reload; }
            const mode = tm.countUp ? 'CASCADE' : (prescaleMap[tm.prescaleBits] || '16MHz');
            const p = val / 0xFFFF;
            tms.push([i, val, p, mode]);
        } else {
            tms.push([i, 0, 0, 'STOPPED']);
        }
    }

    el.innerHTML = tms.map(([i, v, p, m]) =>
        `<div class="tr"><span class="tl">TM${i}</span>` +
        `<span class="rv" style="min-width:48px">${h16(v)}</span>` +
        `<div class="tbar"><div class="tfill" style="width:${p * 100}%;background:${p > 0 ? C.teal : C.dim}"></div></div>` +
        `<span class="rn" style="font-size:8px;min-width:50px;text-align:right">${m}</span></div>`
    ).join('');
}

function updateIRQ() {
    const el = document.getElementById('pc-irq');
    if (!el) return;

    const irqNames = ['VBLANK', 'HBLANK', 'VCOUNT', 'TM0', 'TM1', 'TM2', 'TM3',
        'SIO', 'DMA0', 'DMA1', 'DMA2', 'DMA3', 'KEY', 'GPAK'];
    const irq = (emuRunning && gbaEmu) ? gbaEmu.irq : null;

    const ieVal = irq ? irq.enabledIRQs : 0;
    const ifVal = irq ? irq.interruptFlags : 0;
    const ime = irq ? irq.enable : false;

    const ie = irqNames.filter((_, i) => ieVal & (1 << i));
    const iflag = irqNames.filter((_, i) => ifVal & (1 << i));

    el.innerHTML =
        `<span class="rn">IE:</span>  <span class="rv">${ie.slice(0, 4).join(' ') || 'NONE'}</span>\n` +
        `<span class="rn">IF:</span>  <span class="rv" style="color:${C.amber}">${iflag.slice(0, 3).join(' ') || '-'}</span>\n\n` +
        `<span class="rn">IME:</span> <span class="rv ${ime ? 'on' : 'off'}">${ime ? 'ENABLED' : 'DISABLED'}</span>\n` +
        `<span class="rn">HALT:</span><span class="rv"> ${(irq && !irq.enable) ? 'YES' : 'NO'}</span>`;
}

function updateStatus() {
    const el = document.getElementById('pc-status');
    if (!el) return;

    if (emuRunning && gbaEmu) {
        frameCount++;
        const cycles = gbaEmu.cpu.cycles;
        const vbl = gbaEmu.video.inVblank;
        const dot = vbl ? '\u25CF' : '\u25CB';

        el.innerHTML =
            `<span style="color:${C.teal}">\u25B8</span> ` +
            `FRAME: <span class="rv">${frameCount}</span>  <span style="color:${C.txt}">|</span>  ` +
            `CYCLE: <span class="rv">${h32(cycles)}</span>  <span style="color:${C.txt}">|</span>  ` +
            `VBLANK <span style="color:${C.green}">${dot}</span>`;
    } else {
        el.innerHTML =
            `<span style="color:${C.teal}">\u25B8</span> ` +
            `<span style="color:${C.amber}">WAITING FOR ROM</span>`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════════

let tick = 0;

function updatePanels(t) {
    tick++;
    updateStatus();

    if (tick % 10 === 0) {
        updateCPU();
        updateFlags();
        updateDisp();
        updateDMA();
        updateTimer();
    }

    if (tick % 10 === 0) {
        updateBG();
        updateMem();
        updateVRAM();
        updateIRQ();
    }

    if (tick % 10 === 0) {
        updatePal();
        updateOAM();
    }
}

function animate() {
    requestAnimationFrame(animate);
    frame++;
    const t = clock.getElapsedTime();

    if (model) {
        model.position.y = 0.05 + Math.sin(t * 0.7) * 0.025;
    }

    if (emuRunning && gbaTexture) {
        gbaTexture.needsUpdate = true;
    }

    if (zoomTarget) {
        camera.position.lerp(zoomTarget.pos, 0.03);
        controls.target.lerp(zoomTarget.target, 0.03);
        if (camera.position.distanceTo(zoomTarget.pos) < 0.01) zoomTarget = null;
    }

    controls.update();
    if (hdMode) renderer.render(scene, camera);
    else composer.render();
    updatePanels(t);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT BINDINGS & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const aboutOverlay = document.getElementById('about-overlay');

document.getElementById('about-btn').addEventListener('click', () => {
    aboutOverlay.classList.remove('hidden');
});

document.getElementById('about-close').addEventListener('click', () => {
    aboutOverlay.classList.add('hidden');
});

aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) aboutOverlay.classList.add('hidden');
});

// HD Toggle
let hdMode = false;

function applyHdMode() {
    document.getElementById('hd-toggle').classList.toggle('active', hdMode);
    renderer.setPixelRatio(hdMode ? window.devicePixelRatio : 1);
    renderer.toneMapping = hdMode ? THREE.NoToneMapping : THREE.AgXToneMapping;
    renderer.toneMappingExposure = hdMode ? 1.0 : 1.05;
    document.getElementById('scanlines').style.display = hdMode ? 'none' : '';
    document.getElementById('dither').style.display = hdMode ? 'none' : '';
    if (scene) scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    handleResize();
}

document.getElementById('hd-toggle').addEventListener('click', () => {
    hdMode = !hdMode;
    localStorage.setItem('gba-hd', hdMode ? '1' : '0');
    applyHdMode();
});

// Initial Setup
initThree();
initEmulator();

hdMode = localStorage.getItem('gba-hd') !== '0';
applyHdMode();

updateCPU();
updateFlags();
updateDisp();
updateBG();
updatePal();
updateOAM();
updateMem();
updateVRAM();
updateDMA();
updateTimer();
updateIRQ();
updateStatus();

animate();