import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("stage");
const stageWrap = document.getElementById("stageWrap");
const scriptList = document.getElementById("scriptList");
const spriteListEl = document.getElementById("spriteList");
const selectedSpriteNameEl = document.getElementById("selectedSpriteName");
const statusEl = document.getElementById("status");

const propName = document.getElementById("propName");
const propX = document.getElementById("propX");
const propY = document.getElementById("propY");
const propZ = document.getElementById("propZ");
const propColor = document.getElementById("propColor");

const BLOCKS = {
  whenStart: {
    label: "▶ はじまったとき",
    className: "event",
    inputs: []
  },
  forever: {
    label: "ずっと",
    className: "event",
    inputs: []
  },
  moveForward: {
    label: "前に動く",
    className: "motion",
    inputs: [{ name: "amount", type: "number", value: 1 }]
  },
  turnY: {
    label: "Y回転",
    className: "motion",
    inputs: [{ name: "deg", type: "number", value: 15 }]
  },
  goTo: {
    label: "座標へ行く",
    className: "motion",
    inputs: [
      { name: "x", type: "number", value: 0 },
      { name: "y", type: "number", value: 1 },
      { name: "z", type: "number", value: 0 }
    ]
  },
  jump: {
    label: "ジャンプ",
    className: "motion",
    inputs: [{ name: "power", type: "number", value: 0.18 }]
  },
  setColor: {
    label: "色を変える",
    className: "looks",
    inputs: [{ name: "color", type: "color", value: "#ff6b6b" }]
  },
  scale: {
    label: "大きさを変える",
    className: "looks",
    inputs: [{ name: "scale", type: "number", value: 1.2 }]
  },
  wait: {
    label: "待つ",
    className: "control",
    inputs: [{ name: "sec", type: "number", value: 1 }]
  },
  ifKey: {
    label: "もしキーが押されたら",
    className: "control",
    inputs: [{ name: "key", type: "text", value: "ArrowUp" }]
  }
};

let sprites = [];
let selectedSpriteId = null;
let running = false;
let lastTime = 0;
const pressedKeys = new Set();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(6, 5, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0x335577, 1.5);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(5, 8, 4);
scene.add(dir);

const grid = new THREE.GridHelper(30, 30, 0x64748b, 0x94a3b8);
scene.add(grid);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

function createGeometry(kind) {
  if (kind === "sphere") return new THREE.SphereGeometry(0.7, 32, 18);
  if (kind === "capsule") return new THREE.CapsuleGeometry(0.45, 1.2, 8, 16);
  return new THREE.BoxGeometry(1.2, 1.2, 1.2);
}

function addSprite(kind = "cube") {
  const id = crypto.randomUUID();
  const color = kind === "sphere" ? "#f97316" : kind === "capsule" ? "#22c55e" : "#3b82f6";
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(createGeometry(kind), material);
  mesh.position.set(sprites.length * 1.6, 0.7, 0);
  mesh.castShadow = true;
  mesh.userData.spriteId = id;
  scene.add(mesh);

  const sprite = {
    id,
    name: kind[0].toUpperCase() + kind.slice(1) + " " + (sprites.length + 1),
    kind,
    color,
    mesh,
    baseScale: 1,
    velocityY: 0,
    blocks: [
      makeBlock("whenStart"),
      makeBlock("forever"),
      makeBlock("ifKey"),
      makeBlock("moveForward"),
      makeBlock("turnY")
    ],
    waitTimer: 0
  };

  sprites.push(sprite);
  selectSprite(id);
  renderAllPanels();
}

function makeBlock(type) {
  const def = BLOCKS[type];
  const values = {};
  for (const input of def.inputs) values[input.name] = input.value;
  return { id: crypto.randomUUID(), type, values };
}

function selectSprite(id) {
  selectedSpriteId = id;
  renderAllPanels();
}

function getSelectedSprite() {
  return sprites.find(sprite => sprite.id === selectedSpriteId) || null;
}

function renderAllPanels() {
  renderSpriteList();
  renderScriptList();
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

    const name = document.createElement("div");
    name.textContent = sprite.name;

    item.append(thumb, name);
    spriteListEl.append(item);
  }
}

function renderScriptList() {
  const sprite = getSelectedSprite();
  scriptList.innerHTML = "";

  if (!sprite) {
    selectedSpriteNameEl.textContent = "未選択";
    return;
  }

  selectedSpriteNameEl.textContent = sprite.name;

  for (const block of sprite.blocks) {
    const def = BLOCKS[block.type];

    const el = document.createElement("div");
    el.className = `scriptBlock ${def.className}`;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = def.label;

    const inputs = document.createElement("div");
    inputs.className = "inputs";

    for (const inputDef of def.inputs) {
      const input = document.createElement("input");
      input.type = inputDef.type;
      input.value = block.values[inputDef.name];
      input.oninput = () => {
        block.values[inputDef.name] = inputDef.type === "number" ? Number(input.value) : input.value;
      };
      inputs.append(input);
    }

    const remove = document.createElement("button");
    remove.className = "mini remove";
    remove.textContent = "×";
    remove.onclick = () => {
      sprite.blocks = sprite.blocks.filter(b => b.id !== block.id);
      renderScriptList();
    };

    el.append(label, inputs, remove);
    scriptList.append(el);
  }
}

function renderProps() {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  propName.value = sprite.name;
  propX.value = sprite.mesh.position.x.toFixed(1);
  propY.value = sprite.mesh.position.y.toFixed(1);
  propZ.value = sprite.mesh.position.z.toFixed(1);
  propColor.value = sprite.color;
}

function applyProps() {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  sprite.name = propName.value || "Sprite";
  sprite.mesh.position.set(Number(propX.value), Number(propY.value), Number(propZ.value));
  sprite.color = propColor.value;
  sprite.mesh.material.color.set(sprite.color);
  renderSpriteList();
  selectedSpriteNameEl.textContent = sprite.name;
}

function resetWorldFromProps() {
  for (const sprite of sprites) {
    sprite.velocityY = 0;
    sprite.waitTimer = 0;
  }
}

function runProject() {
  running = true;
  statusEl.textContent = "実行中";
  resetWorldFromProps();
}

function stopProject() {
  running = false;
  statusEl.textContent = "停止中";
}

function executeSprite(sprite, dt) {
  const blocks = sprite.blocks;
  const hasStart = blocks.some(b => b.type === "whenStart");
  const foreverIndex = blocks.findIndex(b => b.type === "forever");

  if (!hasStart) return;

  const startIndex = foreverIndex >= 0 ? foreverIndex + 1 : 1;

  for (let i = startIndex; i < blocks.length; i++) {
    const block = blocks[i];

    if (sprite.waitTimer > 0) {
      sprite.waitTimer -= dt;
      return;
    }

    if (block.type === "ifKey") {
      const key = block.values.key || "ArrowUp";
      if (!pressedKeys.has(key)) return;
      continue;
    }

    runBlock(sprite, block, dt);
  }
}

function runBlock(sprite, block, dt) {
  const mesh = sprite.mesh;

  if (block.type === "moveForward") {
    const amount = Number(block.values.amount) || 0;
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(mesh.rotation);
    mesh.position.addScaledVector(dir, amount * dt * 3);
  }

  if (block.type === "turnY") {
    const deg = Number(block.values.deg) || 0;
    mesh.rotation.y += THREE.MathUtils.degToRad(deg) * dt * 4;
  }

  if (block.type === "goTo") {
    mesh.position.set(
      Number(block.values.x) || 0,
      Number(block.values.y) || 0,
      Number(block.values.z) || 0
    );
  }

  if (block.type === "jump") {
    if (mesh.position.y <= 0.71) {
      sprite.velocityY = Number(block.values.power) || 0.18;
    }
  }

  if (block.type === "setColor") {
    sprite.color = block.values.color || "#ff6b6b";
    mesh.material.color.set(sprite.color);
  }

  if (block.type === "scale") {
    const s = Math.max(0.1, Number(block.values.scale) || 1);
    mesh.scale.setScalar(s);
  }

  if (block.type === "wait") {
    sprite.waitTimer = Math.max(0, Number(block.values.sec) || 0);
  }
}

function updatePhysics(sprite) {
  const mesh = sprite.mesh;
  sprite.velocityY -= 0.012;
  mesh.position.y += sprite.velocityY;

  if (mesh.position.y < 0.7) {
    mesh.position.y = 0.7;
    sprite.velocityY = 0;
  }
}

function resizeRenderer() {
  const rect = stageWrap.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
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
  renderer.render(scene, camera);
}

function saveProject() {
  const data = {
    sprites: sprites.map(sprite => ({
      id: sprite.id,
      name: sprite.name,
      kind: sprite.kind,
      color: sprite.color,
      position: sprite.mesh.position.toArray(),
      rotation: [sprite.mesh.rotation.x, sprite.mesh.rotation.y, sprite.mesh.rotation.z],
      scale: sprite.mesh.scale.x,
      blocks: sprite.blocks
    }))
  };

  localStorage.setItem("scratch3d-project", JSON.stringify(data));
  alert("保存しました！");
}

function loadProject() {
  const raw = localStorage.getItem("scratch3d-project");
  if (!raw) {
    alert("保存データがありません。");
    return;
  }

  const data = JSON.parse(raw);
  clearSpritesOnly();

  for (const saved of data.sprites) {
    const material = new THREE.MeshStandardMaterial({ color: saved.color });
    const mesh = new THREE.Mesh(createGeometry(saved.kind), material);
    mesh.position.fromArray(saved.position);
    mesh.rotation.set(saved.rotation[0], saved.rotation[1], saved.rotation[2]);
    mesh.scale.setScalar(saved.scale || 1);
    scene.add(mesh);

    sprites.push({
      id: saved.id || crypto.randomUUID(),
      name: saved.name,
      kind: saved.kind,
      color: saved.color,
      mesh,
      baseScale: saved.scale || 1,
      velocityY: 0,
      blocks: saved.blocks || [],
      waitTimer: 0
    });
  }

  selectedSpriteId = sprites[0]?.id || null;
  renderAllPanels();
}

function clearSpritesOnly() {
  for (const sprite of sprites) {
    scene.remove(sprite.mesh);
    sprite.mesh.geometry.dispose();
    sprite.mesh.material.dispose();
  }
  sprites = [];
  selectedSpriteId = null;
}

function clearProject() {
  if (!confirm("全部消しますか？")) return;
  clearSpritesOnly();
  addSprite("cube");
  renderAllPanels();
}

document.querySelectorAll(".block").forEach(btn => {
  btn.addEventListener("click", () => {
    const sprite = getSelectedSprite();
    if (!sprite) return alert("スプライトを選んでください。");

    const type = btn.dataset.type;
    sprite.blocks.push(makeBlock(type));
    renderScriptList();
  });
});

document.getElementById("runBtn").onclick = runProject;
document.getElementById("stopBtn").onclick = stopProject;
document.getElementById("saveBtn").onclick = saveProject;
document.getElementById("loadBtn").onclick = loadProject;
document.getElementById("clearBtn").onclick = clearProject;

document.getElementById("addCubeBtn").onclick = () => addSprite("cube");
document.getElementById("addSphereBtn").onclick = () => addSprite("sphere");
document.getElementById("addCapsuleBtn").onclick = () => addSprite("capsule");

document.getElementById("deleteSpriteBtn").onclick = () => {
  const sprite = getSelectedSprite();
  if (!sprite) return;

  scene.remove(sprite.mesh);
  sprite.mesh.geometry.dispose();
  sprite.mesh.material.dispose();

  sprites = sprites.filter(s => s.id !== sprite.id);
  selectedSpriteId = sprites[0]?.id || null;
  renderAllPanels();
};

document.getElementById("camResetBtn").onclick = () => {
  camera.position.set(6, 5, 8);
  controls.target.set(0, 1, 0);
};

[propName, propX, propY, propZ, propColor].forEach(input => {
  input.addEventListener("input", applyProps);
});

window.addEventListener("keydown", e => {
  pressedKeys.add(e.key);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", e => {
  pressedKeys.delete(e.key);
});

addSprite("cube");
requestAnimationFrame(animate);
