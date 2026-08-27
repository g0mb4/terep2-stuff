/*
    Terep2MapViewer

    2026, gmb
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MAP_SIZE = 256;   // map dimension
const TILE_SIZE = 16;   // 16x16 tile in MAPTEX.PCX

const panel = document.getElementById('ui-panel');
const statusEl = document.getElementById('status');

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

    // sky color is the last color in COL's palette
    const skyColor = {
        "R": palette[255 * 3] / 255,
        "G": palette[255 * 3 + 1] / 255,
        "B": palette[255 * 3 + 2] / 255,
    };

    return { indices, palette, skyColor };
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
    texture.flipY = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    return texture;
}

// based on:
// https://github.com/Zi9/Deformers/blob/master/src/core/map.c
function createGeometry(heights, scale, heightScale, indices, palette) {
    const numQuads = MAP_SIZE - 1;
    const totalTriangles = numQuads * numQuads * 2;
    const totalVertices = totalTriangles * 3;

    const vertices = new Float32Array(totalVertices * 3);
    const uvs = new Float32Array(totalVertices * 2);
    const colors = new Float32Array(totalVertices * 3);

    let vertC = 0;
    let uvC = 0;
    let colorC = 0;

    const halfSize = MAP_SIZE / 2.0;

    for (let y = 0; y < numQuads; y++) {
        for (let x = 0; x < numQuads; x++) {
            const yInv = MAP_SIZE - y - 1;
            const colorIdx1 = indices[yInv * MAP_SIZE + x];
            let colorIdx2 = colorIdx1;
            if (colorIdx1 % 16 != 0) {
                colorIdx2 = colorIdx1 - 1;
            }

            const getColor = (idx) => {
                const r = palette[idx * 3] / 255.0;
                const g = palette[idx * 3 + 1] / 255.0;
                const b = palette[idx * 3 + 2] / 255.0;
                return [r, g , b];
            };

            const ry0 = MAP_SIZE - y;
            const ry1 = MAP_SIZE - (y + 1);

            const c1 = getColor(colorIdx1);
            const c2 = getColor(colorIdx2);

            // heights at the quad corners
            const z00 = heights[ry0 * MAP_SIZE + x] * heightScale;             // Top-Left
            const z01 = heights[ry1 * MAP_SIZE + x] * heightScale;             // Bottom-Left
            const z10 = heights[ry0 * MAP_SIZE + (x + 1)] * heightScale;       // Top-Right
            const z11 = heights[ry1 * MAP_SIZE + (x + 1)] * heightScale;       // Bottom-Right

            // world positions centered around origin
            const x0 = (x - halfSize) * scale;
            const x1 = (x - halfSize + 1) * scale;
            const y0 = (y - halfSize) * scale;
            const y1 = (y - halfSize + 1) * scale;

            // UV mapping matching the height row
            const u0 = x / MAP_SIZE;
            const u1 = (x + 1) / MAP_SIZE;

            const v0 = 1.0 - (y / MAP_SIZE);
            const v1 = 1.0 - ((y + 1) / MAP_SIZE);

            // triangle 1
            vertices[vertC]     = x0;
            vertices[vertC + 1] = y0;
            vertices[vertC + 2] = z00;
            uvs[uvC]            = u0;
            uvs[uvC + 1]        = v0;
            colors[colorC]      = c1[0];
            colors[colorC + 1]  = c1[1];
            colors[colorC + 2]  = c1[2];

            vertices[vertC + 3] = x1;
            vertices[vertC + 4] = y0;
            vertices[vertC + 5] = z10;
            uvs[uvC + 2]        = u1;
            uvs[uvC + 3]        = v0;
            colors[colorC + 3]  = c1[0];
            colors[colorC + 4]  = c1[1];
            colors[colorC + 5]  = c1[2];

            vertices[vertC + 6] = x1;
            vertices[vertC + 7] = y1;
            vertices[vertC + 8] = z11;
            uvs[uvC + 4]        = u1;
            uvs[uvC + 5]        = v1;
            colors[colorC + 6]  = c1[0];
            colors[colorC + 7]  = c1[1];
            colors[colorC + 8]  = c1[2];

            // triangle 2
            vertices[vertC + 9]  = x0;
            vertices[vertC + 10] = y0;
            vertices[vertC + 11] = z00;
            uvs[uvC + 6]         = u0;
            uvs[uvC + 7]         = v0;
            colors[colorC + 9]   = c2[0];
            colors[colorC + 10]  = c2[1];
            colors[colorC + 11]  = c2[2];

            vertices[vertC + 12] = x1;
            vertices[vertC + 13] = y1;
            vertices[vertC + 14] = z11;
            uvs[uvC + 8]         = u1;
            uvs[uvC + 9]         = v1;
            colors[colorC + 12]  = c2[0];
            colors[colorC + 13]  = c2[1];
            colors[colorC + 14]  = c2[2];

            vertices[vertC + 15] = x0;
            vertices[vertC + 16] = y1;
            vertices[vertC + 17] = z01;
            uvs[uvC + 10]        = u0;
            uvs[uvC + 11]        = v1;
            colors[colorC + 15]  = c2[0];
            colors[colorC + 16]  = c2[1];
            colors[colorC + 17]  = c2[2];

            vertC += 18;
            uvC += 12;
            colorC += 18;
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const count = totalVertices;
    geometry.clearGroups();
    geometry.addGroup(0, count, 0); // Front material
    geometry.addGroup(0, count, 1); // Back material

    return geometry;
}

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 40, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

async function loadMap(mapName, creator, date, mapFile, colFile, maptexFile) {
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
        const { indices, palette, skyColor } = parsePCXTexture(colBuffer);
        const tileMap = parsePCXTileMap(colBuffer, maptexBuffer);

        scene.background = new THREE.Color().setRGB( skyColor.R, skyColor.G, skyColor.B );

        const scale = 0.2;
        const heightScale = 0.016;
        const geometry = createGeometry(heights, scale, heightScale, indices, palette);

        const frontMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            roughness: 0.8,
            side: THREE.FrontSide
        });

        const backMaterial = new THREE.MeshBasicMaterial({
            color: 0xF0F0F0,
            roughness: 0.9,
            wireframe: false,
            flatShading: true,
            side: THREE.BackSide
        });

        const mesh = new THREE.Mesh(geometry, [frontMaterial, backMaterial]);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);

        panel.addEventListener('change', (event) => {
            if (event.target.value == 'col') {
                frontMaterial.map = colTexture;
            }

            if (event.target.value == 'maptex') {
                frontMaterial.map = tileMap;
            }

            frontMaterial.needsUpdate = true;
        });

        if (creator) {
            statusEl.innerHTML = `<strong>${mapName}</strong> by <strong>${creator}</strong><br>`;
        } else {
            statusEl.innerHTML = `<strong>${mapName}</strong> by an unknown creator<br>`;
        }

        if (date) {
            statusEl.innerHTML += `${date}<br>`;
        }

        statusEl.innerHTML += "<br> Controls:<br>" +
                              " • Left click + drag to rotate<br>" +
                              " • Right click + drag to pan<br>" +
                              " • Scroll to zoom<br>" +
                              " • Press 'h' to hide/show this panel";
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
        creator = "Dénes Nagymáthé",
        date = "1996-05-04",
        mapFile = "MAP.PCX",
        colFile = "COL.PCX",
        maptexFile = "MAPTEX.PCX",
    } = options;

    loadMap(mapName, creator, date, mapFile, colFile, maptexFile);
    animate();
}
