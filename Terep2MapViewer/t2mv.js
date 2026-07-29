import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MAP_SIZE = 256;   // map dimension
const TILE_SIZE = 16;   // 16x16 tile in MAPTEX.PCX

const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggle-btn');

function decodePCX(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    const HEADER_SIZE = 128;
    const PALETTE_SIZE = 768;

    const id = bytes[0];
    const version = bytes[1];
    const encoding = bytes[2];
    const bpp = bytes[3];
    const colorPlanes = bytes[65];

    if (id !== 0x0A || version !== 5 || encoding !== 1 || bpp !== 8 || colorPlanes !== 1) {
        throw new Error("Invalid PCX file.");
    }

    const minX = view.getUint16(4, true);
    const minY = view.getUint16(6, true);
    const maxX = view.getUint16(8, true);
    const maxY = view.getUint16(10, true);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    if (width < MAP_SIZE || height < MAP_SIZE) {
        throw new Error("Invalid PCX dimensions.");
    }

    const bytesPerLine = view.getUint16(66, true);

    const paletteOffset = bytes.length - PALETTE_SIZE;
    const palette = new Uint8Array(PALETTE_SIZE);
    for (let i = 0; i < PALETTE_SIZE; i++) {
        palette[i] = bytes[paletteOffset + i];
    }

    let offset = HEADER_SIZE;
    const indices = new Uint8Array(MAP_SIZE * MAP_SIZE);
    const RLE_COUNT_MASK = 0xC0; 

    for (let y = 0; y < MAP_SIZE; y++) {
        let x = 0;
        let scanlineBytes = 0;

        while (scanlineBytes < bytesPerLine) {
            let bytee = bytes[offset++];
            let count = 1;

            if ((bytee & RLE_COUNT_MASK) === RLE_COUNT_MASK) {
                count = bytee & ~RLE_COUNT_MASK;
                bytee = bytes[offset++];
            }

            for (let j = 0; j < count; j++) {
                if (x < MAP_SIZE) {
                    indices[y * MAP_SIZE + x] = bytee;
                }
                x++;
                scanlineBytes++;
            }
        }
    }

    return { indices, palette };
}

function parsePCXHeightmap(arrayBuffer) {
  const { indices } = decodePCX(arrayBuffer);
  return indices;
}

function parsePCXTexture(arrayBuffer) {
    const { indices, palette } = decodePCX(arrayBuffer);

    const canvas = document.createElement('canvas');
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(MAP_SIZE, MAP_SIZE);

    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
        const colorIdx = indices[i];
        const pixelIdx = i * 4;
        imgData.data[pixelIdx]     = palette[colorIdx * 3];         // R
        imgData.data[pixelIdx + 1] = palette[colorIdx * 3 + 1];     // G
        imgData.data[pixelIdx + 2] = palette[colorIdx * 3 + 2];     // B
        imgData.data[pixelIdx + 3] = 255;                           // A
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

function parsePCXTileMap(colBuffer, maptexBuffer) {
    const colData = decodePCX(colBuffer);
    const maptexData = decodePCX(maptexBuffer);

    const colIndices = colData.indices;       // 256x256 map of tile IDs
    const maptexIndices = maptexData.indices; // 256x256 image containing 16x16 tiles
    const maptexPalette = maptexData.palette; // Palette for tile pixels

    const atlasWidth = MAP_SIZE * TILE_SIZE;
    const atlasHeight = MAP_SIZE * TILE_SIZE;

    const canvas = document.createElement('canvas');
    canvas.width = atlasWidth;
    canvas.height = atlasHeight;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(atlasWidth, atlasHeight);

    for (let mapY = 0; mapY < MAP_SIZE; mapY++) {
        for (let mapX = 0; mapX < MAP_SIZE; mapX++) {
            const tileIdx = colIndices[mapY * MAP_SIZE + mapX];

            const tileGridX = (tileIdx % TILE_SIZE) * TILE_SIZE;
            const tileGridY = Math.floor(tileIdx / TILE_SIZE) * TILE_SIZE;

            for (let py = 0; py < TILE_SIZE; py++) {
                for (let px = 0; px < TILE_SIZE; px++) {
                    const maptexPixelIdx = (tileGridY + py) * MAP_SIZE + (tileGridX + px);
                    const colorIdx = maptexIndices[maptexPixelIdx];

                    const destX = mapX * TILE_SIZE + px;
                    const destY = mapY * TILE_SIZE + py;
                    const destPixelIdx = (destY * atlasWidth + destX) * 4;

                    imgData.data[destPixelIdx]     = maptexPalette[colorIdx * 3];         // R
                    imgData.data[destPixelIdx + 1] = maptexPalette[colorIdx * 3 + 1];     // G
                    imgData.data[destPixelIdx + 2] = maptexPalette[colorIdx * 3 + 2];     // B
                    imgData.data[destPixelIdx + 3] = 255;                                 // A
                }
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5cbcfc);   // NOTE: maybe it comes from MAPTEX?

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 40, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(50, 80, 30);
scene.add(dirLight);

async function loadMap(mapName, mapFile, colFile, maptexFile) {
    try {
        const [mapRes, colRes, maptexRes] = await Promise.all([
            fetch(mapFile),
            fetch(colFile),
            fetch(maptexFile)
        ]);

        if (!mapRes.ok) throw new Error(`Failed to locate '${mapFile}'`);
        if (!colRes.ok) throw new Error(`Failed to locate '${colFile}'`);
        if (!maptexRes.ok) throw new Error(`Failed to locate '${maptexFile}'`);

        const [mapBuffer, colBuffer, maptexBuffer] = await Promise.all([
            mapRes.arrayBuffer(),
            colRes.arrayBuffer(),
            maptexRes.arrayBuffer()
        ]);

        const heights = parsePCXHeightmap(mapBuffer);
        const colTexture = parsePCXTexture(colBuffer);
        const tileMap = parsePCXTileMap(colBuffer, maptexBuffer);

        const planeSize = 60;
        const geometry = new THREE.PlaneGeometry(planeSize, planeSize, MAP_SIZE - 1, MAP_SIZE - 1);
        const posAttr = geometry.attributes.position;
        const elevationScale = 0.016;

        for (let i = 0; i < posAttr.count; i++) {
            posAttr.setZ(i, heights[i] * elevationScale);
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            map: colTexture,
            roughness: 0.9,
            metalness: 0.1,
            wireframe: false,
            flatShading: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);

        let usingTileMap = false;
        toggleBtn.style.display = 'block';

        toggleBtn.addEventListener('click', () => {
            usingTileMap = !usingTileMap;
            material.map = usingTileMap ? tileMap : colTexture;
            material.needsUpdate = true;
            toggleBtn.innerText = usingTileMap
                ? 'Switch to COL.PCX'
                : 'Switch to MAPTEX.PCX';
        });

        statusEl.innerHTML = `<strong>${mapName}</strong><br>` +
                             " • Left click + drag to rotate<br>" +
                             " • Right click + drag to pan<br>" +
                             " • Scroll to zoom";
    } catch (err) {
        console.error(err);
        statusEl.innerHTML = `<span style="color: #ff6b6b;">Error: ${err.message}</span>`;
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

export function initTerep2MapViewer(options = {}) {
    const {
        mapName = "ORIGINAL",
        mapFile = "MAP.PCX",
        colFile = "COL.PCX",
        maptexFile = "MAPTEX.PCX",
    } = options;
  
    loadMap(mapName, mapFile, colFile, maptexFile);
    animate();
}