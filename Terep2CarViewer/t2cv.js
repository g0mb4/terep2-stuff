/*
    Terep2CarViewer

    2026, gmb
*/

import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

const panel = document.getElementById('ui-panel');
const statusEl = document.getElementById('status')
const cbShowCam = document.getElementById('show-cam');
const cbShowSusp = document.getElementById('show-susp');
const cbShowWheelNorm = document.getElementById('show-wheelnorm');
const cbShowAxis = document.getElementById('show-axis');
const cbShowSegmentLines = document.getElementById('show-seg-lines');
const cbShowSegmentId = document.getElementById('show-seg-id');
const cbShowBodyTex = document.getElementById('show-body-tex');
const cbShowBodyCol = document.getElementById('show-body-col');

const SKIN_WIDTH = 256;
const SKIN_HEIGHT = 200;
const MODEL_SCALE = 10000000.0;

let points1 = [];
let points2 = [];
let points3 = [];

let carBody = null;
let wheelTextures = null;
let bodyTexture = null;
let activeWheelMeshes = [];

let globalPalette = null;

const POINT = {
    GEOMETRY: 0,
    WHEEL_REAR: 1,
    WHEEL_FRONT: 2,
    CAMERA: 65535
};

const SEGMENT = {
    SUSP_EXTRA: 0,
    NORMAL: 1,
    SUSP_REAR: 4 | 6,
    SUSP_FRONT: 10 | 12
};

function cloneAndFlipX(texture) {
    const flipped = texture.clone();
    flipped.wrapS = THREE.RepeatWrapping;
    flipped.repeat.x = -1;
    flipped.offset.x = 1;
    flipped.needsUpdate = true;
    return flipped;
}

/*
function cloneAndFlipY(texture) {
    const flipped = texture.clone();
    flipped.wrapT = THREE.RepeatWrapping;
    flipped.repeat.y = -1;
    flipped.offset.y = 1;
    flipped.needsUpdate = true;
    return flipped;
}
*/

function getSubTexture(sourceTexture, x1, y1, x2, y2, widthPad = 0, heightPad = 0) {
    const sourceCanvas = sourceTexture.image;
    const cropWidth = x2 - x1 + 1;
    const cropHeight = y2 - y1 + 1;

    const targetWidth = Math.max(cropWidth, widthPad);
    const targetHeight = Math.max(cropHeight, heightPad);

    const offsetX = Math.floor((targetWidth - cropWidth) / 2);
    const offsetY = Math.floor((targetHeight - cropHeight) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
        sourceCanvas,
        x1, y1, cropWidth, cropHeight,
        offsetX, offsetY, cropWidth, cropHeight
    );

    const subTexture = new THREE.CanvasTexture(canvas);
    subTexture.colorSpace = sourceTexture.colorSpace;
    subTexture.magFilter = THREE.NearestFilter;
    subTexture.minFilter = THREE.NearestFilter;
    subTexture.wrapS = THREE.ClampToEdgeWrapping;
    subTexture.wrapT = THREE.ClampToEdgeWrapping;

    subTexture.needsUpdate = true;

    return subTexture;
}

function decodePCX(arrayBuffer, requestedWidth, requestedHeight) {
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

    if (width < requestedWidth || height < requestedHeight) {
        throw new Error("Invalid PCX dimensions.");
    }

    const bytesPerLine = view.getUint16(66, true);

    const paletteOffset = bytes.length - PALETTE_SIZE;
    const palette = new Uint8Array(PALETTE_SIZE);
    for (let i = 0; i < PALETTE_SIZE; i++) {
        palette[i] = bytes[paletteOffset + i];
    }

    let offset = HEADER_SIZE;
    const indices = new Uint8Array(requestedWidth * requestedHeight);
    const RLE_COUNT_MASK = 0xC0;

    for (let y = 0; y < requestedHeight; y++) {
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
                if (x < requestedWidth) {
                    indices[y * requestedWidth + x] = bytee;
                }
                x++;
                scanlineBytes++;
            }
        }
    }

    return { indices, palette };
}

function loadGlobalPalette(arrayBuffer) {
    const { indices, palette } = decodePCX(arrayBuffer, 256, 256);
    globalPalette = palette;
}

function parsePCXTexture(arrayBuffer) {
    const { indices, palette } = decodePCX(arrayBuffer, SKIN_WIDTH, SKIN_HEIGHT);

    const canvas = document.createElement('canvas');
    canvas.width = SKIN_WIDTH;
    canvas.height = SKIN_HEIGHT;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(SKIN_WIDTH, SKIN_HEIGHT);

    for (let i = 0; i < SKIN_WIDTH * SKIN_HEIGHT; i++) {
        const colorIdx = indices[i];
        const pixelIdx = i * 4;
        imgData.data[pixelIdx]     = globalPalette[colorIdx * 3];         // R
        imgData.data[pixelIdx + 1] = globalPalette[colorIdx * 3 + 1];     // G
        imgData.data[pixelIdx + 2] = globalPalette[colorIdx * 3 + 2];     // B

        // last color is transparent
        if (colorIdx == 255) {
            imgData.data[pixelIdx + 3] = 0;                         // A
        } else {
            imgData.data[pixelIdx + 3] = 255;                       // A
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

function getVec4FromPalette(colorIdx) {
    const R = globalPalette[colorIdx * 3]     / 255.0;
    const G = globalPalette[colorIdx * 3 + 1] / 255.0;
    const B = globalPalette[colorIdx * 3 + 2] / 255.0;

    let A = 1.0;
    if (colorIdx == 255) {
        A = 0;
    }

    // transparent
    if (colorIdx == 240) {
        A = 0.2;    // TODO: it is just a guess
    }

    return new THREE.Vector4(R, G, B, A);
}

// based on: https://github.com/Zi9/Deformerz/blob/master/docs/TEREP2_DAT_Format.md
function parseDat(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    let offset = 0;
    points1 = [];
    points2 = [];
    points3 = [];

    const header = {
        chunk1_start: view.getUint16(offset, true),
        chunk2_start: view.getUint16(offset + 2, true),
        chunk3_start: view.getUint16(offset + 4, true),
        unknown1: view.getUint16(offset + 6, true),
        unknown2: view.getUint16(offset + 8, true)
    };
    offset += 10;

    let p1Offset = header.chunk1_start;
    const num_points1 = view.getUint16(p1Offset, true);
    p1Offset += 2;

    const POINT1_SIZE = 28;

    for (let i = 0; i < num_points1; i++) {
        const x = view.getInt32(p1Offset, true) / MODEL_SCALE;
        const z = view.getInt32(p1Offset + 4, true) / MODEL_SCALE;
        const y = view.getInt32(p1Offset + 8, true) / MODEL_SCALE;
        const size = view.getInt32(p1Offset + 22, true);

        const p1 = {
            p: new THREE.Vector3(x, y, z),
            size: size > 0 ? size / MODEL_SCALE : 0,
            type: view.getUint16(p1Offset + 26, true)
        };

        points1.push(p1);
        p1Offset += POINT1_SIZE;
    }

    let p2Offset = header.chunk2_start;
    const num_points2 = view.getUint16(p2Offset, true);
    p2Offset += 2;

    const POINT2_SIZE = 14;

    for (let i = 0; i < num_points2; i++) {
        points2.push({
            pointA: view.getUint16(p2Offset, true),
            pointB: view.getUint16(p2Offset + 2, true),
            unknown1: view.getUint16(p2Offset + 4, true),
            unknown2: view.getUint16(p2Offset + 6, true),
            type: view.getUint16(p2Offset + 8, true),
            unknown3: view.getUint16(p2Offset + 10, true),
            unknown4: view.getUint16(p2Offset + 12, true)
        });
        p2Offset += POINT2_SIZE;
    }

    let p3Offset = header.chunk3_start;
    const fileSize = arrayBuffer.byteLength;

    while (p3Offset < fileSize) {
        const type = view.getUint8(p3Offset);
        p3Offset += 1;

        let dataPoint = { type, data: null };

        if (type === 0) {
            // Nothing
        } else if (type === 1) {
            const cameraPointIndex = view.getUint16(p3Offset, true);
            const unknown1 = view.getUint8(p3Offset+2);
            const unknown2 = view.getUint8(p3Offset+3);
            p3Offset += 4;
            dataPoint.data = {cameraPointIndex, unknown1, unknown2};
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
            const polygons = [];
            for (let j = 0; j < count; j++) {
                polygons.push(view.getInt16(p3Offset + (2*j), true) / 2);
            }
            const color1 = view.getUint8(p3Offset+(2*count+2));
            const color2 = view.getUint8(p3Offset+(2*count+3));

            p3Offset += 2*count+4;
            dataPoint.data = { count, polygons, color1, color2 };
        } else if (type === 8) {
            const count = view.getUint8(p3Offset);
            p3Offset += 1;
            const polygons = [];
            const vScale = 256/200;
            for (let j = 0; j < count; j++) {
                const vertex_id = view.getUint16(p3Offset + (2*j*3), true) / 2;
                const u = view.getUint16(p3Offset + (2*j*3)+2, true) / 65535.0;
                const v = view.getUint16(p3Offset + (2*j*3)+4, true)*vScale / 65535.0;
                polygons.push({vertex_id, u, v});
            }

            p3Offset += (count + 1) * 3 * 2;
            dataPoint.data = { count, polygons };
        } else if (type === 10) {
            const wheelIndex = view.getUint16(p3Offset, true) / 2;
            const unknown1 = view.getUint16(p3Offset+2, true);
            const unknown2 = view.getUint16(p3Offset+4, true);

            p3Offset += 3 * 2;
            dataPoint.data = {wheelIndex, unknown1, unknown2};
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
}

function createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;

    ctx.fillStyle = color;
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);

    return sprite;
}

function createTexturedSurface(vertices, uvs, indices, texture) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.FrontSide,
        transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}

// source:
// https://github.com/Zi9/Deformers/blob/master/src/Engine/Rendering/DFCarRenderer.c
export function createCarMesh() {
    carBody = new THREE.Group();
    const cubeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const wheelStyle = document.querySelector('input[name="wheel-style"]:checked')?.value;
    const vertexStyle = document.querySelector('input[name="vertex-style"]:checked')?.value;

    const wheels = [];

    let vertexID = -1;
    points1.forEach((pt) => {
        const p = pt.p;
        vertexID += 1;

        if (pt.type === POINT.CAMERA) {
            if (cbShowCam.checked) {
                if (vertexStyle == "cube") {
                    const cubeMat = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
                    const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
                    cubeMesh.position.set(p.x, p.y, p.z);
                    carBody.add(cubeMesh);
                }

                if (vertexStyle == "label") {
                    const textSprite = createTextSprite(vertexID.toString(), "#00FF00");
                    textSprite.position.set(p.x, p.y, p.z);
                    carBody.add(textSprite);
                }
            } else {
                return;
            }
        }

        if (pt.type === POINT.GEOMETRY) {
            if (vertexStyle == "cube") {
                const cubeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
                const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
                cubeMesh.position.set(p.x, p.y, p.z);
                carBody.add(cubeMesh);
            }

            if (vertexStyle == "label") {
                const textSprite = createTextSprite(vertexID.toString(), "#000000");
                textSprite.position.set(p.x, p.y, p.z);
                carBody.add(textSprite);
            }
        }

        if (pt.type === POINT.WHEEL_FRONT || pt.type === POINT.WHEEL_REAR) {
            if (pt.size <= 0) return

            const norm = new THREE.Vector3(p.x < 0 ? -1 : 1, 0, 0);

            if (cbShowWheelNorm.checked) {
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    p.clone(),
                    p.clone().add(norm.clone().multiplyScalar(0.5))
                ]);
                carBody.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xFF0000 })));
            }

            if (wheelStyle == "textured") {
                const wheel = {
                    pos: p,
                    diam: pt.size*2,
                    norm: norm,
                };

                wheels.push(wheel);
            }

            if (wheelStyle == "simple") {
                if (vertexStyle == "cube") {
                    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xFF00FF });
                    const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
                    cubeMesh.position.set(p.x, p.y, p.z);
                    carBody.add(cubeMesh);
                }

                if (vertexStyle == "label") {
                    const textSprite = createTextSprite(vertexID.toString(), "#FF00FF");
                    textSprite.position.set(p.x, p.y, p.z);
                    carBody.add(textSprite);
                }

                const circleGeo = new THREE.BufferGeometry();
                const segments = 32;
                const positions = new Float32Array((segments + 1) * 3);

                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * Math.PI * 2;
                    positions[i * 3]     = 0;                           // x
                    positions[i * 3 + 1] = Math.cos(theta) * pt.size;   // y
                    positions[i * 3 + 2] = Math.sin(theta) * pt.size;   // z
                }

                circleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const circleMat = new THREE.LineBasicMaterial({ color: 0xFF00FF });
                const circleLine = new THREE.LineLoop(circleGeo, circleMat);
                circleLine.position.set(p.x, p.y, p.z);
                carBody.add(circleLine);
            }
        }
    });

    let segmentID = -1;
    points2.forEach((seg) => {
        const pA = points1[seg.pointA].p;
        const pB = points1[seg.pointB].p;
        segmentID += 1;

        let color = 0xffffff;
        if (seg.type == SEGMENT.SUSP_REAR) {
            if (cbShowSusp.checked) {
                color = 0xff0000;
            } else {
                return;
            }
        }

        if (seg.type == SEGMENT.SUSP_FRONT) {
            if (cbShowSusp.checked) {
                color = 0xff0000;
            } else {
                return;
            }
        }

        if (seg.type == SEGMENT.SUSP_EXTRA) {
            if (cbShowSusp.checked) {
                color = 0xff0000;
            } else {
                return;
            }
        }

        if (points1[seg.pointA].type == POINT.CAMERA || points1[seg.pointA].type == POINT.CAMERA) {
            if (cbShowCam.checked) {
                color = 0x00ff00;
            } else {
                return;
            }
        }

        // white bars
        if ((seg.pointA == 13 && seg.pointB == 11) || (seg.pointA == 11 && seg.pointB == 13)) {
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                pA,
                pB
            ]);

            const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
            const line = new THREE.Line(lineGeo, lineMat);
            carBody.add(line);
        }

        if ((seg.pointA == 12 && seg.pointB == 10) || (seg.pointA == 10 && seg.pointB == 12)) {
             const lineGeo = new THREE.BufferGeometry().setFromPoints([
                pA,
                pB
            ]);

            const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
            const line = new THREE.Line(lineGeo, lineMat);
            carBody.add(line);
        }

        if (cbShowSegmentLines.checked) {
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                pA,
                pB
            ]);

            const lineMat = new THREE.LineBasicMaterial({ color });
            const line = new THREE.Line(lineGeo, lineMat);
            carBody.add(line);
        }

        if (cbShowSegmentId.checked) {
            const sX = ((pA.x + pB.x) / 2);
            const sY = ((pA.y + pB.y) / 2);
            const sZ = ((pA.z + pB.z) / 2);

            const textSprite = createTextSprite(segmentID.toString(), "#FFFFFF");
            textSprite.position.set(sX, sY, sZ);
            carBody.add(textSprite);
        }
    });

    if (cbShowBodyCol.checked) {
        for(let i = 0; i < points3.length; ++i) {
            if (points3[i].type != 4) {
                continue;
            }

            const polygons = points3[i].data.polygons;

            if (polygons.length < 3 || polygons.length > 5) {
                continue;
            }

            if (points3[i].data.color1 == 0 || points3[i].data.color2 == 0) {
                continue;
            }

            const color1 = getVec4FromPalette(points3[i].data.color1);
            const color2 = getVec4FromPalette(points3[i].data.color2);

            let geometry = null;
            if (polygons.length == 3) {
                const v0 = points1[polygons[0]].p;
                const v1 = points1[polygons[1]].p;
                const v2 = points1[polygons[2]].p;

                const vertices = new Float32Array([
                    v2.x , v2.y, v2.z,
                    v1.x , v1.y, v1.z,
                    v0.x , v0.y, v0.z,
                ]);

                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                geometry.computeVertexNormals();
            }

            if (polygons.length == 4) {
                const v0 = points1[polygons[0]].p;
                const v1 = points1[polygons[1]].p;
                const v2 = points1[polygons[2]].p;
                const v3 = points1[polygons[3]].p;

                const vertices = new Float32Array([
                    v2.x , v2.y, v2.z,
                    v1.x , v1.y, v1.z,
                    v0.x , v0.y, v0.z,

                    v0.x , v0.y, v0.z,
                    v3.x , v3.y, v3.z,
                    v2.x , v2.y, v2.z,
                ]);

                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                geometry.computeVertexNormals();
            }

            if (polygons.length == 5) {
                const v0 = points1[polygons[0]].p;
                const v1 = points1[polygons[1]].p;
                const v2 = points1[polygons[2]].p;
                const v3 = points1[polygons[3]].p;
                const v4 = points1[polygons[4]].p;

                const vertices = new Float32Array([
                    v2.x , v2.y, v2.z,
                    v1.x , v1.y, v1.z,
                    v0.x , v0.y, v0.z,

                    v0.x , v0.y, v0.z,
                    v4.x , v4.y, v4.z,
                    v2.x , v2.y, v2.z,

                    v4.x , v4.y, v4.z,
                    v3.x , v3.y, v3.z,
                    v2.x , v2.y, v2.z,
                ]);

                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                geometry.computeVertexNormals();
            }

            // TODO: checkerboard pattern using color1 and color2
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(color1.x, color1.y, color1.z),
                opacity: color1.w,
                transparent: true
            });

            const mesh = new THREE.Mesh(geometry, material);
            carBody.add(mesh);
        }
    }

    // TODO: vertex indices are hard coded, not from the .DAT file
    if (cbShowBodyTex.checked) {
        for(let i = 0; i < points3.length; ++i) {
            if (points3[i].type != 8) {
                continue;
            }

            const polygons = points3[i].data.polygons;

            if (polygons.length < 3 || polygons.length > 5) {
                continue;
            }

            if (polygons.length == 3) {
                const v0 = points1[polygons[0].vertex_id].p;
                const v1 = points1[polygons[1].vertex_id].p;
                const v2 = points1[polygons[2].vertex_id].p;

                const vertices = new Float32Array([
                    v2.x , v2.y, v2.z,
                    v1.x , v1.y, v1.z,
                    v0.x , v0.y, v0.z,
                ]);

                const uvs = new Float32Array([
                    polygons[2].u, polygons[2].v,
                    polygons[1].u, polygons[1].v,
                    polygons[0].u, polygons[0].v,
                ]);

                const indices = [
                    0, 1, 2
                ];

                const mesh = createTexturedSurface(vertices, uvs, indices, bodyTexture);
                carBody.add(mesh);
            }

            if (polygons.length == 4) {
                const v0 = points1[polygons[0].vertex_id].p;
                const v1 = points1[polygons[1].vertex_id].p;
                const v2 = points1[polygons[2].vertex_id].p;
                const v3 = points1[polygons[3].vertex_id].p;

                const vertices = new Float32Array([
                    v2.x , v2.y, v2.z,
                    v1.x , v1.y, v1.z,
                    v0.x , v0.y, v0.z,

                    v0.x , v0.y, v0.z,
                    v3.x , v3.y, v3.z,
                    v2.x , v2.y, v2.z,
                ]);

                const uvs = new Float32Array([
                    polygons[2].u, polygons[2].v,
                    polygons[1].u, polygons[1].v,
                    polygons[0].u, polygons[0].v,

                    polygons[0].u, polygons[0].v,
                    polygons[3].u, polygons[3].v,
                    polygons[2].u, polygons[2].v,
                ]);

                const indices = [
                    0, 1, 2,
                    3, 4, 5
                ];

                const mesh = createTexturedSurface(vertices, uvs, indices, bodyTexture);
                carBody.add(mesh);
            }

            if (polygons.length == 5) {
                const v0 = points1[polygons[0].vertex_id].p;
                const v1 = points1[polygons[1].vertex_id].p;
                const v2 = points1[polygons[2].vertex_id].p;
                const v3 = points1[polygons[3].vertex_id].p;
                const v4 = points1[polygons[4].vertex_id].p;

                const vertices = new Float32Array([
                    v2.x , v2.y, v2.z,
                    v1.x , v1.y, v1.z,
                    v0.x , v0.y, v0.z,

                    v0.x , v0.y, v0.z,
                    v4.x , v4.y, v4.z,
                    v2.x , v2.y, v2.z,

                    v4.x , v4.y, v4.z,
                    v3.x , v3.y, v3.z,
                    v2.x , v2.y, v2.z,
                ]);

                const uvs = new Float32Array([
                    polygons[2].u, polygons[2].v,
                    polygons[1].u, polygons[1].v,
                    polygons[0].u, polygons[0].v,

                    polygons[0].u, polygons[0].v,
                    polygons[4].u, polygons[4].v,
                    polygons[2].u, polygons[2].v,

                    polygons[4].u, polygons[4].v,
                    polygons[3].u, polygons[3].v,
                    polygons[2].u, polygons[2].v,
                ]);

                const indices = [
                    0, 1, 2,
                    3, 4, 5,
                    6, 7, 8
                ];

                const mesh = createTexturedSurface(vertices, uvs, indices, bodyTexture);
                carBody.add(mesh);
            }
        }
    }


    return { carBody, wheels };
}

function createWheelPlates(wheels, wheelTextures){
    activeWheelMeshes = [];
    const wheelGroup = new THREE.Group();

    const frontAngles = [
        wheelTextures.front1,
        cloneAndFlipX(wheelTextures.front2),
        cloneAndFlipX(wheelTextures.front3),
        cloneAndFlipX(wheelTextures.front4),
        wheelTextures.front5,
        wheelTextures.front4,
        wheelTextures.front3,
        wheelTextures.front2,
        wheelTextures.front1
    ];

    const backAngles = [
        wheelTextures.back1,
        cloneAndFlipX(wheelTextures.back2),
        cloneAndFlipX(wheelTextures.back3),
        cloneAndFlipX(wheelTextures.back4),
        wheelTextures.front5,
        wheelTextures.back4,
        wheelTextures.back3,
        wheelTextures.back2,
        wheelTextures.back1
    ];

    wheels.forEach((wheel) => {
        const wheelGeo = new THREE.PlaneGeometry(wheel.diam, wheel.diam);

        const wheelMat = new THREE.MeshBasicMaterial({
            map: wheelTextures.front1,
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });

        const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
        wheelMesh.position.copy(wheel.pos);
        wheelMesh.userData = {
            norm: wheel.norm.clone(),
            diam: wheel.diam,
            frontAngles,
            backAngles,
        };

        wheelGroup.add(wheelMesh);
        activeWheelMeshes.push(wheelMesh);
    });

    return wheelGroup;
}

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color().setRGB( 0.5, 0.5, 0.5 );

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.up.set(0, 1, 0);
camera.position.set(-2, 1, -2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 8;
controls.zoomSpeed = 8;
controls.panSpeed = 8;

function addScene() {
    scene.clear();

    const { carBody, wheels } = createCarMesh();
    scene.add(carBody);

    const wheelPlanes = createWheelPlates(wheels, wheelTextures);
    scene.add(wheelPlanes);

    if (cbShowAxis.checked) {
        const axesHelper = new THREE.AxesHelper( 1 );
        axesHelper.setColors(0xFF0000, 0x00FF00, 0x0000FF);
        scene.add(axesHelper);
    }
}

async function loadCar(datFile, pcxFile, palFile) {
    try {
        const [datRes, pcxRes, palRes] = await Promise.all([
            fetch(datFile),
            fetch(pcxFile),
            fetch(palFile)
        ]);

        if (!datRes.ok) throw new Error(`Failed to locate '${datFile}'`);
        if (!pcxRes.ok) throw new Error(`Failed to locate '${pcxFile}'`);
        if (!palRes.ok) throw new Error(`Failed to locate '${palFile}'`);

        const [datBuffer, pcxBuffer, palBuffer] = await Promise.all([
            datRes.arrayBuffer(),
            pcxRes.arrayBuffer(),
            palRes.arrayBuffer()
        ]);

        loadGlobalPalette(palBuffer);

        bodyTexture = parsePCXTexture(pcxBuffer);
        wheelTextures = {
            front1 : getSubTexture(bodyTexture, 118, 2, 148, 32, 31, 31),
            front2 : getSubTexture(bodyTexture, 150, 2, 178, 32, 31, 31),
            front3 : getSubTexture(bodyTexture, 180, 2, 205, 32, 31, 31),
            front4 : getSubTexture(bodyTexture, 207, 2, 225, 32, 31, 31),
            front5 : getSubTexture(bodyTexture, 227, 2, 238, 32, 31, 31),
            back1 : getSubTexture(bodyTexture, 118, 34, 147, 63, 31, 31),
            back2 : getSubTexture(bodyTexture, 149, 34, 177, 63, 31, 31),
            back3 : getSubTexture(bodyTexture, 179, 34, 204, 63, 31, 31),
            back4 : getSubTexture(bodyTexture, 206, 34, 225, 63, 31, 31),
        }

        parseDat(datBuffer);
        addScene();

        statusEl.innerHTML = `DAT: ${datFile}<br>` +
                             `PCX: ${pcxFile}<br>` +
                             `PAL: ${palFile}<br><br>`;

        statusEl.innerHTML += "Controls:<br>" +
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

const parentWorldQuat  = new THREE.Quaternion();
const parentInvQuat    = new THREE.Quaternion();
const wheelWorldQuat   = new THREE.Quaternion();
const wheelWorldPos    = new THREE.Vector3();
const camPos           = new THREE.Vector3();

const carUpWorld       = new THREE.Vector3();
const axle             = new THREE.Vector3();
const wheelUp          = new THREE.Vector3();
const wheelForward     = new THREE.Vector3();
const camDir           = new THREE.Vector3();
const xAxis            = new THREE.Vector3();
const yAxis            = new THREE.Vector3();
const zAxis            = new THREE.Vector3();

const basis            = new THREE.Matrix4();

const CAR_UP_LOCAL     = new THREE.Vector3(0, 0, 1);

// TODO: fix this
function drawWheelTextures() {
    if (activeWheelMeshes.length > 0) {
        camera.getWorldPosition(camPos);
        const parentGroup = activeWheelMeshes[0].parent;

        if (parentGroup) {
            parentGroup.getWorldQuaternion(parentWorldQuat);
            parentInvQuat.copy(parentWorldQuat).invert();

            carUpWorld.copy(CAR_UP_LOCAL).applyQuaternion(parentWorldQuat).normalize();

            activeWheelMeshes.forEach((mesh) => {
                mesh.getWorldPosition(wheelWorldPos);
                camDir.subVectors(camPos, wheelWorldPos).normalize();

                axle.copy(mesh.userData.norm).applyQuaternion(parentWorldQuat).normalize();
                wheelUp.copy(carUpWorld);
                wheelForward.crossVectors(axle, wheelUp).normalize();

                const axleComp = camDir.dot(axle);        // > 0 = front side
                const fwdComp  = camDir.dot(wheelForward);// sign = horizontal mirror

                let angle = Math.atan2(Math.abs(fwdComp), Math.abs(axleComp));
                let index = Math.round((angle / (Math.PI / 2)) * 4);

                if (fwdComp < 0 && index > 0 && index < 4) {
                    index = 8 - index;
                }

                const useBack = axleComp < 0;
                const list = useBack ? mesh.userData.backAngles : mesh.userData.frontAngles;
                const targetTexture = list[index];
                if (mesh.material.map !== targetTexture) {
                    mesh.material.map = targetTexture;
                    mesh.material.needsUpdate = true;
                }

                zAxis.copy(camDir).normalize();
                yAxis.copy(wheelUp).addScaledVector(zAxis, -wheelUp.dot(zAxis));
                if (yAxis.lengthSq() < 1e-8) {
                    yAxis.copy(wheelForward).addScaledVector(zAxis, -wheelForward.dot(zAxis));
                }
                yAxis.normalize();
                xAxis.crossVectors(yAxis, zAxis).normalize();

                basis.makeBasis(xAxis, yAxis, zAxis);
                wheelWorldQuat.setFromRotationMatrix(basis);
                mesh.quaternion.copy(parentInvQuat).multiply(wheelWorldQuat);
            });
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    const wheelStyle = document.querySelector('input[name="wheel-style"]:checked')?.value;
    if (wheelStyle == "textured") {
        drawWheelTextures();
    }

    renderer.render(scene, camera);
}

export function initTerep2CarViewer(datFile, pcxFile, palFile) {
    cbShowCam.addEventListener('change', (event) => {
        addScene();
    });

    cbShowSusp.addEventListener('change', (event) => {
        addScene();
    });

    cbShowWheelNorm.addEventListener('change', (event) => {
        addScene();
    });

    cbShowAxis.addEventListener('change', (event) => {
        addScene();
    });

    panel.addEventListener('change', (event) => {
        if (event.target.name === 'wheel-style') {
            addScene();
        }
        if (event.target.name === 'vertex-style') {
            addScene();
        }
    })

    cbShowSegmentLines.addEventListener('change', (event) => {
        addScene();
    });

    cbShowSegmentId.addEventListener('change', (event) => {
        addScene();
    });

    cbShowBodyTex.addEventListener('change', (event) => {
        addScene();
    });

    cbShowBodyCol.addEventListener('change', (event) => {
        addScene();
    });

    loadCar(datFile, pcxFile, palFile);
    animate();
}
