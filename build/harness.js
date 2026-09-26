'use strict';
/* Headless harness for CAMPGROUND TYCOON: stub THREE + DOM, run the real game. */
const fs = require('fs');
const path = __dirname + '/';

// ---------- DOM stub ----------
function mkEl(){
  const el = { style:{}, _l:{}, _tc:'', className:'', disabled:false,
    addEventListener(t,f){ this._l[t]=f; }, appendChild(){}, removeChild(){} };
  Object.defineProperty(el, 'textContent', { get(){ return this._tc; }, set(v){ this._tc = String(v); } });
  return el;
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = mkEl()),
  createElement: () => mkEl(),
  addEventListener(){}, readyState: 'complete', hidden: false,
};
global.window = { innerWidth: 1280, innerHeight: 800, addEventListener(){},
  AudioContext: undefined, webkitAudioContext: undefined };
global.performance = { now: () => simNow };
let simNow = 0;
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
// timers run immediately in tests
global.setTimeout = (fn)=>{ fn(); return 0; };
global.clearTimeout = ()=>{};

// ---------- THREE stub ----------
class V3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  project(){ return this; }
}
class V2 {
  constructor(x=0,y=0){ this.x=x; this.y=y; }
  set(x,y){ this.x=x; this.y=y; return this; }
}
class Color {
  constructor(h){ this.h=h||0; }
  setHex(h){ this.h=h; return this; }
  getHex(){ return this.h||0; }
  copy(c){ this.h=c.h; return this; }
  offsetHSL(){ return this; }
  multiplyScalar(){ return this; }
  lerp(){ return this; }
}
class Mat {
  constructor(o={}){ this.color=new Color(o.color); this.emissive=new Color(o.emissive||0);
    this.emissiveIntensity=1; this.transparent=false; this.opacity=1; this.depthWrite=true; }
  dispose(){}
}
class Obj {
  constructor(){
    this.position=new V3();
    this.rotation={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}};
    this.scale={x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z;}};
    this.children=[]; this.visible=true; this.userData={};
    this.matrix={};
  }
  add(c){ this.children.push(c); return this; }
  remove(c){ const i=this.children.indexOf(c); if(i>=0) this.children.splice(i,1); }
  traverse(f){ f(this); for(const c of this.children) if(c.traverse) c.traverse(f); }
  lookAt(){}
  updateMatrix(){}
}
class Mesh extends Obj { constructor(g,m){ super(); this.geometry=g||{dispose(){}}; this.material=m||new Mat(); } }
class Group extends Obj {}
class Geo { constructor(){ } dispose(){} }
class InstancedMesh extends Obj {
  constructor(g,m,count){ super(); this.geometry=g; this.material=m; this.count=count;
    this.instanceMatrix={needsUpdate:false}; this.instanceColor=null; }
  setMatrixAt(){}
  setColorAt(){ if(!this.instanceColor) this.instanceColor={needsUpdate:false}; }
}
class Raycaster {
  setFromCamera(){}
  constructor(){ this.ray={ intersectPlane:()=>null }; }
}
class Plane { constructor(){} }
global.THREE = {
  WebGLRenderer: class { constructor(){} setPixelRatio(){} setSize(){} render(){} },
  Scene: class extends Group {},
  OrthographicCamera: class extends Obj { updateProjectionMatrix(){} },
  PerspectiveCamera: class extends Obj { updateProjectionMatrix(){} },
  HemisphereLight: class extends Obj {},
  DirectionalLight: class extends Obj {},
  Mesh, Group, MeshLambertMaterial: Mat, MeshBasicMaterial: Mat,
  BoxGeometry: Geo, PlaneGeometry: Geo, Color, Vector2: V2, Vector3: V3,
  Raycaster, Plane, InstancedMesh, Object3D: Obj,
};

// ---------- load game ----------
const src = fs.readFileSync(path+'logic.js','utf8') + '\n' + fs.readFileSync(path+'game.js','utf8');
eval(src + `
;Object.assign(globalThis,{forceSpawn,setSitePrice,buildRoad,placeSite,placeBuilding,placePool,
  expandPool,buyTable,buyFirepit,structById,footprintClear,adjacentToRoad,structAt,occupiedCount,
  tickSim,idx,inB,T_GRASS,T_TREE,T_WATER,R_NONE,R_DIRT,R_GRAVEL,R_ASPHALT,RIG_TENT,DAY_LEN,
  CampTest: window.CampTest,
  get vehicleGroups(){return vehicleGroups;}, get structGroups(){return structGroups;}});
;Object.defineProperty(globalThis,'simNow',{configurable:true,get:function(){return simNow;},set:function(v){simNow=v;}});
;Object.defineProperty(globalThis,'rafCb',{configurable:true,get:function(){return rafCb;}});
`);
module.exports = {};
