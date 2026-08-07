/*
    Terep2CarViewer

    2026, gmb
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const statusEl = document.getElementById('status');
const toggleBtn = document.getElementById('toggle-btn');

const MODEL_SCALE = 10000000.0;

// based on: https://github.com/Zi9/Deformers/blob/master/src/Engine/Assets/DFCarAsset.c 
function parseDat(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    let offset = 0;

    const header = {
        chunk1_start: view.getUint16(offset, true),
        chunk2_start: view.getUint16(offset + 2, true),
        chunk3_start: view.getUint16(offset + 4, true),
        unknown: view.getUint16(offset + 6, true),
        drive_mode: view.getUint16(offset + 8, true)
    };
    offset += 10;

    let p1Offset = header.chunk1_start;
    const num_points1 = view.getUint16(p1Offset, true);
    p1Offset += 2;

    const points1 = [];
    const POINT1_SIZE = 4 + 4 + 4 + 10 + 4 + 2;
    
    const geometryPoints = [];
    
    for (let i = 0; i < num_points1; i++) {
        const p1 = {
            x: view.getInt32(p1Offset, true),
            y: view.getInt32(p1Offset + 4, true),
            z: view.getInt32(p1Offset + 8, true),
            diameter: view.getInt32(p1Offset + 22, true),
            type: view.getUint16(p1Offset + 26, true)
        };

        geometryPoints.push( [ p1.x / MODEL_SCALE,
                               p1.y / MODEL_SCALE,
                               p1.z / MODEL_SCALE ] );

        points1.push(p1);
        p1Offset += POINT1_SIZE;
    }

    let p2Offset = header.chunk2_start;
    const num_points2 = view.getUint16(p2Offset, true);
    p2Offset += 2;

    const points2 = [];
    const POINT2_SIZE = 14;

    for (let i = 0; i < num_points2; i++) {
        points2.push({
            a: view.getUint16(p2Offset, true),
            b: view.getUint16(p2Offset + 2, true),
            other1: view.getUint16(p2Offset + 4, true),
            other2: view.getUint16(p2Offset + 6, true),
            type: view.getUint16(p2Offset + 8, true),
            other3: view.getUint16(p2Offset + 10, true),
            other4: view.getUint16(p2Offset + 12, true)
        });
        p2Offset += POINT2_SIZE;
    }
    
    let p3Offset = header.chunk3_start;
    const points3 = [];
    const fileSize = arrayBuffer.byteLength;

    while (p3Offset < fileSize) {
        const type = view.getUint8(p3Offset);
        p3Offset += 1;

        let dataPoint = { type, data: null };

        if (type === 0) {
          // Nothing
        } else if (type === 1) {
            const data = [];
            for (let j = 0; j < 4; j++) {
                data.push(view.getInt8(p3Offset));
                p3Offset += 1;
            }
            dataPoint.data = data;
        } else if (type === 3) {
            const data = [];
            for (let j = 0; j < 6; j++) {
                data.push(view.getInt16(p3Offset, true));
                p3Offset += 2;
            }
            dataPoint.data = data;
        } else if (type === 4) {
            const count = view.getUint8(p3Offset);
            p3Offset += 1;
            const dataLength = count + 2;
            const data = [];
            for (let j = 0; j < dataLength; j++) {
                data.push(view.getInt16(p3Offset, true));
                p3Offset += 2;
            }
            dataPoint.data = { count, data };
        } else if (type === 8) {
            const count = view.getUint8(p3Offset);
            p3Offset += 1;
            const dataLength = (count + 1) * 3;
            const data = [];
            for (let j = 0; j < dataLength; j++) {
                data.push(view.getUint16(p3Offset, true));
                p3Offset += 2;
            }
            dataPoint.data = { count, data };
        } else if (type === 10) {
            const data = [];
            for (let j = 0; j < 3; j++) {
                data.push(view.getUint16(p3Offset, true));
                p3Offset += 2;
            }
            dataPoint.data = data;
        } else if (type === 69 || type === 246) {
            const data = [];
            for (let j = 0; j < 19; j++) {
                data.push(view.getUint8(p3Offset));
                p3Offset += 1;
            }
            dataPoint.data = data;
        } else {
            console.warn(`Unknown DataPoint3 type: ${type}`);
            break;
        }

        points3.push(dataPoint);
    }

    let driveMode = "RWD";
    switch (header.drive_mode) {
        case 0: driveMode = "RWD"; break;
        case 1: driveMode = "FWD"; break;
        case 2: driveMode = "AWD"; break;
        default: throw new Error("Invalid drive mode.");
    }

    const geometry = new THREE.BufferGeometry();
    const flatPositions = new Float32Array(geometryPoints.flat());
    geometry.setAttribute(
        'position', 
        new THREE.BufferAttribute(flatPositions, 3) // 3 components per vertex (X, Y, Z)
    );

    return { driveMode, geometry };
}

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

    const bytesPerLine = view.getUint16(66, true);

    const paletteOffset = bytes.length - PALETTE_SIZE;
    const palette = new Uint8Array(PALETTE_SIZE);
    for (let i = 0; i < PALETTE_SIZE; i++) {
        palette[i] = bytes[paletteOffset + i];
    }

    let offset = HEADER_SIZE;
    const indices = new Uint8Array(width * height);
    const RLE_COUNT_MASK = 0xC0; 

    for (let y = 0; y < height; y++) {
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
                if (x < width) {
                    indices[y * width + x] = bytee;
                }
                x++;
                scanlineBytes++;
            }
        }
    }

    return { width, height, indices, palette };
}

function parsePCXTexture(arrayBuffer) {
    const { width, height, indices, palette } = decodePCX(arrayBuffer);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);

    for (let i = 0; i < width * height; i++) {
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
    texture.flipY = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    return texture;
}

function zoomToFit(object, camera, controls, offset = 1.2) {
    object.geometry.computeBoundingBox();
    const boundingBox = object.geometry.boundingBox;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    boundingBox.getCenter(center);
    boundingBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);

    const fov = camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    cameraDistance *= offset;

    const direction = new THREE.Vector3()
    .subVectors(camera.position, controls ? controls.target : new THREE.Vector3())
    .normalize();

    camera.position.copy(center).addScaledVector(direction, cameraDistance);

    if (controls) {
        controls.target.copy(center);
        controls.update();
    }

    camera.lookAt(center);
}

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color().setRGB( 0.5, 0.5, 0.5 );

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

async function loadCar(datFile, pcxFile) {
    try {
        const [datRes, pcxRes] = await Promise.all([
            fetch(datFile),
            fetch(pcxFile)
        ]);

        if (!datRes.ok) throw new Error(`Failed to locate '${datFile}'`);
        if (!pcxRes.ok) throw new Error(`Failed to locate '${pcxFile}'`);

        const [datBuffer, pcxBuffer] = await Promise.all([
            datRes.arrayBuffer(),
            pcxRes.arrayBuffer()
        ]);

        const { driveMode, geometry } = parseDat(datBuffer);
        const texture = parsePCXTexture(pcxBuffer);

        // TODO: skin
        //const material = new THREE.MeshStandardMaterial({
        //    map: texture,
        //    roughness: 0.9,
        //    wireframe: false,
        //    flatShading: true
        //});
        
        const material = new THREE.PointsMaterial({
            color: 0x00ff88,
            size: 0.05,
            sizeAttenuation: true
        });

        const pointCloud = new THREE.Points(geometry, material);
        scene.add(pointCloud);
        
        zoomToFit(pointCloud, camera, controls);

        statusEl.innerHTML = `${driveMode}<br>`

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

export function initTerep2CarViewer(options = {}) {
    const {
        datFile = "CAR1.DAT",
        pcxFile = "DEFAULT1.PCX",
    } = options;
  
    loadCar(datFile, pcxFile);
    animate();
}