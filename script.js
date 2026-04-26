import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const errorBox = document.getElementById("errorBox");
function showError(err){
  const msg = err && err.stack ? err.stack : String(err);
  console.error(err);
  errorBox.textContent = "エラー内容:\n" + msg;
  errorBox.classList.remove("hidden");
  const status = document.getElementById("status");
  if(status) status.textContent = "エラー";
}
window.addEventListener("error", e => showError(e.error || e.message));
window.addEventListener("unhandledrejection", e => showError(e.reason));

try {
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
const propRotX = document.getElementById("propRotX");
const propRotY = document.getElementById("propRotY");
const propRotZ = document.getElementById("propRotZ");
const propScaleX = document.getElementById("propScaleX");
const propScaleY = document.getElementById("propScaleY");
const propScaleZ = document.getElementById("propScaleZ");
const propColor = document.getElementById("propColor");
const modal = document.getElementById("spriteModal");
const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");

let sprites = [];
let selectedSpriteId = null;
let running = false;
let runSnapshot = null;
let lastTime = 0;
let editMode = "translate";
let workspace = null;
let isLoadingWorkspace = false;
const pressedKeys = new Set();

function uid(){ return (crypto && crypto.randomUUID) ? crypto.randomUUID() : "id_" + Math.random().toString(36).slice(2); }

if (!window.Blockly) {
  throw new Error("Blocklyが読み込めませんでした。インターネット接続、またはCDNの読み込みを確認してください。");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);

// レイヤー設定
// 0: ゲーム本体
// 1: 編集中だけ見せるカメラ見た目・操作ガイド
const GAME_LAYER = 0;
const EDITOR_LAYER = 1;

const previewCamera = new THREE.PerspectiveCamera(60,1,0.1,1000);
previewCamera.position.set(7,5,8);
previewCamera.layers.enable(GAME_LAYER);
previewCamera.layers.enable(EDITOR_LAYER);

const gameCamera = new THREE.PerspectiveCamera(65,1,0.1,1000);
gameCamera.layers.set(GAME_LAYER);

const controls = new OrbitControls(previewCamera, renderer.domElement);
controls.target.set(0,1,0);
controls.enableDamping = true;

// Three.js公式のオブジェクト操作UI
const transformControls = new TransformControls(previewCamera, renderer.domElement);
transformControls.setMode("translate");
transformControls.setSize(1.05);
transformControls.layers.set(EDITOR_LAYER);
transformControls.traverse(child => child.layers.set(EDITOR_LAYER));
scene.add(transformControls);

transformControls.addEventListener("dragging-changed", event => {
  controls.enabled = !event.value;
});

transformControls.addEventListener("objectChange", () => {
  renderProps();
});

scene.add(new THREE.HemisphereLight(0xffffff,0x335577,1.6));
const dir = new THREE.DirectionalLight(0xffffff,1.1);
dir.position.set(5,8,4);
scene.add(dir);
scene.add(new THREE.GridHelper(40,40,0x64748b,0x94a3b8));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40,40),
  new THREE.MeshStandardMaterial({color:0xcbd5e1,roughness:.9})
);
floor.rotation.x = -Math.PI/2;
floor.position.y = -0.01;
scene.add(floor);

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.18;
const pointer = new THREE.Vector2();

const gizmo = new THREE.Group();
gizmo.layers.set(EDITOR_LAYER);
scene.add(gizmo);

function createGeometry(kind){
  if(kind==="sphere") return new THREE.SphereGeometry(.7,32,18);
  if(kind==="cylinder") return new THREE.CylinderGeometry(.55,.55,1.3,32);
  if(kind==="capsule" && THREE.CapsuleGeometry) return new THREE.CapsuleGeometry(.45,1.1,8,16);
  if(kind==="capsule") return new THREE.CylinderGeometry(.45,.45,1.5,24);
  if(kind==="cone") return new THREE.ConeGeometry(.65,1.4,32);
  return new THREE.BoxGeometry(1.4,.8,1);
}

function makeCameraVisual(){
  const group = new THREE.Group();
  group.layers.set(EDITOR_LAYER);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.9,.55,.55), new THREE.MeshStandardMaterial({color:"#111827",roughness:.65}));
  body.layers.set(EDITOR_LAYER);
  group.add(body);
  const pts = [
    [0,0,-.65, 0,0,-3.4],
    [0,0,-.7, -1.1,.7,-3.2],
    [0,0,-.7, 1.1,.7,-3.2],
    [0,0,-.7, -1.1,-.7,-3.2],
    [0,0,-.7, 1.1,-.7,-3.2],
    [-1.1,.7,-3.2, 1.1,.7,-3.2],
    [1.1,.7,-3.2, 1.1,-.7,-3.2],
    [1.1,-.7,-3.2, -1.1,-.7,-3.2],
    [-1.1,-.7,-3.2, -1.1,.7,-3.2]
  ];
  const points = [];
  for(const p of pts){
    points.push(new THREE.Vector3(p[0],p[1],p[2]), new THREE.Vector3(p[3],p[4],p[5]));
  }
  const cameraGuide = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({color:0xffffff})
  );
  cameraGuide.layers.set(EDITOR_LAYER);
  group.add(cameraGuide);

  return group;
}

function createObject(kind,color){
  if(kind==="camera") return makeCameraVisual();
  return new THREE.Mesh(createGeometry(kind), new THREE.MeshStandardMaterial({color,roughness:.55}));
}

function colorForKind(kind){
  return {sphere:"#f97316",cylinder:"#06b6d4",capsule:"#22c55e",cone:"#eab308",camera:"#111827",box:"#3b82f6"}[kind] || "#3b82f6";
}
function kindName(kind){
  return {box:"直方体",sphere:"球",cylinder:"円柱",capsule:"Capsule",cone:"円すい",camera:"カメラ"}[kind] || kind;
}

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
    trashcan:true,
    scrollbars:true,
    zoom:{controls:true,wheel:true,startScale:.9,maxScale:1.5,minScale:.45,scaleSpeed:1.1}
  });
  workspace.addChangeListener(()=>{
    if(isLoadingWorkspace) return;
    const s = getSelectedSprite();
    if(s) s.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  });
}

function defaultWorkspace(kind){
  if(kind==="camera"){
    return {"blocks":{"languageVersion":0,"blocks":[{"type":"event_start","id":uid(),"x":30,"y":30,"inputs":{"DO":{"block":{"type":"go_to","id":uid(),"fields":{"X":0,"Y":3,"Z":8}}}}}]}};
  }
  return {"blocks":{"languageVersion":0,"blocks":[{"type":"event_forever","id":uid(),"x":30,"y":30,"inputs":{"DO":{"block":{"type":"controls_if","id":uid(),"inputs":{"IF0":{"block":{"type":"key_pressed","id":uid(),"fields":{"KEY":"ArrowUp"}}},"DO0":{"block":{"type":"move_forward","id":uid(),"fields":{"AMOUNT":1}}}}}}}}]}};
}
function loadWorkspaceFor(s){
  isLoadingWorkspace = true;
  workspace.clear();
  try { Blockly.serialization.workspaces.load(s.workspaceJson || defaultWorkspace(s.kind), workspace); }
  catch(e){ console.warn(e); Blockly.serialization.workspaces.load(defaultWorkspace(s.kind), workspace); }
  isLoadingWorkspace = false;
  blocklyTargetNameEl.textContent = s.name;
}

function addSprite(kind){
  const id = uid();
  const color = colorForKind(kind);
  const object = createObject(kind,color);
  object.position.set(kind==="camera" ? 0 : (sprites.length%5)*1.6, kind==="camera"?3:.75, kind==="camera"?8:Math.floor(sprites.length/5)*1.6);
  // Cameraは最初、傾きなし。ワールドのZマイナス方向をまっすぐ見る状態。
  if(kind==="camera") object.rotation.set(0, 0, 0);
  object.userData.spriteId = id;
  object.traverse(c=>c.userData.spriteId=id);
  scene.add(object);
  const sprite = {id,name:kind==="camera"?"Camera":kindName(kind)+" "+(sprites.filter(s=>s.kind!=="camera").length+1),kind,color,object,velocityY:0,waitTimer:0,startDone:false,workspaceJson:defaultWorkspace(kind)};
  sprites.push(sprite);
  selectSprite(id);
}
function addInitialCamera(){ if(!sprites.some(s=>s.kind==="camera")) addSprite("camera"); }
function getSelectedSprite(){ return sprites.find(s=>s.id===selectedSpriteId)||null; }
function getGameCameraSprite(){ return sprites.find(s=>s.kind==="camera")||null; }
function selectSprite(id){
  if(workspace && getSelectedSprite()) getSelectedSprite().workspaceJson = Blockly.serialization.workspaces.save(workspace);
  selectedSpriteId = id;
  const s = getSelectedSprite();
  if(s) loadWorkspaceFor(s);
  renderAll();
}
function renderAll(){ renderSpriteList(); renderProps(); updateGizmo(); }
function renderSpriteList(){
  spriteListEl.innerHTML = "";
  for(const s of sprites){
    const item = document.createElement("div");
    item.className = "spriteItem" + (s.id===selectedSpriteId?" active":"");
    item.onclick = ()=>selectSprite(s.id);
    const thumb = document.createElement("div");
    thumb.className = "spriteThumb";
    thumb.style.background = s.color;
    thumb.textContent = s.kind==="camera"?"📷":"3D";
    const info = document.createElement("div");
    info.className = "spriteInfo";
    info.innerHTML = `<div class="spriteName"></div><div class="spriteKind">${kindName(s.kind)}</div>`;
    info.querySelector(".spriteName").textContent = s.name;
    item.append(thumb,info);
    spriteListEl.append(item);
  }
}
function renderProps(){
  const s = getSelectedSprite();
  if(!s){
    selectedSpriteNameEl.textContent="未選択";
    propName.value="";
    propX.value="";
    propY.value="";
    propZ.value="";
    propRotX.value="";
    propRotY.value="";
    propRotZ.value="";
    propScaleX.value="";
    propScaleY.value="";
    propScaleZ.value="";
    return;
  }
  selectedSpriteNameEl.textContent = s.name;
  blocklyTargetNameEl.textContent = s.name;
  propName.value=s.name;
  propX.value=s.object.position.x.toFixed(1);
  propY.value=s.object.position.y.toFixed(1);
  propZ.value=s.object.position.z.toFixed(1);
  propRotX.value=THREE.MathUtils.radToDeg(s.object.rotation.x).toFixed(0);
  propRotY.value=THREE.MathUtils.radToDeg(s.object.rotation.y).toFixed(0);
  propRotZ.value=THREE.MathUtils.radToDeg(s.object.rotation.z).toFixed(0);
  propScaleX.value=s.object.scale.x.toFixed(1);
  propScaleY.value=s.object.scale.y.toFixed(1);
  propScaleZ.value=s.object.scale.z.toFixed(1);
  propColor.value=s.color;
}
function applyProps(){
  const s = getSelectedSprite();
  if(!s) return;
  s.name = propName.value || "Sprite";
  s.object.position.set(Number(propX.value)||0,Number(propY.value)||0,Number(propZ.value)||0);
  s.object.rotation.set(
    THREE.MathUtils.degToRad(Number(propRotX.value)||0),
    THREE.MathUtils.degToRad(Number(propRotY.value)||0),
    THREE.MathUtils.degToRad(Number(propRotZ.value)||0)
  );
  const scaleX = Math.max(0.1, Number(propScaleX.value)||1);
  const scaleY = Math.max(0.1, Number(propScaleY.value)||1);
  const scaleZ = Math.max(0.1, Number(propScaleZ.value)||1);
  s.object.scale.set(scaleX, scaleY, scaleZ);
  s.color = propColor.value || "#3b82f6";
  setObjectColor(s);
  renderSpriteList();
  updateGizmo();
}
function setObjectColor(s){
  s.object.traverse(c=>{
    if(c.isMesh && c.material && c.material.color) c.material.color.set(s.color);
  });
}

function setEditorLayerDeep(object){
  object.layers.set(EDITOR_LAYER);
  object.userData.isEditorGizmo = true;
  object.traverse(child => {
    child.layers.set(EDITOR_LAYER);
    child.userData.isEditorGizmo = true;
  });
}

function makeArrowAxis(name, color){
  const group = new THREE.Group();
  group.name = name;
  group.userData.axis = name;

  const mat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false
  });

  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35, 12), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 18), mat);

  if(name === "x"){
    line.rotation.z = -Math.PI / 2;
    line.position.x = 0.68;
    head.rotation.z = -Math.PI / 2;
    head.position.x = 1.5;
  } else if(name === "y"){
    line.position.y = 0.68;
    head.position.y = 1.5;
  } else if(name === "z"){
    line.rotation.x = Math.PI / 2;
    line.position.z = 0.68;
    head.rotation.x = Math.PI / 2;
    head.position.z = 1.5;
  }

  line.userData.axis = name;
  head.userData.axis = name;
  group.add(line, head);
  setEditorLayerDeep(group);
  return group;
}

function makeScaleAxis(name, color){
  const group = new THREE.Group();
  group.name = name;
  group.userData.axis = name;

  const mat = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false
  });

  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 12), mat);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat);

  if(name === "x"){
    line.rotation.z = -Math.PI / 2;
    line.position.x = 0.62;
    box.position.x = 1.35;
  } else if(name === "y"){
    line.position.y = 0.62;
    box.position.y = 1.35;
  } else if(name === "z"){
    line.rotation.x = Math.PI / 2;
    line.position.z = 0.62;
    box.position.z = 1.35;
  }

  line.userData.axis = name;
  box.userData.axis = name;
  group.add(line, box);
  setEditorLayerDeep(group);
  return group;
}

function makeCirclePoints(radius, axis){
  const pts = [];
  const steps = 96;

  for(let i = 0; i <= steps; i++){
    const a = (i / steps) * Math.PI * 2;

    if(axis === "x"){
      pts.push(new THREE.Vector3(0, Math.cos(a) * radius, Math.sin(a) * radius));
    } else if(axis === "y"){
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    } else {
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
  }

  return pts;
}

function makeRotateRing(name, color){
  const geo = new THREE.BufferGeometry().setFromPoints(makeCirclePoints(1.45, name));
  const mat = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false
  });

  const ring = new THREE.Line(geo, mat);
  ring.name = name;
  ring.userData.axis = name;
  ring.layers.set(EDITOR_LAYER);
  return ring;
}

const moveGizmo = new THREE.Group();
moveGizmo.name = "moveGizmo";
moveGizmo.add(
  makeArrowAxis("x", 0xff3333),
  makeArrowAxis("y", 0x33cc33),
  makeArrowAxis("z", 0x3366ff)
);

const scaleGizmo = new THREE.Group();
scaleGizmo.name = "scaleGizmo";
scaleGizmo.add(
  makeScaleAxis("x", 0xff3333),
  makeScaleAxis("y", 0x33cc33),
  makeScaleAxis("z", 0x3366ff)
);

const rotateGizmo = new THREE.Group();
rotateGizmo.name = "rotateGizmo";
rotateGizmo.add(
  makeRotateRing("x", 0xff3333),
  makeRotateRing("y", 0x33cc33),
  makeRotateRing("z", 0x3366ff)
);

gizmo.add(moveGizmo, scaleGizmo, rotateGizmo);
setEditorLayerDeep(gizmo);
function updateGizmo(){
  const s = getSelectedSprite();

  // 古い自作ガイドは使わない。公式TransformControlsだけ使う。
  gizmo.visible = false;

  if(!s || running){
    transformControls.detach();
    return;
  }

  transformControls.attach(s.object);
  transformControls.visible = true;

  if(editMode === "translate") transformControls.setMode("translate");
  if(editMode === "rotate") transformControls.setMode("rotate");
  if(editMode === "scale") transformControls.setMode("scale");
}
let draggingAxis = null;
let dragStart = null;
let objectStart = null;
let draggingSelectedBody = false;
let dragSpriteId = null;
let dragKind = null;
let dragPointerId = null;
stageWrap.addEventListener("pointerdown", e=>{
  if(running) return;

  // 公式TransformControlsを操作中は、選択処理を邪魔しない
  if(transformControls.dragging) return;

  const rect = stageWrap.getBoundingClientRect();
  pointer.x = ((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y = -((e.clientY-rect.top)/rect.height)*2+1;

  raycaster.layers.set(GAME_LAYER);
  raycaster.setFromCamera(pointer, previewCamera);

  const meshes = [];
  for(const s of sprites) {
    s.object.traverse(c => {
      if(c.isMesh && !c.userData.isEditorGizmo) meshes.push(c);
    });
  }

  const hits = raycaster.intersectObjects(meshes,false);
  if(hits.length){
    const id = hits[0].object.userData.spriteId;
    const clickedSprite = sprites.find(s => s.id === id);
    if(clickedSprite) selectSprite(id);
  }
});

function setMode(mode){
  editMode = mode;
  document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
  if(mode==="translate") {
    document.getElementById("modeMoveBtn").classList.add("active");
    transformControls.setMode("translate");
  }
  if(mode==="rotate") {
    document.getElementById("modeRotateBtn").classList.add("active");
    transformControls.setMode("rotate");
  }
  if(mode==="scale") {
    document.getElementById("modeScaleBtn").classList.add("active");
    transformControls.setMode("scale");
  }
  updateGizmo();
}

function topBlocksFor(s,type){ return s.workspaceJson?.blocks?.blocks?.filter(b=>b.type===type) || []; }
function child(input){ return input?.block || null; }
function execChain(s, block, dt){
  let cur = block, guard=0;
  while(cur && guard++<200){
    const res = execOne(s,cur,dt);
    if(res==="WAIT") return "WAIT";
    cur = cur.next?.block || null;
  }
  return "DONE";
}
function execOne(s,b,dt){
  if(!b) return "DONE";
  if(b.type==="move_forward"){
    const amount = Number(b.fields?.AMOUNT ?? 1);
    const f = new THREE.Vector3(0,0,-1).applyQuaternion(s.object.quaternion);
    s.object.position.addScaledVector(f, amount*dt*3);
  }
  if(b.type==="turn_y") s.object.rotation.y += THREE.MathUtils.degToRad(Number(b.fields?.DEG ?? 15))*dt*4;
  if(b.type==="go_to") s.object.position.set(Number(b.fields?.X??0),Number(b.fields?.Y??1),Number(b.fields?.Z??0));
  if(b.type==="jump" && s.object.position.y<=.76) s.velocityY = Number(b.fields?.POWER ?? .18);
  if(b.type==="set_color"){ s.color=b.fields?.COLOR || "#ff6b6b"; setObjectColor(s); }
  if(b.type==="set_scale"){
    const sc=Math.max(.1,Number(b.fields?.SCALE??1));
    s.object.scale.setScalar(sc);
  }
  if(b.type==="set_scale_xyz"){
    const sx=Math.max(.1,Number(b.fields?.X??1));
    const sy=Math.max(.1,Number(b.fields?.Y??1));
    const sz=Math.max(.1,Number(b.fields?.Z??1));
    s.object.scale.set(sx, sy, sz);
  }
  if(b.type==="wait_seconds"){
    if(s.waitTimer<=0) s.waitTimer=Math.max(0,Number(b.fields?.SEC??1));
    s.waitTimer-=dt;
    if(s.waitTimer>0) return "WAIT";
    s.waitTimer=0;
  }
  if(b.type==="controls_if"){
    if(evalBool(child(b.inputs?.IF0))){
      const r=execChain(s,child(b.inputs?.DO0),dt);
      if(r==="WAIT") return "WAIT";
    }
  }
  return "DONE";
}
function evalBool(b){
  if(!b) return false;
  if(b.type==="key_pressed") return pressedKeys.has(b.fields?.KEY || "ArrowUp");
  if(b.type==="logic_boolean") return b.fields?.BOOL==="TRUE";
  return false;
}
function executeSprite(s,dt){
  if(!s.startDone){
    for(const b of topBlocksFor(s,"event_start")) execChain(s,child(b.inputs?.DO),dt);
    s.startDone = true;
  }
  for(const b of topBlocksFor(s,"event_forever")) execChain(s,child(b.inputs?.DO),dt);
}
function updatePhysics(s){
  if(s.kind==="camera") return;
  s.velocityY -= .012;
  s.object.position.y += s.velocityY;
  if(s.object.position.y<.75){ s.object.position.y=.75; s.velocityY=0; }
}
function makeRunSnapshot(){
  // 実行ボタンを押した瞬間の、カメラを含む全スプライト情報を保存
  return sprites.map(s => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    color: s.color,
    position: s.object.position.clone(),
    rotation: s.object.rotation.clone(),
    quaternion: s.object.quaternion.clone(),
    scale: s.object.scale.clone(),
    visible: s.object.visible,
    velocityY: s.velocityY,
    waitTimer: s.waitTimer,
    startDone: s.startDone,
    workspaceJson: structuredCloneSafe(s.workspaceJson)
  }));
}

function structuredCloneSafe(value){
  try {
    return structuredClone(value);
  } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

function restoreRunSnapshot(){
  if(!runSnapshot) return;

  // 保存時に存在していたスプライト情報を復元
  for(const saved of runSnapshot){
    const s = sprites.find(x => x.id === saved.id);
    if(!s) continue;

    s.name = saved.name;
    s.kind = saved.kind;
    s.color = saved.color;
    s.object.position.copy(saved.position);
    s.object.rotation.copy(saved.rotation);
    s.object.quaternion.copy(saved.quaternion);
    s.object.scale.copy(saved.scale);
    s.object.visible = saved.visible;
    s.velocityY = saved.velocityY || 0;
    s.waitTimer = saved.waitTimer || 0;
    s.startDone = saved.startDone || false;
    s.workspaceJson = structuredCloneSafe(saved.workspaceJson);

    setObjectColor(s);
  }

  // 実行中に新しく追加されたスプライトがもしあれば削除
  const savedIds = new Set(runSnapshot.map(s => s.id));
  for(const s of [...sprites]){
    if(savedIds.has(s.id)) continue;
    scene.remove(s.object);
    s.object.traverse(c=>{
      if(c.geometry) c.geometry.dispose();
      if(c.material) c.material.dispose?.();
    });
    sprites = sprites.filter(x => x.id !== s.id);
  }

  // 選択中スプライトが消えていたら先頭へ
  if(!sprites.some(s => s.id === selectedSpriteId)){
    selectedSpriteId = sprites[0]?.id || null;
  }

  const selected = getSelectedSprite();
  if(selected && workspace){
    loadWorkspaceFor(selected);
  }

  renderAll();
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

function runProject(){
  // すでに実行中なら、保存し直さない
  if(running) return;

  const s = getSelectedSprite();
  if(workspace && s) {
    s.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  }

  // 停止中に実行ボタンを押した瞬間だけ、カメラを含む全スプライト情報を保存
  runSnapshot = makeRunSnapshot();

  running = true;
  statusEl.textContent = "実行中";
  gizmo.visible = false;
  transformControls.detach();
  updateRunStopButtons();

  // 実行用の一時状態だけ初期化。位置・向き・大きさなどは保存済み
  for(const sp of sprites){
    sp.velocityY = 0;
    sp.waitTimer = 0;
    sp.startDone = false;
  }
}
function stopProject(){
  // 停止中なら何もしない
  if(!running) return;

  running = false;
  statusEl.textContent = "停止中";
  updateRunStopButtons();

  // 実行中に停止ボタンを押した時だけ、実行開始時に保存した状態を読み込む
  restoreRunSnapshot();
  updateGizmo();
}

function saveProject(){
  const s = getSelectedSprite();
  if(workspace && s) s.workspaceJson = Blockly.serialization.workspaces.save(workspace);
  const data = {sprites:sprites.map(s=>({id:s.id,name:s.name,kind:s.kind,color:s.color,position:s.object.position.toArray(),rotation:[s.object.rotation.x,s.object.rotation.y,s.object.rotation.z],scale:s.object.scale.toArray(),workspaceJson:s.workspaceJson}))};
  localStorage.setItem("scratch3d-blockly-fixed", JSON.stringify(data));
  alert("保存しました！");
}
function loadProject(){
  const raw = localStorage.getItem("scratch3d-blockly-fixed");
  if(!raw){ alert("保存データがありません。"); return; }
  clearSpritesOnly();
  const data = JSON.parse(raw);
  for(const saved of data.sprites || []) restoreSprite(saved);
  addInitialCamera();
  selectSprite(sprites[0].id);
}
function restoreSprite(saved){
  const id = saved.id || uid();
  const color = saved.color || colorForKind(saved.kind);
  const object = createObject(saved.kind || "box", color);
  object.position.fromArray(saved.position || [0,.75,0]);
  if(saved.rotation) object.rotation.set(saved.rotation[0],saved.rotation[1],saved.rotation[2]);
  if(saved.scale) object.scale.fromArray(saved.scale);
  object.userData.spriteId=id; object.traverse(c=>c.userData.spriteId=id);
  scene.add(object);
  sprites.push({id,name:saved.name||kindName(saved.kind),kind:saved.kind||"box",color,object,velocityY:0,waitTimer:0,startDone:false,workspaceJson:saved.workspaceJson||defaultWorkspace(saved.kind||"box")});
}
function clearSpritesOnly(){
  for(const s of sprites){ scene.remove(s.object); s.object.traverse(c=>{ if(c.geometry)c.geometry.dispose(); if(c.material)c.material.dispose?.(); }); }
  sprites=[]; selectedSpriteId=null;
}
function clearProject(){ if(confirm("全部消しますか？")){ clearSpritesOnly(); addInitialCamera(); addSprite("box"); } }
function deleteSelected(){
  const s=getSelectedSprite(); if(!s)return;
  if(s.kind==="camera" && sprites.filter(x=>x.kind==="camera").length<=1){ alert("カメラは最低1つ必要です。"); return; }
  scene.remove(s.object);
  sprites=sprites.filter(x=>x.id!==s.id);
  selectedSpriteId=sprites[0]?.id || null;
  if(selectedSpriteId) selectSprite(selectedSpriteId); else renderAll();
}

function syncGameCamera(){
  const cam = getGameCameraSprite();
  if(!cam) return previewCamera;
  gameCamera.position.copy(cam.object.position);
  gameCamera.quaternion.copy(cam.object.quaternion);
  return gameCamera;
}
function resize(){
  const r=stageWrap.getBoundingClientRect();
  const w=Math.max(1,Math.floor(r.width)), h=Math.max(1,Math.floor(r.height));
  renderer.setSize(w,h,false);
  previewCamera.aspect=w/h; previewCamera.updateProjectionMatrix();
  gameCamera.aspect=w/h; gameCamera.updateProjectionMatrix();
  if(workspace) Blockly.svgResize(workspace);
}
function animate(time){
  requestAnimationFrame(animate);
  resize();
  const dt=Math.min(.05,(time-lastTime)/1000||0); lastTime=time;
  if(running){
    for(const s of sprites){ executeSprite(s,dt); updatePhysics(s); }
    renderProps();
  }
  controls.update();
  updateGizmo();
  renderer.render(scene, running ? syncGameCamera() : previewCamera);
}

document.getElementById("runBtn").onclick=runProject;
document.getElementById("stopBtn").onclick=stopProject;
document.getElementById("saveBtn").onclick=saveProject;
document.getElementById("loadBtn").onclick=loadProject;
document.getElementById("clearBtn").onclick=clearProject;
document.getElementById("deleteSpriteBtn").onclick=deleteSelected;
document.getElementById("modeMoveBtn").onclick=()=>setMode("translate");
document.getElementById("modeRotateBtn").onclick=()=>setMode("rotate");
document.getElementById("modeScaleBtn").onclick=()=>setMode("scale");
document.getElementById("camResetBtn").onclick=()=>{ previewCamera.position.set(7,5,8); controls.target.set(0,1,0); };
document.getElementById("openAddSpriteBtn").onclick=()=>modal.classList.remove("hidden");
document.getElementById("closeModalBtn").onclick=()=>modal.classList.add("hidden");
modal.addEventListener("click",e=>{ if(e.target===modal) modal.classList.add("hidden"); });
document.querySelectorAll(".choice").forEach(btn=>btn.onclick=()=>{ addSprite(btn.dataset.kind); modal.classList.add("hidden"); });
[propName,propX,propY,propZ,propRotX,propRotY,propRotZ,propScaleX,propScaleY,propScaleZ,propColor].forEach(i=>i.addEventListener("input",applyProps));

window.addEventListener("keydown", e=>{ pressedKeys.add(e.key); if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); });
window.addEventListener("keyup", e=>pressedKeys.delete(e.key));

initBlockly();
addInitialCamera();
addSprite("box");
setMode("translate");
updateRunStopButtons();
requestAnimationFrame(animate);

} catch (err) {
  showError(err);
}
