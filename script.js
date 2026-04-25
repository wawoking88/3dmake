import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

window.addEventListener("error", (e) => {
  console.error("JSエラー:", e.message, e.error);
  const status = document.getElementById("status");
  if (status) status.textContent = "エラー: Console確認";
});

const canvas = document.getElementById("stage");
const stageWrap = document.getElementById("stageWrap");
const spriteListEl = document.getElementById("spriteList");
const selectedSpriteNameEl = document.getElementById("selectedSpriteName");
const blocklyTargetNameEl = document.getElementById("blocklyTargetName");
const statusEl = document.getElementById("status");

const propName = document.getElementById("propName");
const propX = document.getElementById("propX");
const propY = document.getElementById("propY");
const propZ = document.getElementById("propZ");
const propColor = document.getElementById("propColor");

const modal = document.getElementById("spriteModal");

let sprites = [];
let selectedSpriteId = null;
let running = false;
let editCameraEnabled = true;
let lastTime = 0;
const pressedKeys = new Set();

let workspace = null;
let isLoadingWorkspace = false;

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(36).slice(2);
}

/* ---------------------------
   Three.js
--------------------------- */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);

const previewCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
previewCamera.position.set(7, 5, 8);

const gameCamera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000);

const controls = new OrbitControls(previewCamera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

const transformControls = new TransformControls(previewCamera, renderer.domElement);
transformControls.addEventListener("dragging-changed", (event) => {
  controls.enabled = !event.value;
});
transformControls.addEventListener("objectChange", () => {
  syncSelectedFromTransform();
});
scene.add(transformControls);

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

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function createGeometry(kind) {
  if (kind === "sphere") return new THREE.SphereGeometry(0.7, 32, 18);
  if (kind === "cylinder") return new THREE.CylinderGeometry(0.55, 0.55, 1.3, 32);
  if (kind === "capsule") return new THREE.CapsuleGeometry(0.45, 1.1, 8, 16);
  if (kind === "cone") return new THREE.ConeGeometry(0.65, 1.4, 32);
  if (kind === "camera") return new THREE.BoxGeometry(0.9, 0.55, 0.55);
  return new THREE.BoxGeometry(1.4, 0.8, 1.0);
}

function makeCameraVisual() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    createGeometry("camera"),
    new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.65 })
  );
  group.add(body);

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.32, 24),
    new THREE.MeshStandardMaterial({ color: "#60a5fa", roughness: 0.3 })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.42;
  group.add(lens);

  const dirLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -0.65),
      new THREE.Vector3(0, 0, -3.4)
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  group.add(dirLine);

  const cone = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -0.7), new THREE.Vector3(-1.1, 0.7, -3.2),
      new THREE.Vector3(0, 0, -0.7), new THREE.Vector3(1.1, 0.7, -3.2),
      new THREE.Vector3(0, 0, -0.7), new THREE.Vector3(-1.1, -0.7, -3.2),
      new THREE.Vector3(0, 0, -0.7), new THREE.Vector3(1.1, -0.7, -3.2),
      new THREE.Vector3(-1.1, 0.7, -3.2), new THREE.Vector3(1.1, 0.7, -3.2),
      new THREE.Vector3(1.1, 0.7, -3.2), new THREE.Vector3(1.1, -0.7, -3.2),
      new THREE.Vector3(1.1, -0.7, -3.2), new THREE.Vector3(-1.1, -0.7, -3.2),
      new THREE.Vector3(-1.1, -0.7, -3.2), new THREE.Vector3(-1.1, 0.7, -3.2)
    ]),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  group.add(cone);

  return group;
}

function createObject(kind, color) {
  if (kind === "camera") return makeCameraVisual();

  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  return new THREE.Mesh(createGeometry(kind), material);
}

/* ---------------------------
   Blockly
--------------------------- */

function defineBlocklyBlocks() {
  Blockly.defineBlocksWithJsonArray([
    {
      "type": "event_start",
      "message0": "▶ はじまったとき %1 %2",
      "args0": [
        { "type": "input_dummy" },
        { "type": "input_statement", "name": "DO" }
      ],
      "colour": "#f59e0b",
      "tooltip": "実行ボタンを押したときに1回動きます。"
    },
    {
      "type": "event_forever",
      "message0": "ずっと %1 %2",
      "args0": [
        { "type": "input_dummy" },
        { "type": "input_statement", "name": "DO" }
      ],
      "colour": "#f59e0b",
      "tooltip": "実行中、毎フレームくり返します。"
    },
    {
      "type": "move_forward",
      "message0": "前に %1 動く",
      "args0": [
        { "type": "field_number", "name": "AMOUNT", "value": 1, "min": -100, "max": 100, "precision": 0.1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#3b82f6"
    },
    {
      "type": "turn_y",
      "message0": "Y回転 %1 度",
      "args0": [
        { "type": "field_number", "name": "DEG", "value": 15, "min": -360, "max": 360, "precision": 1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#3b82f6"
    },
    {
      "type": "go_to",
      "message0": "座標 x %1 y %2 z %3 へ行く",
      "args0": [
        { "type": "field_number", "name": "X", "value": 0, "precision": 0.1 },
        { "type": "field_number", "name": "Y", "value": 1, "precision": 0.1 },
        { "type": "field_number", "name": "Z", "value": 0, "precision": 0.1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#3b82f6"
    },
    {
      "type": "jump",
      "message0": "ジャンプ 強さ %1",
      "args0": [
        { "type": "field_number", "name": "POWER", "value": 0.18, "min": 0, "max": 5, "precision": 0.01 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#3b82f6"
    },
    {
      "type": "set_color",
      "message0": "色を %1 にする",
      "args0": [
        { "type": "field_colour", "name": "COLOR", "colour": "#ff6b6b" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#8b5cf6"
    },
    {
      "type": "set_scale",
      "message0": "大きさを %1 倍にする",
      "args0": [
        { "type": "field_number", "name": "SCALE", "value": 1.2, "min": 0.1, "max": 20, "precision": 0.1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#8b5cf6"
    },
    {
      "type": "wait_seconds",
      "message0": "%1 秒待つ",
      "args0": [
        { "type": "field_number", "name": "SEC", "value": 1, "min": 0, "max": 60, "precision": 0.1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": "#ec4899"
    },
    {
      "type": "key_pressed",
      "message0": "キー %1 が押された",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "KEY",
          "options": [
            ["↑", "ArrowUp"],
            ["↓", "ArrowDown"],
            ["←", "ArrowLeft"],
            ["→", "ArrowRight"],
            ["スペース", " "],
            ["W", "w"],
            ["A", "a"],
            ["S", "s"],
            ["D", "d"]
          ]
        }
      ],
      "output": "Boolean",
      "colour": "#14b8a6"
    }
  ]);
}

function initBlockly() {
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
    if (isLoadingWorkspace) return;
    const sprite = getSelectedSprite();
    if (!sprite) return;
    sprite.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  });
}

function defaultWorkspaceForSprite(kind) {
  if (kind === "camera") {
    return {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "event_start",
            "id": uid(),
            "x": 30,
            "y": 30,
            "inputs": {
              "DO": {
                "block": {
                  "type": "go_to",
                  "id": uid(),
                  "fields": { "X": 0, "Y": 3, "Z": 8 }
                }
              }
            }
          }
        ]
      }
    };
  }

  return {
    "blocks": {
      "languageVersion": 0,
      "blocks": [
        {
          "type": "event_forever",
          "id": uid(),
          "x": 30,
          "y": 30,
          "inputs": {
            "DO": {
              "block": {
                "type": "controls_if",
                "id": uid(),
                "inputs": {
                  "IF0": {
                    "block": {
                      "type": "key_pressed",
                      "id": uid(),
                      "fields": { "KEY": "ArrowUp" }
                    }
                  },
                  "DO0": {
                    "block": {
                      "type": "move_forward",
                      "id": uid(),
                      "fields": { "AMOUNT": 1 }
                    }
                  }
                }
              }
            }
          }
        }
      ]
    }
  };
}

function loadSpriteWorkspace(sprite) {
  if (!workspace) return;

  isLoadingWorkspace = true;
  workspace.clear();

  try {
    Blockly.serialization.workspaces.load(sprite.workspaceJson || defaultWorkspaceForSprite(sprite.kind), workspace);
  } catch (e) {
    console.error(e);
    Blockly.serialization.workspaces.load(defaultWorkspaceForSprite(sprite.kind), workspace);
  }

  isLoadingWorkspace = false;
  blocklyTargetNameEl.textContent = sprite.name;
}

/* ---------------------------
   Sprite
--------------------------- */

function addSprite(kind = "box") {
  const id = uid();
  const color = colorForKind(kind);
  const object = createObject(kind, color);

  object.position.set((sprites.length % 5) * 1.6, kind === "camera" ? 3 : 0.75, kind === "camera" ? 8 : Math.floor(sprites.length / 5) * 1.6);
  if (kind === "camera") object.rotation.x = THREE.MathUtils.degToRad(-15);

  object.traverse(child => {
    child.userData.spriteId = id;
  });
  object.userData.spriteId = id;

  scene.add(object);

  const sprite = {
    id,
    name: kind === "camera" ? "Camera" : kindName(kind) + " " + (sprites.filter(s => s.kind !== "camera").length + 1),
    kind,
    color,
    object,
    velocityY: 0,
    waitTimer: 0,
    workspaceJson: defaultWorkspaceForSprite(kind),
    startDone: false
  };

  sprites.push(sprite);
  selectSprite(id);
}

function addInitialCamera() {
  if (sprites.some(s => s.kind === "camera")) return;
  addSprite("camera");
}

function colorForKind(kind) {
  if (kind === "sphere") return "#f97316";
  if (kind === "cylinder") return "#06b6d4";
  if (kind === "capsule") return "#22c55e";
  if (kind === "cone") return "#eab308";
  if (kind === "camera") return "#111827";
  return "#3b82f6";
}

function kindName(kind) {
  const map = {
    box: "直方体",
    sphere: "球",
    cylinder: "円柱",
    capsule: "Capsule",
    cone: "円すい",
    camera: "カメラ"
  };
  return map[kind] || kind;
}

function selectSprite(id) {
  selectedSpriteId = id;
  const sprite = getSelectedSprite();
  if (sprite) {
    transformControls.attach(sprite.object);
    loadSpriteWorkspace(sprite);
  }
  renderAllPanels();
}

function getSelectedSprite() {
  return sprites.find(sprite => sprite.id === selectedSpriteId) || null;
}

function getGameCameraSprite() {
  return sprites.find(sprite => sprite.kind === "camera") || null;
}

function renderAllPanels() {
  renderSpriteList();
  renderProps();
}

function renderSpriteList() {
  spriteListEl.innerHTML = "";

  for (const sprite of sprites) {
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

function renderProps() {
  const sprite = getSelectedSprite();
  if (!sprite) {
    selectedSpriteNameEl.textContent = "未選択";
    blocklyTargetNameEl.textContent = "未選択";
    propName.value = "";
    propX.value = "";
    propY.value = "";
    propZ.value = "";
    return;
  }

  selectedSpriteNameEl.textContent = sprite.name;
  blocklyTargetNameEl.textContent = sprite.name;
  propName.value = sprite.name;
  propX.value = sprite.object.position.x.toFixed(1);
  propY.value = sprite.object.position.y.toFixed(1);
  propZ.value = sprite.object.position.z.toFixed(1);
  propColor.value = sprite.color;
}

function applyProps() {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  sprite.name = propName.value || "Sprite";
  sprite.object.position.set(
    Number(propX.value) || 0,
    Number(propY.value) || 0,
    Number(propZ.value) || 0
  );

  sprite.color = propColor.value || "#3b82f6";

  if (sprite.kind !== "camera") {
    sprite.object.material.color.set(sprite.color);
  } else {
    sprite.object.traverse(child => {
      if (child.isMesh && child.material && child.material.color) {
        child.material.color.set(sprite.color);
      }
    });
  }

  renderSpriteList();
  selectedSpriteNameEl.textContent = sprite.name;
  blocklyTargetNameEl.textContent = sprite.name;
}

function syncSelectedFromTransform() {
  renderProps();
}

/* ---------------------------
   Blockly execution
--------------------------- */

function topBlocksFor(sprite, type) {
  const json = sprite.workspaceJson;
  const blocks = json?.blocks?.blocks || [];
  return blocks.filter(b => b.type === type);
}

function getConnectedBlock(inputObj) {
  if (!inputObj) return null;
  return inputObj.block || null;
}

function execStatementChain(sprite, block, dt) {
  let current = block;
  let guard = 0;

  while (current && guard < 200) {
    guard++;
    const shouldContinue = execOneBlock(sprite, current, dt);
    if (shouldContinue === "WAIT") return "WAIT";
    current = current.next?.block || null;
  }

  return "DONE";
}

function execOneBlock(sprite, block, dt) {
  if (!block) return "DONE";

  if (block.type === "move_forward") {
    const amount = Number(block.fields?.AMOUNT ?? 1);
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(sprite.object.quaternion);
    sprite.object.position.addScaledVector(forward, amount * dt * 3);
  }

  if (block.type === "turn_y") {
    const deg = Number(block.fields?.DEG ?? 15);
    sprite.object.rotation.y += THREE.MathUtils.degToRad(deg) * dt * 4;
  }

  if (block.type === "go_to") {
    sprite.object.position.set(
      Number(block.fields?.X ?? 0),
      Number(block.fields?.Y ?? 1),
      Number(block.fields?.Z ?? 0)
    );
  }

  if (block.type === "jump") {
    if (sprite.object.position.y <= 0.76) {
      sprite.velocityY = Number(block.fields?.POWER ?? 0.18);
    }
  }

  if (block.type === "set_color") {
    const color = block.fields?.COLOR || "#ff6b6b";
    sprite.color = color;

    if (sprite.kind !== "camera" && sprite.object.material) {
      sprite.object.material.color.set(color);
    }
  }

  if (block.type === "set_scale") {
    const s = Math.max(0.1, Number(block.fields?.SCALE ?? 1));
    sprite.object.scale.setScalar(s);
  }

  if (block.type === "wait_seconds") {
    if (sprite.waitTimer <= 0) {
      sprite.waitTimer = Math.max(0, Number(block.fields?.SEC ?? 1));
    }

    sprite.waitTimer -= dt;
    if (sprite.waitTimer > 0) return "WAIT";
    sprite.waitTimer = 0;
  }

  if (block.type === "controls_if") {
    const conditionBlock = getConnectedBlock(block.inputs?.IF0);
    const doBlock = getConnectedBlock(block.inputs?.DO0);

    if (evalBoolBlock(conditionBlock)) {
      const result = execStatementChain(sprite, doBlock, dt);
      if (result === "WAIT") return "WAIT";
    }
  }

  return "DONE";
}

function evalBoolBlock(block) {
  if (!block) return false;

  if (block.type === "key_pressed") {
    const key = block.fields?.KEY || "ArrowUp";
    return pressedKeys.has(key);
  }

  if (block.type === "logic_boolean") {
    return block.fields?.BOOL === "TRUE";
  }

  if (block.type === "logic_compare") {
    const left = evalValueBlock(getConnectedBlock(block.inputs?.A));
    const right = evalValueBlock(getConnectedBlock(block.inputs?.B));
    const op = block.fields?.OP || "EQ";

    if (op === "EQ") return left === right;
    if (op === "NEQ") return left !== right;
    if (op === "LT") return left < right;
    if (op === "LTE") return left <= right;
    if (op === "GT") return left > right;
    if (op === "GTE") return left >= right;
  }

  return false;
}

function evalValueBlock(block) {
  if (!block) return 0;
  if (block.type === "math_number") return Number(block.fields?.NUM || 0);
  if (block.type === "logic_boolean") return block.fields?.BOOL === "TRUE";
  return 0;
}

function executeSprite(sprite, dt) {
  if (!sprite.workspaceJson) return;

  if (!sprite.startDone) {
    for (const start of topBlocksFor(sprite, "event_start")) {
      const first = getConnectedBlock(start.inputs?.DO);
      execStatementChain(sprite, first, dt);
    }
    sprite.startDone = true;
  }

  for (const forever of topBlocksFor(sprite, "event_forever")) {
    const first = getConnectedBlock(forever.inputs?.DO);
    execStatementChain(sprite, first, dt);
  }
}

function updatePhysics(sprite) {
  if (sprite.kind === "camera") return;

  sprite.velocityY -= 0.012;
  sprite.object.position.y += sprite.velocityY;

  if (sprite.object.position.y < 0.75) {
    sprite.object.position.y = 0.75;
    sprite.velocityY = 0;
  }
}

/* ---------------------------
   UI
--------------------------- */

function setTransformMode(mode) {
  transformControls.setMode(mode);

  document.querySelectorAll(".tool").forEach(btn => btn.classList.remove("active"));
  if (mode === "translate") document.getElementById("modeMoveBtn").classList.add("active");
  if (mode === "rotate") document.getElementById("modeRotateBtn").classList.add("active");
  if (mode === "scale") document.getElementById("modeScaleBtn").classList.add("active");
}

function openModal() {
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

function deleteSelectedSprite() {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  if (sprite.kind === "camera" && sprites.filter(s => s.kind === "camera").length <= 1) {
    alert("カメラは最低1つ必要です。");
    return;
  }

  transformControls.detach();
  scene.remove(sprite.object);
  disposeObject(sprite.object);

  sprites = sprites.filter(s => s.id !== sprite.id);
  selectedSpriteId = sprites[0]?.id || null;

  if (selectedSpriteId) {
    selectSprite(selectedSpriteId);
  } else {
    renderAllPanels();
  }
}

function disposeObject(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function runProject() {
  if (workspace && getSelectedSprite()) {
    getSelectedSprite().workspaceJson = Blockly.serialization.workspaces.save(workspace);
  }

  running = true;
  editCameraEnabled = false;
  statusEl.textContent = "実行中";
  transformControls.detach();

  for (const sprite of sprites) {
    sprite.velocityY = 0;
    sprite.waitTimer = 0;
    sprite.startDone = false;
  }
}

function stopProject() {
  running = false;
  editCameraEnabled = true;
  statusEl.textContent = "停止中";

  const sprite = getSelectedSprite();
  if (sprite) transformControls.attach(sprite.object);
}

function saveProject() {
  if (workspace && getSelectedSprite()) {
    getSelectedSprite().workspaceJson = Blockly.serialization.workspaces.save(workspace);
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

  localStorage.setItem("scratch3d-blockly-project", JSON.stringify(data));
  alert("保存しました！");
}

function loadProject() {
  const raw = localStorage.getItem("scratch3d-blockly-project");
  if (!raw) {
    alert("保存データがありません。");
    return;
  }

  const data = JSON.parse(raw);
  clearSpritesOnly();

  for (const saved of data.sprites || []) {
    restoreSprite(saved);
  }

  addInitialCamera();

  selectedSpriteId = sprites[0]?.id || null;
  if (selectedSpriteId) selectSprite(selectedSpriteId);
  renderAllPanels();
}

function restoreSprite(saved) {
  const id = saved.id || uid();
  const color = saved.color || colorForKind(saved.kind);
  const object = createObject(saved.kind || "box", color);

  object.position.fromArray(saved.position || [0, 0.75, 0]);
  if (saved.rotation) object.rotation.set(saved.rotation[0], saved.rotation[1], saved.rotation[2]);
  if (saved.scale) object.scale.fromArray(saved.scale);

  object.traverse(child => {
    child.userData.spriteId = id;
  });
  object.userData.spriteId = id;
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
    workspaceJson: saved.workspaceJson || defaultWorkspaceForSprite(saved.kind || "box")
  });
}

function clearSpritesOnly() {
  transformControls.detach();

  for (const sprite of sprites) {
    scene.remove(sprite.object);
    disposeObject(sprite.object);
  }

  sprites = [];
  selectedSpriteId = null;
}

function clearProject() {
  if (!confirm("全部消しますか？")) return;
  clearSpritesOnly();
  addInitialCamera();
  addSprite("box");
}

/* ---------------------------
   Input / Picking
--------------------------- */

stageWrap.addEventListener("pointerdown", (e) => {
  if (running) return;
  if (transformControls.dragging) return;

  const rect = stageWrap.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, previewCamera);

  const candidates = [];
  for (const sprite of sprites) {
    sprite.object.traverse(child => {
      if (child.isMesh) candidates.push(child);
    });
  }

  const hits = raycaster.intersectObjects(candidates, false);
  if (hits.length > 0) {
    let obj = hits[0].object;
    const id = obj.userData.spriteId;
    if (id) selectSprite(id);
  }
});

window.addEventListener("keydown", e => {
  pressedKeys.add(e.key);

  if (e.key === "ArrowUp") pressedKeys.add("ArrowUp");
  if (e.key === "ArrowDown") pressedKeys.add("ArrowDown");
  if (e.key === "ArrowLeft") pressedKeys.add("ArrowLeft");
  if (e.key === "ArrowRight") pressedKeys.add("ArrowRight");

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", e => {
  pressedKeys.delete(e.key);
});

/* ---------------------------
   Render loop
--------------------------- */

function resizeRenderer() {
  const rect = stageWrap.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  renderer.setSize(width, height, false);

  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();

  gameCamera.aspect = width / height;
  gameCamera.updateProjectionMatrix();

  if (workspace) Blockly.svgResize(workspace);
}

function syncGameCameraFromSprite() {
  const camSprite = getGameCameraSprite();
  if (!camSprite) return previewCamera;

  gameCamera.position.copy(camSprite.object.position);
  gameCamera.quaternion.copy(camSprite.object.quaternion);
  return gameCamera;
}

function animate(time) {
  requestAnimationFrame(animate);
  resizeRenderer();

  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;

  if (running) {
    for (const sprite of sprites) {
      executeSprite(sprite, dt);
      updatePhysics(sprite);
    }
    renderProps();
  }

  controls.update();

  const activeCamera = running ? syncGameCameraFromSprite() : previewCamera;
  renderer.render(scene, activeCamera);
}

/* ---------------------------
   Events
--------------------------- */

document.getElementById("runBtn").onclick = runProject;
document.getElementById("stopBtn").onclick = stopProject;
document.getElementById("saveBtn").onclick = saveProject;
document.getElementById("loadBtn").onclick = loadProject;
document.getElementById("clearBtn").onclick = clearProject;

document.getElementById("modeMoveBtn").onclick = () => setTransformMode("translate");
document.getElementById("modeRotateBtn").onclick = () => setTransformMode("rotate");
document.getElementById("modeScaleBtn").onclick = () => setTransformMode("scale");

document.getElementById("camResetBtn").onclick = () => {
  previewCamera.position.set(7, 5, 8);
  controls.target.set(0, 1, 0);
};

document.getElementById("openAddSpriteBtn").onclick = openModal;
document.getElementById("closeModalBtn").onclick = closeModal;
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

document.querySelectorAll(".choice").forEach(btn => {
  btn.addEventListener("click", () => {
    addSprite(btn.dataset.kind);
    closeModal();
  });
});

document.getElementById("deleteSpriteBtn").onclick = deleteSelectedSprite;

[propName, propX, propY, propZ, propColor].forEach(input => {
  input.addEventListener("input", applyProps);
});

/* ---------------------------
   Start
--------------------------- */

initBlockly();
addInitialCamera();
addSprite("box");
setTransformMode("translate");
requestAnimationFrame(animate);
