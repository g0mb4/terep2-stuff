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
const cbShowSegmentId = document.getElementById('show-seg-id');

const SKIN_WIDTH = 320;
const SKIN_HEIGHT = 200;

let points1 = [];
let points2 = [];
let points3 = [];

let carBody = new THREE.Group();
let wheelTextures = null;
let activeWheelMeshes = [];

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

// based on: https://github.com/Zi9/Deformers/blob/master/src/Engine/Assets/DFCarAsset.c 
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
        unknown: view.getUint16(offset + 6, true),
        drive_mode: view.getUint16(offset + 8, true)
    };
    offset += 10;

    let p1Offset = header.chunk1_start;
    const num_points1 = view.getUint16(p1Offset, true);
    p1Offset += 2;

    const POINT1_SIZE = 4 + 4 + 4 + 10 + 4 + 2;
    
    const geometryPoints = [];
    
    for (let i = 0; i < num_points1; i++) {
        const p1 = {
            x: view.getInt32(p1Offset, true),
            y: view.getInt32(p1Offset + 4, true),
            z: view.getInt32(p1Offset + 8, true),
            radius: view.getInt32(p1Offset + 22, true),
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

    return driveMode;
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

// source:
// https://github.com/Zi9/Deformers/blob/master/src/Engine/Rendering/DFCarRenderer.c
export function createCarMesh(MODEL_SCALE = 10000000.0) {
    carBody = new THREE.Group();
    const cubeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const wheelStyle = document.querySelector('input[name="wheel-style"]:checked')?.value;
    const vertexStyle = document.querySelector('input[name="vertex-style"]:checked')?.value;

    const getColor = (hex) => new THREE.Color(hex);
    const wheels = [];
    let vertexID = -1;

    points1.forEach((pt) => {
        const posX = pt.x / MODEL_SCALE;
        const posY = pt.y / MODEL_SCALE;
        const posZ = pt.z / MODEL_SCALE;
        vertexID += 1;

        if (pt.type === POINT.CAMERA) {
            if (cbShowCam.checked) {
                const cubeMat = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
                const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
                cubeMesh.position.set(posX, posY, posZ);
                carBody.add(cubeMesh);
            } else {
                return;
            }
        }

        if (pt.type === POINT.GEOMETRY) {
            if (vertexStyle == "cube") {
                const cubeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
                const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
                cubeMesh.position.set(posX, posY, posZ);
                carBody.add(cubeMesh);
            }

            if (vertexStyle == "label") {
                const textSprite = createTextSprite(vertexID.toString(), "#000000");
                textSprite.position.set(posX, posY, posZ);
                carBody.add(textSprite);
            }
        }

        if (pt.type === POINT.WHEEL_FRONT || pt.type === POINT.WHEEL_REAR) {
            if (pt.radius <= 0) return

            const pos = new THREE.Vector3(posX, posY, posZ);
            const norm = new THREE.Vector3(posX < 0 ? -1 : 1, 0, 0);

            if (cbShowWheelNorm.checked) {
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    pos,
                    pos.clone().add(norm.clone().multiplyScalar(0.5))
                ]);
                carBody.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xFF0000 })));
            }

            if (wheelStyle == "textured") {
                const wheel = {
                    pos: new THREE.Vector3(posX, posY, posZ),
                    diam: (pt.radius / MODEL_SCALE)*2,
                    norm: norm,
                };

                wheels.push(wheel);
            }

            if (wheelStyle == "simple") {
                if (vertexStyle == "cube") {
                    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xFF00FF });
                    const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
                    cubeMesh.position.set(posX, posY, posZ);
                    carBody.add(cubeMesh);
                }

                if (vertexStyle == "label") {
                    const textSprite = createTextSprite(vertexID.toString(), "#FF00FF");
                    textSprite.position.set(posX, posY, posZ);
                    carBody.add(textSprite);
                }

                const circleGeo = new THREE.BufferGeometry();
                const segments = 32;
                const positions = new Float32Array((segments + 1) * 3);

                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * Math.PI * 2;
                    positions[i * 3]     = 0;                                           // x
                    positions[i * 3 + 1] = Math.cos(theta) * pt.radius / MODEL_SCALE;   // y
                    positions[i * 3 + 2] = Math.sin(theta) * pt.radius / MODEL_SCALE;   // z
                }

                circleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const circleMat = new THREE.LineBasicMaterial({ color: 0xFF00FF });
                const circleLine = new THREE.LineLoop(circleGeo, circleMat);
                circleLine.position.set(posX, posY, posZ);
                carBody.add(circleLine);
            }
        }
    });

    let segmentID = -1;
    points2.forEach((seg) => {
        const pA = points1[seg.a];
        const pB = points1[seg.b];
        segmentID += 1;

        if (!pA || !pB) return;

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

        if (pA.type == POINT.CAMERA || pB.type == POINT.CAMERA) {
            if (cbShowCam.checked) {
                color = 0x00ff00;
            } else {
                return;
            }
        }
        //if ((pA.type == POINT.WHEEL_REAR || pB.type == POINT.WHEEL_REAR)) return;
        //if ((pA.type == POINT.WHEEL_FRONT || pB.type == POINT.WHEEL_FRONT)) return;

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(pA.x / MODEL_SCALE, pA.y / MODEL_SCALE, pA.z / MODEL_SCALE),
            new THREE.Vector3(pB.x / MODEL_SCALE, pB.y / MODEL_SCALE, pB.z / MODEL_SCALE)
        ]);

        const lineMat = new THREE.LineBasicMaterial({ color });
        const line = new THREE.Line(lineGeo, lineMat);
        carBody.add(line);

        if (cbShowSegmentId.checked) {
            const sX = ((pA.x + pB.x) / 2) / MODEL_SCALE;
            const sY = ((pA.y + pB.y) / 2) / MODEL_SCALE;
            const sZ = ((pA.z + pB.z) / 2) / MODEL_SCALE;

            const textSprite = createTextSprite(segmentID.toString(), "#FFFFFF");
            textSprite.position.set(sX, sY, sZ);
            carBody.add(textSprite);
        }
    });

    return { carBody, wheels };
}

function cloneAndFlipX(texture) {
    const flipped = texture.clone();
    flipped.wrapS = THREE.RepeatWrapping;
    flipped.repeat.x = -1;
    flipped.offset.x = 1;
    flipped.needsUpdate = true;
    return flipped;
}

function cloneAndFlipY(texture) {
    const flipped = texture.clone();
    flipped.wrapT = THREE.RepeatWrapping;
    flipped.repeat.y = -1;
    flipped.offset.y = 1;
    flipped.needsUpdate = true;
    return flipped;
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

    if (width != SKIN_WIDTH || height != SKIN_HEIGHT) {
        throw new Error("Invalid PCX dimensions.");
    }

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

    return { indices, palette };
}

function parsePCXTexture(arrayBuffer) {
    const { indices, palette } = decodePCX(arrayBuffer);

    const canvas = document.createElement('canvas');
    canvas.width = SKIN_WIDTH;
    canvas.height = SKIN_HEIGHT;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(SKIN_WIDTH, SKIN_HEIGHT);

    for (let i = 0; i < SKIN_WIDTH * SKIN_HEIGHT; i++) {
        const colorIdx = indices[i];
        const pixelIdx = i * 4;
        imgData.data[pixelIdx]     = palette[colorIdx * 3];         // R
        imgData.data[pixelIdx + 1] = palette[colorIdx * 3 + 1];     // G
        imgData.data[pixelIdx + 2] = palette[colorIdx * 3 + 2];     // B

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

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color().setRGB( 0.5, 0.5, 0.5 );

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.up.set(0, 0, 1);
camera.position.set(-2, -2, 1);

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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 80, 30);
    scene.add(dirLight);

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

        const texture = parsePCXTexture(pcxBuffer);
        wheelTextures = {
            front1 : getSubTexture(texture, 118, 2, 148, 32, 31, 31),
            front2 : getSubTexture(texture, 150, 2, 178, 32, 31, 31),
            front3 : getSubTexture(texture, 180, 2, 205, 32, 31, 31),
            front4 : getSubTexture(texture, 207, 2, 225, 32, 31, 31),
            front5 : getSubTexture(texture, 227, 2, 238, 32, 31, 31),
            back1 : getSubTexture(texture, 118, 34, 147, 63, 31, 31),
            back2 : getSubTexture(texture, 149, 34, 177, 63, 31, 31),
            back3 : getSubTexture(texture, 179, 34, 204, 63, 31, 31),
            back4 : getSubTexture(texture, 206, 34, 225, 63, 31, 31),
        }

        const driveMode = parseDat(datBuffer);

        addScene();

        statusEl.innerHTML = `DAT: ${datFile}<br>` +
                             `PCX: ${pcxFile}<br><br>` +
                             `Drive: ${driveMode}<br>`;

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

export function initTerep2CarViewer(options = {}) {
    const {
        datFile = "CAR1.DAT",
        pcxFile = "TESTW.PCX",
    } = options;

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

    cbShowSegmentId.addEventListener('change', (event) => {
        addScene();
    });

    loadCar(datFile, pcxFile);
    animate();
}