'use strict';
/* ============================================================================
   CAMPGROUND TYCOON — rendering, input, UI. Uses logic.js globals.
   three.js r147, 45° iso orthographic camera, voxel boxes, 1/3-res pixelated.
   ========================================================================== */
const el = id=>document.getElementById(id);
const clamp = (v,a,b)=>v<a?a:(v>b?b:v);
const lerp = (a,b,t)=>a+(b-a)*t;
const TAU = Math.PI*2;
const PX = 3; // render at 1/3 resolution, upscale with pixelated CSS

let renderer, scene, camera, camTarget;
let viewH = 34, viewAspect = 1;
let _ray=null, _ndc=null, _plane=null;
const wx = gx=>gx - W/2 + 0.5;
const wz = gy=>gy - H/2 + 0.5;

let S = null;                 // game state (logic.js)
let currentTool = 'select';
let curPanel = -1;            // inspected structure id
let groundMesh=null, treeMeshes=[];
let roadGroups = new Map();   // tileKey -> Group
let structGroups = new Map(); // structId -> Group
let vehicleGroups = new Map();// guestId -> Group
let shimmerQuads = [];
let fireMeshes = [];
let peopleGroups = new Map(); // structId -> Group
let ghost = null, ghostTile = null, ghostOk = false;
let frameNo = 0;

/* ---------------- material / geometry caches ---------------- */
const matCache={}, geoCache={};
function mat(color, emissive){
  const k = color+'|'+(emissive||0);
  if(!matCache[k]) matCache[k]=new THREE.MeshLambertMaterial({color, emissive:emissive||0x000000});
  return matCache[k];
}
function boxGeo(w,h,d){
  const k=w+','+h+','+d;
  if(!geoCache[k]) geoCache[k]=new THREE.BoxGeometry(w,h,d);
  return geoCache[k];
}
function box(w,h,d,color,x,y,z,parent,emissive){
  const m=new THREE.Mesh(boxGeo(w,h,d), mat(color,emissive));
  m.position.set(x,y,z); (parent||scene).add(m); return m;
}

/* ---------------- audio (tiny synth) ---------------- */
let AC=null, muted=false;
function ac(){
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ AC=null; } }
  if(AC && AC.state==='suspended') AC.resume();
  return AC;
}
function tone(f0,f1,dur,type,vol,delay){
  if(muted) return; const c=ac(); if(!c) return;
  const t=c.currentTime+(delay||0);
  const o=c.createOscillator(), g=c.createGain();
  o.type=type||'square'; o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  g.gain.setValueAtTime(vol||0.2,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+dur+0.02);
}
function noiseBurst(dur,vol,fc,delay){
  if(muted) return; const c=ac(); if(!c) return;
  const t=c.currentTime+(delay||0);
  const len=Math.floor(c.sampleRate*dur), buf=c.createBuffer(1,len,c.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const s=c.createBufferSource(); s.buffer=buf;
  const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=fc||800;
  const g=c.createGain(); g.gain.setValueAtTime(vol||0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
}
const sPlace  =()=>{ tone(320,140,0.12,'square',0.25); noiseBurst(0.08,0.25,700); };
const sUpgrade=()=>{ tone(440,440,0.08,'square',0.2); tone(660,660,0.1,'square',0.2,0.08); };
const sCash   =()=>{ tone(880,880,0.07,'square',0.2); tone(1318,1318,0.12,'square',0.2,0.07); };
const sError  =()=>{ tone(170,85,0.25,'sawtooth',0.3); };
const sCut    =()=>{ noiseBurst(0.18,0.4,1400); tone(220,90,0.12,'triangle',0.25); };
const sRaze   =()=>{ noiseBurst(0.35,0.5,300); tone(120,50,0.3,'triangle',0.3); };
const sHonk   =()=>{ tone(392,392,0.18,'square',0.22); tone(330,311,0.3,'square',0.22,0.2); };
const sClick  =()=>{ tone(700,900,0.05,'square',0.12); };
const sChime  =()=>{ tone(523,523,0.15,'triangle',0.18); tone(659,659,0.15,'triangle',0.18,0.12); tone(784,784,0.25,'triangle',0.18,0.24); };
const sArrive =()=>{ tone(500,750,0.1,'square',0.15); };

/* ---------------- three boot ---------------- */
function bootThree(){
  camTarget = new THREE.Vector3(0,0,0);
  _ray = new THREE.Raycaster(); _ndc = new THREE.Vector2();
  _plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  renderer = new THREE.WebGLRenderer({canvas: el('cv'), antialias:false});
  renderer.setPixelRatio(1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  camera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,400);
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x3a5a34, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.85);
  sun.position.set(30,48,18); scene.add(sun);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(600,600), mat(0x5a7a4a));
  under.rotation.x = -Math.PI/2; under.position.y = -0.5; scene.add(under);
  ghost = new THREE.Mesh(boxGeo(1,0.22,1),
    new THREE.MeshBasicMaterial({color:0x00ff00, transparent:true, opacity:0.35, depthWrite:false}));
  ghost.visible = false; scene.add(ghost);
  resize();
  window.addEventListener('resize', resize);
}
function resize(){
  const w=window.innerWidth, h=window.innerHeight;
  viewAspect=w/h;
  renderer.setSize(Math.floor(w/PX), Math.floor(h/PX), false);
  const hw=viewH*viewAspect/2, hh=viewH/2;
  camera.left=-hw; camera.right=hw; camera.top=hh; camera.bottom=-hh;
  camera.updateProjectionMatrix();
  positionCamera();
}
function positionCamera(){
  const d=90;
  camera.position.set(camTarget.x+d*0.577, camTarget.y+d*0.577, camTarget.z+d*0.577);
  camera.lookAt(camTarget);
}
function panCam(rx, uy){
  const s=Math.SQRT1_2;
  camTarget.x=clamp(camTarget.x+(rx*s - uy*s), -W/2-8, W/2+8);
  camTarget.z=clamp(camTarget.z+(-rx*s - uy*s), -H/2-8, H/2+8);
  positionCamera();
}
function zoomBy(f){
  viewH=clamp(viewH*f, 12, 52);
  resize();
}
function screenToTile(sx,sy){
  _ndc.set((sx/window.innerWidth)*2-1, -(sy/window.innerHeight)*2+1);
  _ray.setFromCamera(_ndc,camera);
  const pt=new THREE.Vector3();
  if(!_ray.ray.intersectPlane(_plane,pt)) return null;
  const tx=Math.floor(pt.x+W/2), ty=Math.floor(pt.z+H/2);
  if(tx<0||ty<0||tx>=W||ty>=H) return null;
  return {x:tx, y:ty};
}

/* ---------------- world visuals ---------------- */
function grassColor(x,y){
  const v=((x*7+y*13)%5)/5;
  return [0x62a84e,0x6cb257,0x5da047,0x71b85c,0x66ad52][Math.floor(v*5)%5];
}
function buildGround(){
  if(groundMesh){ scene.remove(groundMesh); }
  groundMesh=new THREE.InstancedMesh(boxGeo(1,0.3,1),
    new THREE.MeshLambertMaterial({color:0xffffff}), W*H);
  const dummy=new THREE.Object3D(), c=new THREE.Color();
  let gi=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const t=S.terrain[idx(x,y)];
    dummy.position.set(wx(x),-0.15,wz(y));
    dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix();
    groundMesh.setMatrixAt(gi,dummy.matrix);
    c.setHex(t===T_WATER?0x2e7fd8:grassColor(x,y));
    if(t===T_WATER) c.offsetHSL(0,0,((x*3+y*5)%4)*0.012);
    groundMesh.setColorAt(gi,c);
    gi++;
  }
  groundMesh.instanceMatrix.needsUpdate=true;
  if(groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate=true;
  scene.add(groundMesh);
}
function refreshWaterTile(x,y){
  const c=new THREE.Color();
  c.setHex(S.terrain[idx(x,y)]===T_WATER?0x2e7fd8:grassColor(x,y));
  groundMesh.setColorAt(idx(x,y),c);
  if(groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate=true;
}
function rebuildTrees(){
  for(const m of treeMeshes) scene.remove(m);
  treeMeshes=[];
  const tiles=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)
    if(S.terrain[idx(x,y)]===T_TREE) tiles.push([x,y]);
  const n=tiles.length;
  if(!n) return;
  const trunk=new THREE.InstancedMesh(boxGeo(0.28,0.9,0.28), mat(0x6b4426), n);
  const folA=new THREE.InstancedMesh(boxGeo(1.0,0.7,1.0), mat(0x2f7a33), n);
  const folB=new THREE.InstancedMesh(boxGeo(0.62,0.55,0.62), mat(0x3f9140), n);
  const dummy=new THREE.Object3D();
  tiles.forEach(([x,y],i)=>{
    dummy.rotation.set(0,0,0);
    dummy.position.set(wx(x),0.45,wz(y)); dummy.scale.set(1,1,1); dummy.updateMatrix();
    trunk.setMatrixAt(i,dummy.matrix);
    dummy.position.set(wx(x),1.15,wz(y)); dummy.updateMatrix();
    folA.setMatrixAt(i,dummy.matrix);
    dummy.position.set(wx(x),1.65,wz(y)); dummy.updateMatrix();
    folB.setMatrixAt(i,dummy.matrix);
  });
  trunk.instanceMatrix.needsUpdate=folA.instanceMatrix.needsUpdate=folB.instanceMatrix.needsUpdate=true;
  scene.add(trunk); scene.add(folA); scene.add(folB);
  treeMeshes=[trunk,folA,folB];
}
function buildShimmer(){
  const waters=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)
    if(S.terrain[idx(x,y)]===T_WATER) waters.push([x,y]);
  shimmerQuads=[];
  const nq=Math.min(26,waters.length);
  for(let i=0;i<nq;i++){
    const [x,y]=waters[(i*7)%waters.length];
    const q=new THREE.Mesh(boxGeo(0.5,0.02,0.18),
      new THREE.MeshBasicMaterial({color:0xdff2ff, transparent:true, opacity:0.5}));
    q.position.set(wx(x)+(i%3)*0.2-0.2, 0.02, wz(y));
    q.userData={x, speed:0.25+((i*13)%10)/22};
    scene.add(q); shimmerQuads.push(q);
  }
}
const ROAD_COLORS={1:0x8a6238, 2:0x8f8f8f, 3:0x3a3a42};
function syncRoadTile(x,y){
  const k=idx(x,y), old=roadGroups.get(k);
  if(old){ scene.remove(old); roadGroups.delete(k); }
  const r=S.road[k];
  if(r===R_NONE) return;
  const g=new THREE.Group();
  box(1.02,0.1,1.02,ROAD_COLORS[r],wx(x),0.05,wz(y),g);
  if(r===R_ASPHALT){
    const dm=mat(0xf5f5f0);
    for(const dz of [-0.28,0.28]){
      const dsh=new THREE.Mesh(boxGeo(0.09,0.03,0.3),dm);
      dsh.position.set(wx(x),0.11,wz(y)+dz); g.add(dsh);
    }
  }
  scene.add(g); roadGroups.set(k,g);
}
function syncAllRoads(){
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) syncRoadTile(x,y);
}

/* ---------------- voxel builders ---------------- */
function buildFirepit(g,cx,cz,tier){
  if(tier>=1) box(0.44,0.07,0.44,0x5a3a22,cx,0.1,cz,g); // dirt spot
  if(tier>=2){
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+Math.PI/4;
      box(0.14,0.14,0.14,0x2e2e2e,cx+Math.cos(a)*0.28,0.14,cz+Math.sin(a)*0.28,g);
    }
  }
  if(tier>=3){
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      box(0.15,0.18,0.15,0x8f8f96,cx+Math.cos(a)*0.3,0.16,cz+Math.sin(a)*0.3,g);
    }
    box(0.3,0.08,0.1,0x6b4426,cx,0.1,cz,g).rotation.y=0.5;
  }
  if(tier>=1){
    const f=box(0.16,0.22,0.16,0xff7a1a,cx,0.22,cz,g,0xff4400);
    fireMeshes.push(f);
  }
}
function buildTable(g,cx,cz){
  box(0.72,0.09,0.42,0x8a5a2e,cx,0.52,cz,g);
  box(0.72,0.07,0.16,0x7a4e26,cx,0.32,cz-0.3,g);
  box(0.72,0.07,0.16,0x7a4e26,cx,0.32,cz+0.3,g);
  for(const [lx,lz] of [[-0.3,-0.15],[0.3,-0.15],[-0.3,0.15],[0.3,0.15]])
    box(0.08,0.5,0.08,0x6b4426,cx+lx,0.26,cz+lz,g);
}
function buildTent(g,cx,cz,color){
  const l=box(0.72,0.07,1.0,color,cx-0.26,0.36,cz,g); l.rotation.z=0.72;
  const r=box(0.72,0.07,1.0,color,cx+0.26,0.36,cz,g); r.rotation.z=-0.72;
  box(0.08,0.62,0.08,0x6b4426,cx,0.31,cz-0.45,g);
  box(0.08,0.62,0.08,0x6b4426,cx,0.31,cz+0.45,g);
}
function buildCar(g,cx,cz,color){
  box(1.15,0.42,0.58,color,cx,0.32,cz,g);
  box(0.62,0.36,0.52,0xbfe0f0,cx-0.05,0.68,cz,g);
  for(const [ox,oz] of [[-0.38,-0.3],[0.38,-0.3],[-0.38,0.3],[0.38,0.3]])
    box(0.2,0.2,0.12,0x1e1e1e,cx+ox,0.12,cz+oz,g);
}
function buildPickup(g,cx,cz,color){
  box(0.7,0.5,0.62,color,cx-0.55,0.4,cz,g);          // cab
  box(0.6,0.4,0.56,0xbfe0f0,cx-0.55,0.8,cz,g);
  box(1.1,0.42,0.62,color,cx+0.45,0.36,cz,g);        // bed
  for(const [ox,oz] of [[-0.7,-0.32],[0.15,-0.32],[0.75,-0.32],[-0.7,0.32],[0.15,0.32],[0.75,0.32]])
    box(0.2,0.2,0.12,0x1e1e1e,cx+ox,0.12,cz+oz,g);
}
function buildTrailer(g,cx,cz,w,color,popTop){
  box(w,0.85,0.8,0xe8e0d0,cx,0.62,cz,g);
  box(w*0.7,0.25,0.6,color,cx,0.75,cz,g);
  box(0.3,0.3,0.7,0x8a2a2a,cx-w/2-0.12,0.35,cz,g);   // hitch
  for(const [ox,oz] of [[-w/4,-0.42],[w/4,-0.42],[-w/4,0.42],[w/4,0.42]])
    box(0.22,0.22,0.12,0x1e1e1e,cx+ox,0.13,cz+oz,g);
  if(popTop) box(w*0.8,0.35,0.66,0xd8cba8,cx,1.2,cz,g);
}
function buildRV(g,cx,cz,color){
  box(2.3,1.05,0.95,color,cx,0.72,cz,g);
  box(0.5,0.7,0.9,0xbfe0f0,cx+1.15,0.6,cz,g);        // windshield/cab front
  box(1.8,0.3,0.06,0x9fd0e8,cx-0.1,0.85,cz+0.48,g);  // window strip
  box(1.8,0.3,0.06,0x9fd0e8,cx-0.1,0.85,cz-0.48,g);
  for(const [ox,oz] of [[-0.8,-0.5],[0.2,-0.5],[0.9,-0.5],[-0.8,0.5],[0.2,0.5],[0.9,0.5]])
    box(0.24,0.24,0.12,0x1e1e1e,cx+ox,0.14,cz+oz,g);
}
// rig parked ON a site (shown while camped)
function buildRigOnSite(g,rig,cx,cz,w,h){
  const ex=cx-w/2+0.6, ez=cz;
  if(rig===RIG_TENT){
    buildTent(g,cx,cz,0x3f7ac2);
    buildCar(g,cx,cz+h/2-0.35,0xc23b2e);
  }else if(rig===RIG_POPUP){
    buildPickup(g,ex-0.5,ez,0x2e6bc2);
    buildTrailer(g,ex+1.1,ez,1.2,0x2e6bc2,true);
    buildTent(g,cx+0.3,cz-0.4,0x53a05a);
  }else if(rig===RIG_MEDIUM){
    buildPickup(g,ex-0.7,ez,0x3a3a3a);
    buildTrailer(g,ex+1.1,ez,1.8,0xd8d0c0,false);
  }else{
    buildRV(g,cx,cz,0xe8e0d0);
  }
}
// vehicle driving on roads
function buildVehicleMesh(rig,color){
  const g=new THREE.Group();
  if(rig===RIG_TENT) buildCar(g,0,0,color);
  else if(rig===RIG_POPUP){ buildPickup(g,-1.0,0,color); buildTrailer(g,0.9,0,1.2,color,true); }
  else if(rig===RIG_MEDIUM){ buildPickup(g,-1.4,0,color); buildTrailer(g,1.0,0,1.8,color,false); }
  else buildRV(g,0,0,color);
  return g;
}
function makePerson(shirt){
  const g=new THREE.Group();
  box(0.28,0.52,0.28,shirt,0,0.42,0,g);
  box(0.24,0.24,0.24,0xe8b88a,0,0.82,0,g);
  return g;
}

function buildStructureMesh(st){
  const g=new THREE.Group();
  const cx=wx(st.x)+(st.w-1)/2, cz=wz(st.y)+(st.h-1)/2;
  if(st.kind==='site'){
    box(st.w*0.94,0.1,st.h*0.94,0xc9b083,cx,0.06,cz,g); // pad
    const fx=cx+st.w/4, fz=cz+st.h/4;
    buildFirepit(g,fx,fz,st.firepit);
    if(st.table) buildTable(g,cx-st.w/4,cz-st.h/4);
    if(st.guestId>=0){
      const guest=S.guests.find(v=>v.id===st.guestId);
      if(guest) buildRigOnSite(g,guest.rig,cx,cz,st.w,st.h);
    }
  }else if(st.kind==='pool'){
    box(st.w,0.14,st.h,0x9fd8ff,cx,0.07,cz,g);
    box(st.w-0.35,0.16,st.h-0.35,0x2e9fe8,cx,0.08,cz,g);
    box(st.w-0.55,0.18,st.h-0.55,0x4fb2f0,cx,0.09,cz,g);
  }else if(st.kind==='bathroom'){
    box(1.7,1.0,1.7,0xd8d0c0,cx,0.5,cz,g);
    box(1.95,0.16,1.95,0x8a2a2a,cx,1.08,cz,g);
    box(0.42,0.72,0.08,0x4a3020,cx,0.42,cz+0.86,g);
    box(0.7,0.3,0.06,0xffffff,cx,0.95,cz+0.88,g);
  }else if(st.kind==='store'){
    box(2.7,1.25,1.7,0xc09050,cx,0.62,cz,g);
    box(2.95,0.16,1.95,0x5a3a22,cx,1.32,cz,g);
    box(2.7,0.09,0.65,0xc23b2e,cx,1.05,cz+1.05,g);
    box(0.5,0.7,0.08,0x4a3020,cx-0.8,0.4,cz+0.87,g);
    box(1.3,0.36,0.1,0xfff2c0,cx,1.55,cz+0.6,g,0x554411);
    for(const px of [-0.55,0.55]) box(0.08,0.5,0.08,0x4a3020,cx+px,1.25,cz+0.6,g);
  }else if(st.kind==='playground'){
    box(2.0,0.08,2.0,0xb89a5e,cx,0.05,cz,g);
    const sl=box(0.42,0.12,1.7,0xe8a13c,cx-0.6,0.7,cz,g); sl.rotation.x=0.5;
    box(0.42,0.5,0.42,0xc23b2e,cx-0.6,1.05,cz-0.75,g);
    for(const px of [-0.25,0.25]) box(0.1,1.5,0.1,0x3a6bc2,cx+0.55+px,0.75,cz,g);
    box(0.7,0.1,0.1,0x3a6bc2,cx+0.55,1.5,cz,g);
    for(const px of [-0.15,0.15]){
      box(0.05,0.5,0.05,0xcccccc,cx+0.55+px,1.2,cz,g);
      box(0.24,0.06,0.24,0x8a5a2e,cx+0.55+px,0.92,cz,g);
    }
  }
  g.userData.structId=st.id;
  scene.add(g);
  structGroups.set(st.id,g);
  // people for occupied sites
  syncPeople(st);
}
function removeStructureMesh(id){
  const g=structGroups.get(id);
  if(g){ scene.remove(g); structGroups.delete(id); }
  const p=peopleGroups.get(id);
  if(p){ scene.remove(p); peopleGroups.delete(id); }
}
function syncStructure(st){
  removeStructureMesh(st.id);
  buildStructureMesh(st);
}
function syncPeople(st){
  const old=peopleGroups.get(st.id);
  if(old){ scene.remove(old); peopleGroups.delete(st.id); }
  if(st.kind!=='site'||st.guestId<0) return;
  const guest=S.guests.find(v=>v.id===st.guestId);
  if(!guest||guest.state!=='camped') return;
  const g=new THREE.Group();
  const cx=wx(st.x)+(st.w-1)/2, cz=wz(st.y)+(st.h-1)/2;
  const shirts=[0xc23b2e,0x3f7ac2,0x53a05a,0xe8a13c];
  const nP=1+(guest.id%2);
  for(let i=0;i<nP;i++){
    const p=makePerson(shirts[(guest.id+i)%shirts.length]);
    p.position.set(cx+st.w/4+0.5+i*0.4, 0, cz+st.h/4+0.3-i*0.25);
    p.userData.phase=(guest.id+i)*1.7;
    g.add(p);
  }
  scene.add(g);
  peopleGroups.set(st.id,g);
}

/* ---------------- world (re)build ---------------- */
function rebuildWorld(){
  for(const [,g] of roadGroups) scene.remove(g);
  roadGroups.clear();
  for(const [,g] of structGroups) scene.remove(g);
  structGroups.clear();
  for(const [,g] of vehicleGroups) scene.remove(g);
  vehicleGroups.clear();
  for(const [,g] of peopleGroups) scene.remove(g);
  peopleGroups.clear();
  for(const q of shimmerQuads) scene.remove(q);
  fireMeshes=[];
  buildGround();
  rebuildTrees();
  buildShimmer();
  syncAllRoads();
  for(const st of S.structures) buildStructureMesh(st);
  ghost.visible=false;
  camTarget.set(0,0,wz(30)); positionCamera();
}

/* ---------------- ghost highlight ---------------- */
const TOOL_FOOT={select:[1,1],road:[1,1],clear:[1,1],tent:[1,1],popup:[2,2],medium:[2,3],rv:[3,3],
  pool:[2,2],bathroom:[2,2],store:[3,2],playground:[2,2],bulldoze:[1,1]};
function ghostValidity(x,y){
  const [w,h]=TOOL_FOOT[currentTool]||[1,1];
  if(currentTool==='select') return true;
  if(currentTool==='road'){
    if(!inB(x,y)) return false;
    const k=idx(x,y), r=S.road[k];
    if(r===R_NONE) return S.terrain[k]===T_GRASS&&S.tileStruct[k]<0&&S.money>=COST.roadDirt;
    if(S.roadLocked[k]||r===R_ASPHALT) return false;
    return S.money>=(r===R_DIRT?COST.roadGravel:COST.roadAsphalt);
  }
  if(currentTool==='clear') return inB(x,y)&&S.terrain[idx(x,y)]===T_TREE&&S.money>=COST.clearTree;
  if(currentTool==='bulldoze'){
    if(!inB(x,y)) return false;
    const k=idx(x,y);
    if(S.road[k]!==R_NONE) return !S.roadLocked[k];
    const id=S.tileStruct[k];
    if(id<0) return false;
    const st=structById(S,id);
    return !(st.kind==='site'&&st.guestId>=0);
  }
  // placements
  let cost=0;
  if(currentTool==='tent') cost=120; else if(currentTool==='popup') cost=300;
  else if(currentTool==='medium') cost=600; else if(currentTool==='rv') cost=1000;
  else if(currentTool==='pool') cost=900; else if(currentTool==='bathroom') cost=550;
  else if(currentTool==='store') cost=1400; else if(currentTool==='playground') cost=750;
  if(S.money<cost) return false;
  return footprintClear(S,x,y,w,h).ok && adjacentToRoad(S,x,y,w,h);
}
function updateGhost(x,y){
  if(currentTool==='select'||!x){ ghost.visible=false; ghostTile=null; return; }
  ghostTile={x,y};
  const [w,h]=TOOL_FOOT[currentTool]||[1,1];
  ghostOk=ghostValidity(x,y);
  ghost.scale.set(w,1,h);
  ghost.position.set(wx(x)+(w-1)/2, 0.16, wz(y)+(h-1)/2);
  ghost.material.color.setHex(ghostOk?0x2aff2a:0xff2a2a);
  ghost.visible=true;
}

/* ---------------- actions ---------------- */
function toast(msg,ms){
  const t=el('toast');
  t.textContent=msg; t.style.opacity=1;
  clearTimeout(t._h);
  t._h=setTimeout(()=>{ t.style.opacity=0; }, ms||1800);
}
function afterBuild(r,okSound){
  if(r.ok){ (okSound||sPlace)(); updateHUD(); }
  else { sError(); toast(r.msg); }
  return r.ok;
}
function tapTile(x,y){
  if(!S||!inB(x,y)) return false;
  ac(); // unlock audio on first interaction
  let r;
  switch(currentTool){
    case 'select': {
      const id=structAt(S,x,y);
      if(id>=0) openPanel(id); else closePanel();
      sClick(); return true;
    }
    case 'road':
      r=buildRoad(S,x,y);
      if(r.ok){ syncRoadTile(x,y); }
      return afterBuild(r, r.upgraded?sUpgrade:sPlace);
    case 'clear':
      r=clearTree(S,x,y);
      if(r.ok){ rebuildTrees(); refreshWaterTile(x,y); }
      return afterBuild(r,sCut);
    case 'tent': case 'popup': case 'medium': case 'rv': {
      const [w,h]=TOOL_FOOT[currentTool];
      r=placeSite(S,currentTool,x,y);
      if(r.ok){ const st=structById(S,r.id); buildStructureMesh(st); }
      return afterBuild(r);
    }
    case 'pool':
      r=placePool(S,x,y);
      if(r.ok){ const st=structById(S,r.id); buildStructureMesh(st); }
      return afterBuild(r);
    case 'bathroom': case 'store': case 'playground':
      r=placeBuilding(S,currentTool,x,y);
      if(r.ok){ const st=structById(S,r.id); buildStructureMesh(st); }
      return afterBuild(r);
    case 'bulldoze': {
      const id0=structAt(S,x,y);
      r=bulldoze(S,x,y);
      if(r.ok){
        if(r.id) removeStructureMesh(r.id);
        syncRoadTile(x,y);
        if(curPanel>=0) closePanel();
      }
      return afterBuild(r,sRaze);
    }
  }
  return false;
}

/* ---------------- panel ---------------- */
const FIRE_NAMES=['none','dirt spot','wheel ring','fancy stone'];
function openPanel(id){
  curPanel=id; renderPanel();
  el('panel').style.display='block';
}
function closePanel(){
  curPanel=-1;
  el('panel').style.display='none';
}
function renderPanel(){
  const st=structById(S,curPanel);
  if(!st){ closePanel(); return; }
  const body=el('panelBody');
  const show=(id,v)=>{ el(id).style.display=v?'block':'none'; };
  show('priceRow',false); show('pTableBtn',false); show('pFireBtn',false); show('pExpandBtn',false);
  if(st.kind==='site'){
    const def=SITE_CLASSES.find(c=>c.id===st.cls);
    el('panelTitle').textContent='⛺ '+def.name;
    let ginfo='Vacant';
    if(st.guestId>=0){
      const g=S.guests.find(v=>v.id===st.guestId);
      if(g) ginfo=RIG_NAMES[g.rig]+' • '+g.nightsLeft+' night'+(g.nightsLeft===1?'':'s')+' left\nHappiness '+'★'.repeat(g.happiness);
    }
    body.textContent=def.w+'x'+def.h+' site • fits: '+rigsFor(def.cap)+'\n'+ginfo;
    body.style.whiteSpace='pre-line';
    show('priceRow',true);
    el('pPriceVal').textContent='$'+st.price;
    const tb=el('pTableBtn');
    tb.textContent=st.table?'✓ Picnic table':'Add picnic table ($60)';
    tb.disabled=st.table||S.money<COST.table;
    show('pTableBtn',true);
    const fb=el('pFireBtn');
    const nt=st.firepit+1;
    fb.textContent=st.firepit>=3?'✓ Fancy stone firepit':
      'Firepit: '+FIRE_NAMES[st.firepit]+' → '+['','dirt ($25)','wheel ring ($70)','fancy stone ($160)'][nt];
    fb.disabled=st.firepit>=3||S.money<COST.firepit[nt];
    show('pFireBtn',true);
  }else if(st.kind==='pool'){
    el('panelTitle').textContent='🏊 Pool';
    body.textContent=(st.expanded?'3x3':'2x2')+' pool • +happiness for all guests';
    show('pExpandBtn',!st.expanded);
    el('pExpandBtn').disabled=S.money<POOL_DEF.expandCost;
  }else{
    const nm={bathroom:'🚻 Bathroom',store:'🏪 Camp store',playground:'🛝 Playground'}[st.kind];
    el('panelTitle').textContent=nm;
    body.textContent={
      bathroom:'Guests nearby are happier.',
      store:'Earns $4 per guest, per night.',
      playground:'Big happiness boost for tent & popup families.',
    }[st.kind];
  }
}
function rigsFor(cap){
  return ['tent','tent+popup','tent..medium','all rigs'][cap];
}
function panelAction(act){
  const st=structById(S,curPanel);
  if(!st) return false;
  let r=null;
  if(act==='priceUp') r=setSitePrice(S,st.id,st.price+5);
  else if(act==='priceDown') r=setSitePrice(S,st.id,st.price-5);
  else if(act==='table') r=buyTable(S,st.id);
  else if(act==='fire') r=buyFirepit(S,st.id);
  else if(act==='expand'){
    r=expandPool(S,st.id);
    if(r.ok) syncStructure(st);
  }
  if(!r) return false;
  if(r.ok!==false||act==='priceUp'||act==='priceDown'){
    if(act==='table'||act==='fire'){ syncStructure(st); sUpgrade(); }
    else if(act==='priceUp'||act==='priceDown'){ sClick(); }
    else if(act==='expand'){ sUpgrade(); }
    if(r.msg) toast(r.msg);
    updateHUD(); renderPanel();
    return true;
  }
  sError(); toast(r.msg);
  return false;
}

/* ---------------- HUD ---------------- */
function updateHUD(){
  el('money').textContent='$'+S.money.toLocaleString('en-US');
  el('day').textContent=S.day;
  el('guests').textContent=occupiedCount(S);
  el('stars').textContent=S.rating.toFixed(1);
  for(const [id,v] of [['spd0',0],['spd1',1],['spd2',2]])
    el(id).className='sbtn'+(S.speed===v?' on':'');
}
function setSpeed(v){
  S.speed=v; updateHUD(); sClick();
}

/* ---------------- events from sim ---------------- */
const VEH_COLORS=[0xc23b2e,0x2e6bc2,0x53a05a,0xe8a13c,0x8a4fc2,0x3a9a9a];
function drainEvents(evs){
  for(const e of evs){
    if(e.t==='turnedAway'){ sHonk(); }
    else if(e.t==='arrive'){ sArrive(); const st=structById(S,e.siteId); if(st) syncStructure(st); }
    else if(e.t==='paid'){ sCash(); }
    else if(e.t==='depart'){
      const st=structById(S,e.siteId);
      if(st) syncStructure(st);
      if(e.tip>0) toast('⭐ '+e.stars+'-star stay! Tip +$'+e.tip);
    }
    else if(e.t==='midnight'){ sChime(); }
    else if(e.t==='storeRev'){ /* cash sound already via paid */ }
  }
  if(evs.length) updateHUD();
}

/* ---------------- input ---------------- */
const ptrs=new Map();
let downX=0,downY=0,downT=0,dragging=false,pinchD=0,pinchVH=34;
function bindInput(){
  const cv=el('cv');
  cv.addEventListener('pointerdown',e=>{
    ac();
    try{ cv.setPointerCapture(e.pointerId); }catch(err){}
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size===1){ downX=e.clientX; downY=e.clientY; downT=performance.now(); dragging=false; }
    else if(ptrs.size===2){
      const p=[...ptrs.values()];
      pinchD=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y); pinchVH=viewH; dragging=true;
    }
  });
  cv.addEventListener('pointermove',e=>{
    const p=ptrs.get(e.pointerId);
    if(p){ p.x=e.clientX; p.y=e.clientY; }
    if(ptrs.size===2){
      const q=[...ptrs.values()];
      const d=Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y);
      if(pinchD>0){ viewH=clamp(pinchVH*pinchD/Math.max(20,d),12,52); resize(); }
      return;
    }
    if(ptrs.size===1&&ptrs.has(e.pointerId)){
      const dx=e.clientX-downX, dy=e.clientY-downY;
      if(!dragging&&Math.hypot(dx,dy)>12) dragging=true;
      if(dragging){
        const wpp=viewH/window.innerHeight;
        panCam(-(e.clientX-(p._lx??e.clientX))*wpp,(e.clientY-(p._ly??e.clientY))*wpp);
        p._lx=e.clientX; p._ly=e.clientY;
        updateGhost(null);
      }else{
        const t=screenToTile(e.clientX,e.clientY);
        updateGhost(t?t.x:null,t?t.y:null);
      }
    }
  });
  const up=e=>{
    const wasTap=!dragging&&(performance.now()-downT)<600&&ptrs.size===1;
    ptrs.delete(e.pointerId);
    if(wasTap){
      const t=screenToTile(e.clientX,e.clientY);
      if(t) tapTile(t.x,t.y);
    }
    if(ptrs.size===0) dragging=false;
  };
  cv.addEventListener('pointerup',up);
  cv.addEventListener('pointercancel',e=>{ ptrs.delete(e.pointerId); dragging=false; });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    zoomBy(e.deltaY>0?1.12:0.89);
  },{passive:false});
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
    if(e.repeat) return;
    const k=e.key.toLowerCase();
    if(k==='m') toggleMute();
    else if(k==='p'||k===' ') setSpeed(S.speed===0?1:0);
    else if(k==='1') selectTool('select');
    else if(k==='2') selectTool('road');
    else if(k==='3') selectTool('clear');
    else if(k==='4') selectTool('tent');
    else if(k==='5') selectTool('popup');
    else if(k==='6') selectTool('medium');
    else if(k==='7') selectTool('rv');
    else if(k==='8') selectTool('pool');
    else if(k==='9') selectTool('bathroom');
    else if(k==='0') selectTool('bulldoze');
  });
}
function toggleMute(){
  muted=!muted;
  el('muteBtn').textContent=muted?'🔇':'🔊';
  if(!muted) sClick();
}

/* ---------------- toolbar ---------------- */
const TOOL_IDS=['select','road','clear','tent','popup','medium','rv','pool','bathroom','store','playground','bulldoze'];
function selectTool(id){
  currentTool=id;
  for(const t of TOOL_IDS) el('tool-'+t).className='tool'+(t===id?' on':'');
  closePanel();
  updateGhost(null);
  sClick();
}
function wireUI(){
  for(const t of TOOL_IDS)
    el('tool-'+t).addEventListener('click',()=>selectTool(t));
  el('spd0').addEventListener('click',()=>setSpeed(0));
  el('spd1').addEventListener('click',()=>setSpeed(1));
  el('spd2').addEventListener('click',()=>setSpeed(2));
  el('muteBtn').addEventListener('click',toggleMute);
  el('panelClose').addEventListener('click',closePanel);
  el('pPriceDown').addEventListener('click',()=>panelAction('priceDown'));
  el('pPriceUp').addEventListener('click',()=>panelAction('priceUp'));
  el('pTableBtn').addEventListener('click',()=>panelAction('table'));
  el('pFireBtn').addEventListener('click',()=>panelAction('fire'));
  el('pExpandBtn').addEventListener('click',()=>panelAction('expand'));
}

/* ---------------- main loop ---------------- */
let lastT=0, acc=0;
function frame(t){
  requestAnimationFrame(frame);
  const now=t/1000;
  let dt=Math.min(0.25, now-(lastT||now));
  lastT=now;
  frameNo++;
  if(S.speed>0&&dt>0){
    acc+=dt*S.speed;
    let n=0;
    while(acc>=1/60&&n<10){
      const evs=tickSim(S,1/60);
      if(evs.length) drainEvents(evs);
      acc-=1/60; n++;
    }
    if(n===10) acc=0;
  }
  syncVisuals(dt, now);
  if(frameNo%15===0) updateHUD();
  renderer.render(scene,camera);
}
function syncVisuals(dt, now){
  // vehicles
  const seen=new Set();
  for(const g of S.guests){
    if(g.state!=='arriving'&&g.state!=='departing') continue;
    seen.add(g.id);
    let vg=vehicleGroups.get(g.id);
    if(!vg){
      vg=buildVehicleMesh(g.rig, VEH_COLORS[g.id%VEH_COLORS.length]);
      scene.add(vg); vehicleGroups.set(g.id,vg);
    }
    vg.position.set(wx(g.px), 0.15, wz(g.py));
    if(g.path.length>1){
      const a=g.path[Math.min(g.seg,g.path.length-1)], b=g.path[Math.min(g.seg+1,g.path.length-1)];
      const dx=b.x-a.x, dy=b.y-a.y;
      if(dx||dy) vg.rotation.y=Math.atan2(dx,dy)-Math.PI/2;
    }
  }
  for(const [id,vg] of vehicleGroups){
    if(!seen.has(id)){ scene.remove(vg); vehicleGroups.delete(id); }
  }
  // water shimmer
  for(const q of shimmerQuads){
    q.position.x+=q.userData.speed*dt;
    if(q.position.x>wx(q.userData.x)+0.7) q.position.x=wx(q.userData.x)-0.7;
  }
  // fire flicker
  for(let i=0;i<fireMeshes.length;i++){
    const f=fireMeshes[i];
    f.scale.y=1+0.25*Math.sin(now*13+i*1.7);
  }
  // people bob
  for(const [,pg] of peopleGroups){
    for(const p of pg.children){
      p.position.y=0.02*Math.abs(Math.sin(now*2.2+p.userData.phase));
      p.rotation.y=Math.sin(now*0.7+p.userData.phase)*0.6;
    }
  }
}

/* ---------------- boot ---------------- */
function startSeed(seed){
  S=newGame(seed);
  rebuildWorld();
  closePanel();
  updateHUD();
}
function boot(){
  bootThree();
  S=newGame((Date.now()%100000)|0);
  rebuildWorld();
  wireUI();
  bindInput();
  updateHUD();
  selectTool('select');
  requestAnimationFrame(frame);
}
boot();

/* test hooks (harmless in browser) */
window.CampTest={
  selectTool, tapTile, setSpeed, openPanel, closePanel, panelAction,
  startSeed, screenToTile, toggleMute,
  get S(){ return S; },
  get tool(){ return currentTool; },
  get panel(){ return curPanel; },
};
