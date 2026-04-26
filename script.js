import * as THREE from "three";

const errorBox = document.getElementById("errorBox");

function showError(err){
  const msg = err && err.stack ? err.stack : String(err);
  console.error(err);
  errorBox.textContent = "エラー内容:\n" + msg;
  errorBox.classList.remove("hidden");
}

window.addEventListener("error", e => showError(e.error || e.message));
window.addEventListener("unhandledrejection", e => showError(e.reason));

try {

if(!window.Blockly){
  throw new Error("Blocklyが読み込めませんでした。インターネット接続を確認してください。");
}

const canvas = document.getElementById("stage");
const stageWrap = document.getElementById("stageWrap");
const gizmoOverlay = document.getElementById("gizmoOverlay");

const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const clearBtn = document.getElementById("clearBtn");

const statusEl = document.getElementById("status");
const spriteListEl = document.getElementById("spriteList");
const selectedSpriteNameEl = document.getElementById("selectedSpriteName");
const blocklyTargetNameEl = document.getElementById("blocklyTargetName");

const propName = document.getElementById("propName");
const propX = document.getElementById("propX");
const propY = document.getElementById("propY");
const propZ = document.getElementById("propZ");
const propRotX = document.getElementById("propRotX");
const propRotY = document.getElementById("propRotY");
const propRotZ = document.getElementById("propRotZ");
const propScaleX = document.getElementById("propScaleX");
const propScaleY = document.getElementById("propScaleY");
const propScaleZ = document.getElementById("propScaleZ");
const propColor = document.getElementById("propColor");

const modal = document.getElementById("spriteModal");

const moveGizmo = document.getElementById("moveGizmo");
const scaleGizmo = document.getElementById("scaleGizmo");
const rotateGizmo = document.getElementById("rotateGizmo");

const gizmoParts = {
  moveXLine: document.getElementById("moveXLine"),
  moveXHead: document.getElementById("moveXHead"),
  moveYLine: document.getElementById("moveYLine"),
  moveYHead: document.getElementById("moveYHead"),
  moveZLine: document.getElementById("moveZLine"),
  moveZHead: document.getElementById("moveZHead"),

  scaleXLine: document.getElementById("scaleXLine"),
  scaleXBox: document.getElementById("scaleXBox"),
  scaleYLine: document.getElementById("scaleYLine"),
  scaleYBox: document.getElementById("scaleYBox"),
  scaleZLine: document.getElementById("scaleZLine"),
  scaleZBox: document.getElementById("scaleZBox"),

  rotateXRing: document.getElementById("rotateXRing"),
  rotateYRing: document.getElementById("rotateYRing"),
  rotateZRing: document.getElementById("rotateZRing")
};

let sprites = [];
let selectedSpriteId = null;
let running = false;
let runSnapshot = null;
let editMode = "translate";
let workspace = null;
let isLoadingWorkspace = false;
let lastTime = 0;

const pressedKeys = new Set();

let drag = null;
let viewDrag = null;

function uid(){
  return crypto && crypto.randomUUID ? crypto.randomUUID() : "id_" + Math.random().toString(36).slice(2);
}

function cloneJson(value){
  try { return structuredClone(value); }
  catch(_) { return JSON.parse(JSON.stringify(value)); }
}

/* -----------------------------
   Three.js
----------------------------- */

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.domElement.style.touchAction = "none";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);

const previewCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
previewCamera.position.set(7, 5, 8);

const gameCamera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let viewTarget = new THREE.Vector3(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x335577, 1.6));

const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(5, 8, 4);
scene.add(dir);

scene.add(new THREE.GridHelper(40, 40, 0x64748b, 0x94a3b8));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

function createGeometry(kind){
  if(kind === "sphere") return new THREE.SphereGeometry(0.7, 32, 18);
  if(kind === "cylinder") return new THREE.CylinderGeometry(0.55, 0.55, 1.3, 32);
  if(kind === "capsule" && THREE.CapsuleGeometry) return new THREE.CapsuleGeometry(0.45, 1.1, 8, 16);
  if(kind === "capsule") return new THREE.CylinderGeometry(0.45, 0.45, 1.4, 24);
  if(kind === "cone") return new THREE.ConeGeometry(0.65, 1.4, 32);
  return new THREE.BoxGeometry(1.4, 0.8, 1.0);
}

function createCameraObject(){
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.55, 0.55),
    new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.65 })
  );
  group.add(body);

  const points = [];
  const lines = [
    [0,0,-0.5, 0,0,-3.2],
    [0,0,-0.55, -1.1,0.7,-3.2],
    [0,0,-0.55, 1.1,0.7,-3.2],
    [0,0,-0.55, -1.1,-0.7,-3.2],
    [0,0,-0.55, 1.1,-0.7,-3.2],
    [-1.1,0.7,-3.2, 1.1,0.7,-3.2],
    [1.1,0.7,-3.2, 1.1,-0.7,-3.2],
    [1.1,-0.7,-3.2, -1.1,-0.7,-3.2],
    [-1.1,-0.7,-3.2, -1.1,0.7,-3.2]
  ];
  for(const p of lines){
    points.push(new THREE.Vector3(p[0],p[1],p[2]), new THREE.Vector3(p[3],p[4],p[5]));
  }

  const guide = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  group.add(guide);

  return group;
}

function createObject(kind, color){
  if(kind === "camera") return createCameraObject();
  return new THREE.Mesh(
    createGeometry(kind),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  );
}

function colorForKind(kind){
  return {
    box:"#3b82f6",
    sphere:"#f97316",
    cylinder:"#06b6d4",
    capsule:"#22c55e",
    cone:"#eab308",
    camera:"#111827"
  }[kind] || "#3b82f6";
}

function kindName(kind){
  return {
    box:"直方体",
    sphere:"球",
    cylinder:"円柱",
    capsule:"Capsule",
    cone:"円すい",
    camera:"カメラ"
  }[kind] || kind;
}

function setSpriteIdDeep(object, id){
  object.userData.spriteId = id;
  object.traverse(child => child.userData.spriteId = id);
}

/* -----------------------------
   Blockly
----------------------------- */

function defineBlocklyBlocks(){
  Blockly.defineBlocksWithJsonArray([
    {"type":"event_start","message0":"▶ はじまったとき %1 %2","args0":[{"type":"input_dummy"},{"type":"input_statement","name":"DO"}],"colour":40},
    {"type":"event_forever","message0":"ずっと %1 %2","args0":[{"type":"input_dummy"},{"type":"input_statement","name":"DO"}],"colour":40},
    {"type":"move_forward","message0":"前に %1 動く","args0":[{"type":"field_number","name":"AMOUNT","value":1,"precision":0.1}],"previousStatement":null,"nextStatement":null,"colour":210},
    {"type":"turn_y","message0":"Y回転 %1 度","args0":[{"type":"field_number","name":"DEG","value":15,"precision":1}],"previousStatement":null,"nextStatement":null,"colour":210},
    {"type":"go_to","message0":"座標 x %1 y %2 z %3 へ行く","args0":[{"type":"field_number","name":"X","value":0,"precision":0.1},{"type":"field_number","name":"Y","value":1,"precision":0.1},{"type":"field_number","name":"Z","value":0,"precision":0.1}],"previousStatement":null,"nextStatement":null,"colour":210},
    {"type":"jump","message0":"ジャンプ 強さ %1","args0":[{"type":"field_number","name":"POWER","value":0.18,"precision":0.01}],"previousStatement":null,"nextStatement":null,"colour":210},
    {"type":"set_color","message0":"色を %1 にする","args0":[{"type":"field_colour","name":"COLOR","colour":"#ff6b6b"}],"previousStatement":null,"nextStatement":null,"colour":270},
    {"type":"set_scale","message0":"大きさを %1 倍にする","args0":[{"type":"field_number","name":"SCALE","value":1.2,"precision":0.1}],"previousStatement":null,"nextStatement":null,"colour":270},
    {"type":"set_scale_xyz","message0":"大きさ x %1 y %2 z %3 にする","args0":[{"type":"field_number","name":"X","value":1,"precision":0.1},{"type":"field_number","name":"Y","value":1,"precision":0.1},{"type":"field_number","name":"Z","value":1,"precision":0.1}],"previousStatement":null,"nextStatement":null,"colour":270},
    {"type":"wait_seconds","message0":"%1 秒待つ","args0":[{"type":"field_number","name":"SEC","value":1,"precision":0.1}],"previousStatement":null,"nextStatement":null,"colour":330},
    {"type":"key_pressed","message0":"キー %1 が押された","args0":[{"type":"field_dropdown","name":"KEY","options":[["↑","ArrowUp"],["↓","ArrowDown"],["←","ArrowLeft"],["→","ArrowRight"],["スペース"," "],["W","w"],["A","a"],["S","s"],["D","d"]]}],"output":"Boolean","colour":180}
  ]);
}

function initBlockly(){
  defineBlocklyBlocks();

  workspace = Blockly.inject("blocklyDiv", {
    toolbox: document.getElementById("toolbox"),
    trashcan: true,
    scrollbars: true,
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.9,
      maxScale: 1.5,
      minScale: 0.45,
      scaleSpeed: 1.1
    }
  });

  workspace.addChangeListener(() => {
    if(isLoadingWorkspace) return;
    const sprite = getSelectedSprite();
    if(sprite) sprite.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  });
}

function defaultWorkspace(kind){
  if(kind === "camera"){
    return {
      blocks: {
        languageVersion: 0,
        blocks: [{
          type:"event_start",
          id:uid(),
          x:30,
          y:30,
          inputs:{
            DO:{ block:{ type:"go_to", id:uid(), fields:{ X:0, Y:3, Z:8 } } }
          }
        }]
      }
    };
  }

  return {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type:"event_forever",
        id:uid(),
        x:30,
        y:30,
        inputs:{
          DO:{ block:{
            type:"controls_if",
            id:uid(),
            inputs:{
              IF0:{ block:{ type:"key_pressed", id:uid(), fields:{ KEY:"ArrowUp" } } },
              DO0:{ block:{ type:"move_forward", id:uid(), fields:{ AMOUNT:1 } } }
            }
          }}
        }
      }]
    }
  };
}

function loadWorkspaceFor(sprite){
  if(!workspace) return;

  isLoadingWorkspace = true;
  workspace.clear();

  try {
    Blockly.serialization.workspaces.load(sprite.workspaceJson || defaultWorkspace(sprite.kind), workspace);
  } catch(e) {
    console.warn(e);
    Blockly.serialization.workspaces.load(defaultWorkspace(sprite.kind), workspace);
  }

  isLoadingWorkspace = false;
  blocklyTargetNameEl.textContent = sprite.name;
}

/* -----------------------------
   Sprite
----------------------------- */

function addSprite(kind){
  const id = uid();
  const color = colorForKind(kind);
  const object = createObject(kind, color);

  if(kind === "camera"){
    object.position.set(0, 3, 8);
    object.rotation.set(0, 0, 0);
  } else {
    object.position.set((sprites.length % 5) * 1.6, 0.75, Math.floor(sprites.length / 5) * 1.6);
  }

  setSpriteIdDeep(object, id);
  scene.add(object);

  const sprite = {
    id,
    name: kind === "camera" ? "Camera" : kindName(kind) + " " + (sprites.filter(s => s.kind !== "camera").length + 1),
    kind,
    color,
    object,
    velocityY: 0,
    waitTimer: 0,
    startDone: false,
    workspaceJson: defaultWorkspace(kind)
  };

  sprites.push(sprite);
  selectSprite(id);
}

function addInitialCamera(){
  if(!sprites.some(s => s.kind === "camera")) addSprite("camera");
}

function getSelectedSprite(){
  return sprites.find(s => s.id === selectedSpriteId) || null;
}

function getGameCameraSprite(){
  return sprites.find(s => s.kind === "camera") || null;
}

function selectSprite(id){
  const current = getSelectedSprite();
  if(current && workspace){
    current.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  }

  selectedSpriteId = id;
  const sprite = getSelectedSprite();

  if(sprite) loadWorkspaceFor(sprite);

  renderAll();
}

function renderAll(){
  renderSpriteList();
  renderProps();
  updateGizmo();
}

function renderSpriteList(){
  spriteListEl.innerHTML = "";

  for(const sprite of sprites){
    const item = document.createElement("div");
    item.className = "spriteItem" + (sprite.id === selectedSpriteId ? " active" : "");
    item.onclick = () => selectSprite(sprite.id);

    const thumb = document.createElement("div");
    thumb.className = "spriteThumb";
    thumb.style.background = sprite.color;
    thumb.textContent = sprite.kind === "camera" ? "📷" : "3D";

    const info = document.createElement("div");
    info.className = "spriteInfo";

    const name = document.createElement("div");
    name.className = "spriteName";
    name.textContent = sprite.name;

    const kind = document.createElement("div");
    kind.className = "spriteKind";
    kind.textContent = kindName(sprite.kind);

    info.append(name, kind);
    item.append(thumb, info);
    spriteListEl.append(item);
  }
}

function renderProps(){
  const sprite = getSelectedSprite();

  if(!sprite){
    selectedSpriteNameEl.textContent = "未選択";
    blocklyTargetNameEl.textContent = "未選択";
    for(const input of [propName, propX, propY, propZ, propRotX, propRotY, propRotZ, propScaleX, propScaleY, propScaleZ]){
      input.value = "";
    }
    return;
  }

  selectedSpriteNameEl.textContent = sprite.name;
  blocklyTargetNameEl.textContent = sprite.name;

  propName.value = sprite.name;
  propX.value = sprite.object.position.x.toFixed(1);
  propY.value = sprite.object.position.y.toFixed(1);
  propZ.value = sprite.object.position.z.toFixed(1);
  propRotX.value = THREE.MathUtils.radToDeg(sprite.object.rotation.x).toFixed(0);
  propRotY.value = THREE.MathUtils.radToDeg(sprite.object.rotation.y).toFixed(0);
  propRotZ.value = THREE.MathUtils.radToDeg(sprite.object.rotation.z).toFixed(0);
  propScaleX.value = sprite.object.scale.x.toFixed(1);
  propScaleY.value = sprite.object.scale.y.toFixed(1);
  propScaleZ.value = sprite.object.scale.z.toFixed(1);
  propColor.value = sprite.color;
}

function applyProps(){
  const sprite = getSelectedSprite();
  if(!sprite) return;

  sprite.name = propName.value || "Sprite";
  sprite.object.position.set(
    Number(propX.value) || 0,
    Number(propY.value) || 0,
    Number(propZ.value) || 0
  );

  sprite.object.rotation.set(
    THREE.MathUtils.degToRad(Number(propRotX.value) || 0),
    THREE.MathUtils.degToRad(Number(propRotY.value) || 0),
    THREE.MathUtils.degToRad(Number(propRotZ.value) || 0)
  );

  sprite.object.scale.set(
    Math.max(0.1, Number(propScaleX.value) || 1),
    Math.max(0.1, Number(propScaleY.value) || 1),
    Math.max(0.1, Number(propScaleZ.value) || 1)
  );

  sprite.color = propColor.value || "#3b82f6";
  setObjectColor(sprite);

  renderSpriteList();
  updateGizmo();
}

function setObjectColor(sprite){
  sprite.object.traverse(child => {
    if(child.isMesh && child.material && child.material.color){
      child.material.color.set(sprite.color);
    }
  });
}

/* -----------------------------
   SVG Gizmo
----------------------------- */

function projectToScreen(object){
  const rect = stageWrap.getBoundingClientRect();
  const pos = object.position.clone();
  pos.project(previewCamera);

  return {
    x: (pos.x * 0.5 + 0.5) * rect.width,
    y: (-pos.y * 0.5 + 0.5) * rect.height,
    visible: pos.z > -1 && pos.z < 1
  };
}

function setLine(el, x1, y1, x2, y2){
  el.setAttribute("x1", x1);
  el.setAttribute("y1", y1);
  el.setAttribute("x2", x2);
  el.setAttribute("y2", y2);
}

function setHead(el, points){
  el.setAttribute("points", points.map(p => p.join(",")).join(" "));
}

function arrowHead(x, y, angle){
  const size = 15;
  const a1 = angle + Math.PI * 0.78;
  const a2 = angle - Math.PI * 0.78;

  return [
    [x, y],
    [x + Math.cos(a1) * size, y + Math.sin(a1) * size],
    [x + Math.cos(a2) * size, y + Math.sin(a2) * size]
  ];
}

function updateGizmo(){
  const sprite = getSelectedSprite();

  if(!sprite || running || editMode === "view"){
    gizmoOverlay.style.display = "none";
    return;
  }

  const rect = stageWrap.getBoundingClientRect();
  gizmoOverlay.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  gizmoOverlay.style.display = "";

  const p = projectToScreen(sprite.object);

  if(!p.visible){
    gizmoOverlay.style.display = "none";
    return;
  }

  const len = 88;
  const xDir = { x: 1, y: 0 };
  const yDir = { x: 0, y: -1 };
  const zDir = { x: 0.72, y: 0.72 };

  moveGizmo.style.display = editMode === "translate" ? "" : "none";
  scaleGizmo.style.display = editMode === "scale" ? "" : "none";
  rotateGizmo.style.display = editMode === "rotate" ? "" : "none";

  // 移動
  setLine(gizmoParts.moveXLine, p.x, p.y, p.x + xDir.x * len, p.y + xDir.y * len);
  setHead(gizmoParts.moveXHead, arrowHead(p.x + xDir.x * len, p.y + xDir.y * len, 0));

  setLine(gizmoParts.moveYLine, p.x, p.y, p.x + yDir.x * len, p.y + yDir.y * len);
  setHead(gizmoParts.moveYHead, arrowHead(p.x + yDir.x * len, p.y + yDir.y * len, -Math.PI / 2));

  setLine(gizmoParts.moveZLine, p.x, p.y, p.x + zDir.x * len, p.y + zDir.y * len);
  setHead(gizmoParts.moveZHead, arrowHead(p.x + zDir.x * len, p.y + zDir.y * len, Math.PI / 4));

  // スケール
  setLine(gizmoParts.scaleXLine, p.x, p.y, p.x + xDir.x * len, p.y + xDir.y * len);
  setBox(gizmoParts.scaleXBox, p.x + xDir.x * len - 13, p.y + xDir.y * len - 13);

  setLine(gizmoParts.scaleYLine, p.x, p.y, p.x + yDir.x * len, p.y + yDir.y * len);
  setBox(gizmoParts.scaleYBox, p.x + yDir.x * len - 13, p.y + yDir.y * len - 13);

  setLine(gizmoParts.scaleZLine, p.x, p.y, p.x + zDir.x * len, p.y + zDir.y * len);
  setBox(gizmoParts.scaleZBox, p.x + zDir.x * len - 13, p.y + zDir.y * len - 13);

  // 回転リング。2Dリングで安定操作
  setCircle(gizmoParts.rotateXRing, p.x, p.y, 62);
  setCircle(gizmoParts.rotateYRing, p.x, p.y, 78);
  setCircle(gizmoParts.rotateZRing, p.x, p.y, 94);
}

function setBox(el, x, y){
  el.setAttribute("x", x);
  el.setAttribute("y", y);
}

function setCircle(el, x, y, r){
  el.setAttribute("cx", x);
  el.setAttribute("cy", y);
  el.setAttribute("r", r);
}

function startGizmoDrag(axis, mode, e){
  const sprite = getSelectedSprite();
  if(!sprite || running) return;

  e.preventDefault();
  e.stopPropagation();

  drag = {
    axis,
    mode,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    spriteId: sprite.id,
    startPosition: sprite.object.position.clone(),
    startRotation: sprite.object.rotation.clone(),
    startScale: sprite.object.scale.clone()
  };

  try { gizmoOverlay.setPointerCapture(e.pointerId); } catch(_) {}
}

function updateGizmoDrag(e){
  if(!drag || e.pointerId !== drag.pointerId) return;

  e.preventDefault();
  e.stopPropagation();

  const sprite = sprites.find(s => s.id === drag.spriteId);
  if(!sprite) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  if(drag.mode === "translate"){
    const amountX = dx * 0.03;
    const amountY = -dy * 0.03;
    const amountZ = (dx + dy) * 0.02;

    sprite.object.position.copy(drag.startPosition);

    if(drag.axis === "x") sprite.object.position.x += amountX;
    if(drag.axis === "y") sprite.object.position.y += amountY;
    if(drag.axis === "z") sprite.object.position.z += amountZ;
  }

  if(drag.mode === "scale"){
    sprite.object.scale.copy(drag.startScale);

    const amountX = dx * 0.02;
    const amountY = -dy * 0.02;
    const amountZ = (dx + dy) * 0.015;

    if(drag.axis === "x") sprite.object.scale.x = Math.max(0.1, drag.startScale.x + amountX);
    if(drag.axis === "y") sprite.object.scale.y = Math.max(0.1, drag.startScale.y + amountY);
    if(drag.axis === "z") sprite.object.scale.z = Math.max(0.1, drag.startScale.z + amountZ);
  }

  if(drag.mode === "rotate"){
    sprite.object.rotation.copy(drag.startRotation);

    const amount = (dx + dy) * 0.01;

    if(drag.axis === "x") sprite.object.rotation.x += amount;
    if(drag.axis === "y") sprite.object.rotation.y += amount;
    if(drag.axis === "z") sprite.object.rotation.z += amount;
  }

  renderProps();
  updateGizmo();
}

function endGizmoDrag(e){
  if(!drag) return;
  if(e && e.pointerId !== drag.pointerId) return;

  try {
    if(e) gizmoOverlay.releasePointerCapture(e.pointerId);
  } catch(_) {}

  drag = null;
}

function setupGizmoEvents(){
  const bindings = [
    ["moveXLine","x","translate"], ["moveXHead","x","translate"],
    ["moveYLine","y","translate"], ["moveYHead","y","translate"],
    ["moveZLine","z","translate"], ["moveZHead","z","translate"],

    ["scaleXLine","x","scale"], ["scaleXBox","x","scale"],
    ["scaleYLine","y","scale"], ["scaleYBox","y","scale"],
    ["scaleZLine","z","scale"], ["scaleZBox","z","scale"],

    ["rotateXRing","x","rotate"],
    ["rotateYRing","y","rotate"],
    ["rotateZRing","z","rotate"]
  ];

  for(const [id, axis, mode] of bindings){
    const el = document.getElementById(id);
    el.addEventListener("pointerdown", e => startGizmoDrag(axis, mode, e));
  }

  gizmoOverlay.addEventListener("pointermove", updateGizmoDrag);
  gizmoOverlay.addEventListener("pointerup", endGizmoDrag);
  gizmoOverlay.addEventListener("pointercancel", endGizmoDrag);
  gizmoOverlay.addEventListener("lostpointercapture", () => drag = null);
}

/* -----------------------------
   Stage picking / view control
----------------------------- */

function pickSprite(e){
  if(running || drag || editMode === "view") return;

  const rect = stageWrap.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, previewCamera);

  const meshes = [];
  for(const sprite of sprites){
    sprite.object.traverse(child => {
      if(child.isMesh) meshes.push(child);
    });
  }

  const hits = raycaster.intersectObjects(meshes, false);

  if(hits.length){
    const id = hits[0].object.userData.spriteId;
    if(sprites.some(s => s.id === id)) selectSprite(id);
  }
}

function startViewDrag(e){
  if(editMode !== "view" || running) return;

  e.preventDefault();

  viewDrag = {
    pointerId: e.pointerId,
    lastX: e.clientX,
    lastY: e.clientY
  };

  try { stageWrap.setPointerCapture(e.pointerId); } catch(_) {}
}

function updateViewDrag(e){
  if(!viewDrag || e.pointerId !== viewDrag.pointerId) return;

  e.preventDefault();

  const dx = e.clientX - viewDrag.lastX;
  const dy = e.clientY - viewDrag.lastY;
  viewDrag.lastX = e.clientX;
  viewDrag.lastY = e.clientY;

  const offset = previewCamera.position.clone().sub(viewTarget);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= dx * 0.006;
  spherical.phi += dy * 0.006;
  spherical.phi = Math.max(0.12, Math.min(Math.PI - 0.12, spherical.phi));

  offset.setFromSpherical(spherical);
  previewCamera.position.copy(viewTarget).add(offset);
  previewCamera.lookAt(viewTarget);
}

function endViewDrag(e){
  if(!viewDrag) return;
  if(e && e.pointerId !== viewDrag.pointerId) return;

  try {
    if(e) stageWrap.releasePointerCapture(e.pointerId);
  } catch(_) {}

  viewDrag = null;
}

stageWrap.addEventListener("pointerdown", e => {
  if(editMode === "view") {
    startViewDrag(e);
  } else {
    pickSprite(e);
  }
});

stageWrap.addEventListener("pointermove", updateViewDrag);
stageWrap.addEventListener("pointerup", endViewDrag);
stageWrap.addEventListener("pointercancel", endViewDrag);

stageWrap.addEventListener("wheel", e => {
  if(editMode !== "view") return;

  e.preventDefault();

  const offset = previewCamera.position.clone().sub(viewTarget);
  const scale = e.deltaY > 0 ? 1.08 : 0.92;
  offset.multiplyScalar(scale);

  const minDistance = 2;
  const maxDistance = 80;
  const distance = offset.length();
  if(distance < minDistance) offset.setLength(minDistance);
  if(distance > maxDistance) offset.setLength(maxDistance);

  previewCamera.position.copy(viewTarget).add(offset);
  previewCamera.lookAt(viewTarget);
}, { passive:false });

/* -----------------------------
   Execution
----------------------------- */

function child(input){
  return input?.block || null;
}

function topBlocksFor(sprite, type){
  return sprite.workspaceJson?.blocks?.blocks?.filter(b => b.type === type) || [];
}

function execChain(sprite, block, dt){
  let cur = block;
  let guard = 0;

  while(cur && guard++ < 200){
    const result = execOne(sprite, cur, dt);
    if(result === "WAIT") return "WAIT";
    cur = cur.next?.block || null;
  }

  return "DONE";
}

function execOne(sprite, block, dt){
  if(!block) return "DONE";

  if(block.type === "move_forward"){
    const amount = Number(block.fields?.AMOUNT ?? 1);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(sprite.object.quaternion);
    sprite.object.position.addScaledVector(forward, amount * dt * 3);
  }

  if(block.type === "turn_y"){
    sprite.object.rotation.y += THREE.MathUtils.degToRad(Number(block.fields?.DEG ?? 15)) * dt * 4;
  }

  if(block.type === "go_to"){
    sprite.object.position.set(
      Number(block.fields?.X ?? 0),
      Number(block.fields?.Y ?? 1),
      Number(block.fields?.Z ?? 0)
    );
  }

  if(block.type === "jump" && sprite.kind !== "camera"){
    if(sprite.object.position.y <= 0.76){
      sprite.velocityY = Number(block.fields?.POWER ?? 0.18);
    }
  }

  if(block.type === "set_color"){
    sprite.color = block.fields?.COLOR || "#ff6b6b";
    setObjectColor(sprite);
  }

  if(block.type === "set_scale"){
    const sc = Math.max(0.1, Number(block.fields?.SCALE ?? 1));
    sprite.object.scale.setScalar(sc);
  }

  if(block.type === "set_scale_xyz"){
    sprite.object.scale.set(
      Math.max(0.1, Number(block.fields?.X ?? 1)),
      Math.max(0.1, Number(block.fields?.Y ?? 1)),
      Math.max(0.1, Number(block.fields?.Z ?? 1))
    );
  }

  if(block.type === "wait_seconds"){
    if(sprite.waitTimer <= 0){
      sprite.waitTimer = Math.max(0, Number(block.fields?.SEC ?? 1));
    }

    sprite.waitTimer -= dt;
    if(sprite.waitTimer > 0) return "WAIT";
    sprite.waitTimer = 0;
  }

  if(block.type === "controls_if"){
    if(evalBool(child(block.inputs?.IF0))){
      const result = execChain(sprite, child(block.inputs?.DO0), dt);
      if(result === "WAIT") return "WAIT";
    }
  }

  return "DONE";
}

function evalBool(block){
  if(!block) return false;

  if(block.type === "key_pressed"){
    return pressedKeys.has(block.fields?.KEY || "ArrowUp");
  }

  if(block.type === "logic_boolean"){
    return block.fields?.BOOL === "TRUE";
  }

  return false;
}

function executeSprite(sprite, dt){
  if(!sprite.startDone){
    for(const block of topBlocksFor(sprite, "event_start")){
      execChain(sprite, child(block.inputs?.DO), dt);
    }
    sprite.startDone = true;
  }

  for(const block of topBlocksFor(sprite, "event_forever")){
    execChain(sprite, child(block.inputs?.DO), dt);
  }
}

function updatePhysics(sprite){
  if(sprite.kind === "camera") return;

  sprite.velocityY -= 0.012;
  sprite.object.position.y += sprite.velocityY;

  if(sprite.object.position.y < 0.75){
    sprite.object.position.y = 0.75;
    sprite.velocityY = 0;
  }
}

function makeRunSnapshot(){
  return sprites.map(sprite => ({
    id: sprite.id,
    name: sprite.name,
    kind: sprite.kind,
    color: sprite.color,
    position: sprite.object.position.clone(),
    rotation: sprite.object.rotation.clone(),
    quaternion: sprite.object.quaternion.clone(),
    scale: sprite.object.scale.clone(),
    visible: sprite.object.visible,
    workspaceJson: cloneJson(sprite.workspaceJson)
  }));
}

function restoreRunSnapshot(){
  if(!runSnapshot) return;

  for(const saved of runSnapshot){
    const sprite = sprites.find(s => s.id === saved.id);
    if(!sprite) continue;

    sprite.name = saved.name;
    sprite.kind = saved.kind;
    sprite.color = saved.color;
    sprite.object.position.copy(saved.position);
    sprite.object.rotation.copy(saved.rotation);
    sprite.object.quaternion.copy(saved.quaternion);
    sprite.object.scale.copy(saved.scale);
    sprite.object.visible = saved.visible;
    sprite.workspaceJson = cloneJson(saved.workspaceJson);
    sprite.velocityY = 0;
    sprite.waitTimer = 0;
    sprite.startDone = false;
    setObjectColor(sprite);
  }

  const savedIds = new Set(runSnapshot.map(s => s.id));
  for(const sprite of [...sprites]){
    if(savedIds.has(sprite.id)) continue;
    scene.remove(sprite.object);
    sprites = sprites.filter(s => s.id !== sprite.id);
  }

  if(!sprites.some(s => s.id === selectedSpriteId)){
    selectedSpriteId = sprites[0]?.id || null;
  }

  const selected = getSelectedSprite();
  if(selected) loadWorkspaceFor(selected);

  renderAll();
}

function runProject(){
  if(running) return;

  const selected = getSelectedSprite();
  if(selected && workspace){
    selected.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  }

  runSnapshot = makeRunSnapshot();

  running = true;
  statusEl.textContent = "実行中";
  updateRunStopButtons();
  updateGizmo();

  for(const sprite of sprites){
    sprite.velocityY = 0;
    sprite.waitTimer = 0;
    sprite.startDone = false;
  }
}

function stopProject(){
  if(!running) return;

  running = false;
  statusEl.textContent = "停止中";
  restoreRunSnapshot();
  updateRunStopButtons();
  updateGizmo();
}

function updateRunStopButtons(){
  if(running){
    runBtn.style.display = "none";
    stopBtn.style.display = "";
  } else {
    runBtn.style.display = "";
    stopBtn.style.display = "none";
  }
}

/* -----------------------------
   Save / Load
----------------------------- */

function saveProject(){
  const selected = getSelectedSprite();
  if(selected && workspace){
    selected.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  }

  const data = {
    sprites: sprites.map(sprite => ({
      id: sprite.id,
      name: sprite.name,
      kind: sprite.kind,
      color: sprite.color,
      position: sprite.object.position.toArray(),
      rotation: [sprite.object.rotation.x, sprite.object.rotation.y, sprite.object.rotation.z],
      scale: sprite.object.scale.toArray(),
      workspaceJson: sprite.workspaceJson
    }))
  };

  localStorage.setItem("scratch3d-rebuild-project", JSON.stringify(data));
  alert("保存しました！");
}

function loadProject(){
  const raw = localStorage.getItem("scratch3d-rebuild-project");
  if(!raw){
    alert("保存データがありません。");
    return;
  }

  const data = JSON.parse(raw);
  clearSpritesOnly();

  for(const saved of data.sprites || []){
    restoreSprite(saved);
  }

  addInitialCamera();

  selectedSpriteId = sprites[0]?.id || null;
  if(selectedSpriteId) selectSprite(selectedSpriteId);
  renderAll();
}

function restoreSprite(saved){
  const id = saved.id || uid();
  const color = saved.color || colorForKind(saved.kind || "box");
  const object = createObject(saved.kind || "box", color);

  object.position.fromArray(saved.position || [0,0.75,0]);

  if(saved.rotation){
    object.rotation.set(saved.rotation[0], saved.rotation[1], saved.rotation[2]);
  }

  if(saved.scale){
    object.scale.fromArray(saved.scale);
  }

  setSpriteIdDeep(object, id);
  scene.add(object);

  sprites.push({
    id,
    name: saved.name || kindName(saved.kind || "box"),
    kind: saved.kind || "box",
    color,
    object,
    velocityY: 0,
    waitTimer: 0,
    startDone: false,
    workspaceJson: saved.workspaceJson || defaultWorkspace(saved.kind || "box")
  });
}

function clearSpritesOnly(){
  for(const sprite of sprites){
    scene.remove(sprite.object);
    sprite.object.traverse(child => {
      if(child.geometry) child.geometry.dispose();
      if(child.material) child.material.dispose?.();
    });
  }

  sprites = [];
  selectedSpriteId = null;
}

function clearProject(){
  if(!confirm("全部消しますか？")) return;

  clearSpritesOnly();
  addInitialCamera();
  addSprite("box");
}

function deleteSelectedSprite(){
  const sprite = getSelectedSprite();
  if(!sprite) return;

  if(sprite.kind === "camera" && sprites.filter(s => s.kind === "camera").length <= 1){
    alert("カメラは最低1つ必要です。");
    return;
  }

  scene.remove(sprite.object);
  sprites = sprites.filter(s => s.id !== sprite.id);
  selectedSpriteId = sprites[0]?.id || null;

  if(selectedSpriteId) selectSprite(selectedSpriteId);
  else renderAll();
}

/* -----------------------------
   Mode / UI
----------------------------- */

function setMode(mode){
  editMode = mode;

  document.querySelectorAll(".tool").forEach(btn => btn.classList.remove("active"));

  if(mode === "translate") document.getElementById("modeMoveBtn").classList.add("active");
  if(mode === "rotate") document.getElementById("modeRotateBtn").classList.add("active");
  if(mode === "scale") document.getElementById("modeScaleBtn").classList.add("active");
  if(mode === "view") document.getElementById("modeViewBtn").classList.add("active");

  updateGizmo();
}

function openModal(){
  modal.classList.remove("hidden");
}

function closeModal(){
  modal.classList.add("hidden");
}

/* -----------------------------
   Resize / Render
----------------------------- */

function resize(){
  const rect = stageWrap.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  renderer.setSize(width, height, false);

  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();

  gameCamera.aspect = width / height;
  gameCamera.updateProjectionMatrix();

  if(workspace) Blockly.svgResize(workspace);
}

function syncGameCamera(){
  const camSprite = getGameCameraSprite();
  if(!camSprite) return previewCamera;

  gameCamera.position.copy(camSprite.object.position);
  gameCamera.quaternion.copy(camSprite.object.quaternion);

  return gameCamera;
}

function animate(time){
  requestAnimationFrame(animate);

  resize();

  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;

  if(running){
    for(const sprite of sprites){
      executeSprite(sprite, dt);
      updatePhysics(sprite);
    }
    renderProps();
  }

  const activeCamera = running ? syncGameCamera() : previewCamera;
  renderer.render(scene, activeCamera);

  updateGizmo();
}

/* -----------------------------
   Events
----------------------------- */

runBtn.onclick = runProject;
stopBtn.onclick = stopProject;
saveBtn.onclick = saveProject;
loadBtn.onclick = loadProject;
clearBtn.onclick = clearProject;

document.getElementById("modeMoveBtn").onclick = () => setMode("translate");
document.getElementById("modeRotateBtn").onclick = () => setMode("rotate");
document.getElementById("modeScaleBtn").onclick = () => setMode("scale");
document.getElementById("modeViewBtn").onclick = () => setMode("view");

document.getElementById("camResetBtn").onclick = () => {
  previewCamera.position.set(7, 5, 8);
  viewTarget.set(0, 1, 0);
  previewCamera.lookAt(viewTarget);
};

document.getElementById("openAddSpriteBtn").onclick = openModal;
document.getElementById("closeModalBtn").onclick = closeModal;

modal.addEventListener("click", e => {
  if(e.target === modal) closeModal();
});

document.querySelectorAll(".choice").forEach(btn => {
  btn.addEventListener("click", () => {
    addSprite(btn.dataset.kind);
    closeModal();
  });
});

document.getElementById("deleteSpriteBtn").onclick = deleteSelectedSprite;

[
  propName, propX, propY, propZ,
  propRotX, propRotY, propRotZ,
  propScaleX, propScaleY, propScaleZ,
  propColor
].forEach(input => input.addEventListener("input", applyProps));

window.addEventListener("keydown", e => {
  pressedKeys.add(e.key);

  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)){
    e.preventDefault();
  }
});

window.addEventListener("keyup", e => {
  pressedKeys.delete(e.key);
});

/* -----------------------------
   Start
----------------------------- */

initBlockly();
setupGizmoEvents();
addInitialCamera();
addSprite("box");
setMode("translate");
updateRunStopButtons();
requestAnimationFrame(animate);

} catch(err) {
  showError(err);
}
