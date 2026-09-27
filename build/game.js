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

let renderer, scene, camera, camTarget, sunLight=null, hemiLight=null, bgCol=null;
let viewH = 34, viewAspect = 1;
let camRot = 0; // 0..3, 90° stops
let glowSprites = new Map(); // structId -> {sprite, phase, base}
let glowTex = null;
let stars = null;
let restartArmedAt = -1e9;
let restartBtnEl = null;
let saveAcc = 0;
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
let radiusGroup = null, radiusPinned = false; // amenity effective-radius circle
// radius shown while placing (level-0); inspecting uses radiusFor(st) for the live level
const TOOL_BASE_R = {bathroom:BATH_R, pool:5, playground:PLAY_R, dock:7};
function radiusFor(st){
  if(!st) return 0;
  if(st.kind==='bathroom') return BATH_R;
  if(st.kind==='playground') return PLAY_R;
  if(st.kind==='pool') return poolRadius(st);
  if(st.kind==='dock') return dockRadius(st);
  return 0;
}
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
  bgCol = new THREE.Color(0x87b5e0);
  scene.background = bgCol;
  camera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,400);
  hemiLight = new THREE.HemisphereLight(0xeaf4ff, 0x3a5a34, 0.95);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xfff2d8, 0.85);
  sunLight.position.set(30,48,18); scene.add(sunLight);
  scene.fog = new THREE.Fog(0x87b5e0, 80, 220);
  buildStars();
  const under = new THREE.Mesh(new THREE.PlaneGeometry(600,600), mat(0x5a7a4a));
  under.rotation.x = -Math.PI/2; under.position.y = -0.5; scene.add(under);
  ghost = new THREE.Mesh(boxGeo(1,0.22,1),
    new THREE.MeshBasicMaterial({color:0x00ff00, transparent:true, opacity:0.35, depthWrite:false}));
  ghost.visible = false; scene.add(ghost);
  // translucent circle showing an amenity's effective radius
  radiusGroup = new THREE.Group();
  const rFill = new THREE.Mesh(new THREE.CircleGeometry(1,48),
    new THREE.MeshBasicMaterial({color:0x7fd4ff, transparent:true, opacity:0.22, depthWrite:false}));
  rFill.rotation.x=-Math.PI/2;
  const rEdge = new THREE.Mesh(new THREE.RingGeometry(0.96,1,64),
    new THREE.MeshBasicMaterial({color:0x9fe2ff, transparent:true, opacity:0.85, depthWrite:false}));
  rEdge.rotation.x=-Math.PI/2;
  radiusGroup.add(rFill,rEdge);
  radiusGroup.position.y=0.06; radiusGroup.visible=false; scene.add(radiusGroup);
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
  const d=90, e=Math.asin(1/Math.sqrt(3)), az=Math.PI/4+camRot*Math.PI/2, ce=Math.cos(e);
  camera.position.set(camTarget.x+d*ce*Math.cos(az), camTarget.y+d*Math.sin(e), camTarget.z+d*ce*Math.sin(az));
  camera.lookAt(camTarget);
}
function rotateCam(){ camRot=(camRot+1)%4; positionCamera(); sClick(); }
function panCam(rx, uy){
  const az=Math.PI/4+camRot*Math.PI/2;
  const rwx=Math.sin(az), rwz=-Math.cos(az);   // screen-right in world XZ
  const uwx=-Math.cos(az), uwz=-Math.sin(az);  // screen-up in world XZ
  camTarget.x=clamp(camTarget.x+rx*rwx+uy*uwx, -W/2-8, W/2+8);
  camTarget.z=clamp(camTarget.z+rx*rwz+uy*uwz, -H/2-8, H/2+8);
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
    q.userData={x, y, speed:0.25+((i*13)%10)/22};
    scene.add(q); shimmerQuads.push(q);
  }
}
function refreshShimmer(){
  // rebuild the shimmer set so newly dug (or filled) lake tiles join it
  for(const q of shimmerQuads) scene.remove(q);
  buildShimmer();
}
/* ---------------- night: stars + campfire glow ---------------- */
function buildStars(){
  if(stars||!THREE.BufferGeometry||!THREE.Points) return;
  const n=170, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const a=Math.random()*TAU, r=70+Math.random()*140;
    pos[i*3]=Math.cos(a)*r; pos[i*3+1]=34+Math.random()*110; pos[i*3+2]=Math.sin(a)*r;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:0xffffff,size:1.6,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false});
  stars=new THREE.Points(geo,m); scene.add(stars);
}
function makeGlowTexture(){
  const c=document.createElement('canvas'); c.width=c.height=128;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,4,64,64,64);
  g.addColorStop(0,'rgba(255,196,110,1)');
  g.addColorStop(0.35,'rgba(255,140,50,0.55)');
  g.addColorStop(1,'rgba(255,90,20,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function syncGlows(){
  for(const [id,e] of glowSprites){
    const st=structById(S,id);
    const want=st&&((st.kind==='site'&&st.firepit>0)||st.kind==='store');
    if(!want){ scene.remove(e.sprite); glowSprites.delete(id); }
  }
  if(!glowTex) glowTex=makeGlowTexture();
  for(const st of S.structures){
    if(glowSprites.has(st.id)) continue;
    let x,z,scale,base;
    if(st.kind==='site'&&st.firepit>0){
      x=wx(st.x)+(st.w-1)/2+st.w/4; z=wz(st.y)+(st.h-1)/2+st.h/4;
      scale=2.6+st.firepit*0.5; base=0.85;
    }else if(st.kind==='store'){
      x=wx(st.x)+(st.w-1)/2; z=wz(st.y)+(st.h-1)/2;
      scale=3.2; base=0.3;
    }else continue;
    const m=new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0});
    const sp=new THREE.Sprite(m);
    sp.position.set(x,1.0,z); sp.scale.set(scale,scale,1);
    scene.add(sp);
    glowSprites.set(st.id,{sprite:sp,phase:st.id*1.37,base});
  }
}
/* floating emoji signs over bathroom/store */
let signSprites = new Map(); // structId -> {sprite, baseY, phase}
function makeTextSprite(text,size){
  const c=document.createElement('canvas'); c.width=c.height=128;
  const ctx=c.getContext('2d');
  ctx.font='92px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,64,70);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false }));
  sp.scale.set(size,size,1);
  return sp;
}
function syncSigns(st){
  const old=signSprites.get(st.id);
  if(old){ scene.remove(old.sprite); signSprites.delete(st.id); }
  if(st.kind!=='bathroom'&&st.kind!=='store') return;
  const cx=wx(st.x)+(st.w-1)/2, cz=wz(st.y)+(st.h-1)/2;
  const sp=makeTextSprite(st.kind==='bathroom'?'🚻':'🏪',1.5);
  const baseY=st.kind==='bathroom'?2.3:2.7;
  sp.position.set(cx,baseY,cz);
  scene.add(sp);
  signSprites.set(st.id,{sprite:sp,baseY,phase:st.id*2.13});
}
/* floating payment text (rises and fades) */
let floaters=[]; // {sp, life, ttl}
function makeFloatTexture(text,color){
  const c=document.createElement('canvas'); c.width=256; c.height=96;
  const ctx=c.getContext('2d');
  ctx.font='bold 54px Verdana,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.lineWidth=8; ctx.strokeStyle='rgba(0,0,0,0.85)';
  ctx.strokeText(text,128,48);
  ctx.fillStyle=color; ctx.fillText(text,128,48);
  return new THREE.CanvasTexture(c);
}
function spawnFloater(text,x,z,color){
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({
    map:makeFloatTexture(text,color), transparent:true, depthWrite:false }));
  sp.scale.set(2.8,1.05,1); sp.position.set(x,1.8,z);
  scene.add(sp);
  floaters.push({sp,life:0,ttl:1.2});
}
function siteCenter(st){ return {x:wx(st.x)+(st.w-1)/2, z:wz(st.y)+(st.h-1)/2}; }
function clearFloaters(){
  for(const f of floaters) scene.remove(f.sp);
  floaters=[];
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
function buildFirepit(g,cx,cz,tier,structId){
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
    fireMeshes.push({m:f, id:structId}); // flame lit only when the site is occupied
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
// rig parked ON a site (shown while camped). The pulling vehicle is gone —
// only the camper itself stays: tent for tent sites, trailers for popup/medium,
// the motorhome for the big RV.
function buildRigOnSite(g,rig,cx,cz,w,h){
  if(rig===RIG_TENT){
    buildTent(g,cx,cz,0x3f7ac2);
    g.userData.parkedRig='tent';
  }else if(rig===RIG_POPUP){
    buildTrailer(g,cx,cz,1.2,0x53a05a,true);
    g.userData.parkedRig='popup-trailer';
  }else if(rig===RIG_MEDIUM){
    buildTrailer(g,cx,cz,1.8,0x3f7ac2,false);
    g.userData.parkedRig='medium-trailer';
  }else{
    buildRV(g,cx,cz,0xe8e0d0);
    g.userData.parkedRig='rv';
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
    buildFirepit(g,fx,fz,st.firepit,st.id);
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
  }else if(st.kind==='dock'){
    box(2.0,0.12,2.0,0x8a5a2e,cx,0.12,cz,g); // deck
    for(const px of [-0.9,0.9]) for(const pz of [-0.9,0.9])
      box(0.14,0.7,0.14,0x5a3a1e,cx+px,-0.12,cz+pz,g); // pilings
    box(2.0,0.1,0.1,0x6b4426,cx,0.42,cz-0.95,g); // railing
    for(const px of [-0.9,0.9]) box(0.1,0.4,0.1,0x6b4426,cx+px,0.3,cz-0.95,g);
    const dlv=st.level|0;
    if(dlv>=1) for(const bx of [-0.5,0.5]){ // row boats
      box(0.5,0.16,0.95,0x7a4a22,cx+bx,0.14,cz+0.45,g);
      box(0.34,0.1,0.75,0x2e9fe8,cx+bx,0.16,cz+0.45,g);
      box(0.36,0.06,0.12,0x8a5a2e,cx+bx,0.22,cz+0.45,g);
    }
    if(dlv>=2) for(const jx of [-0.55,0.55]){ // jetskis
      box(0.42,0.18,0.85,0x22cc66,cx+jx,0.14,cz-0.5,g);
      box(0.2,0.14,0.32,0x114422,cx+jx,0.26,cz-0.62,g);
    }
  }
  g.userData.structId=st.id;
  scene.add(g);
  structGroups.set(st.id,g);
  // people for occupied sites
  syncPeople(st);
  syncGlows();
  syncSigns(st);
}
function removeStructureMesh(id){
  const g=structGroups.get(id);
  if(g){ scene.remove(g); structGroups.delete(id); }
  const p=peopleGroups.get(id);
  if(p){ scene.remove(p); peopleGroups.delete(id); }
  const sg=signSprites.get(id);
  if(sg){ scene.remove(sg.sprite); signSprites.delete(id); }
  fireMeshes=fireMeshes.filter(f=>f.id!==id);
  syncGlows();
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
  for(const [,e] of glowSprites) scene.remove(e.sprite);
  glowSprites.clear();
  for(const [,sg] of signSprites) scene.remove(sg.sprite);
  signSprites.clear();
  clearFloaters();
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
  pool:[2,2],lake:[1,1],bathroom:[2,2],store:[3,2],playground:[2,2],dock:[2,2],bulldoze:[1,1]};
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
  if(currentTool==='lake'){
    if(!inB(x,y)) return false;
    const k=idx(x,y);
    return S.terrain[k]===T_GRASS&&S.road[k]===R_NONE&&S.tileStruct[k]<0&&S.money>=COST.lake;
  }
  if(currentTool==='dock'){
    if(!inB(x,y)) return false;
    if(S.money<DOCK_DEF.cost) return false;
    return dockSpotOk(S,x,y).ok;
  }
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
  // radius preview for amenity tools (pinned panel circle is left alone)
  const tr=TOOL_BASE_R[currentTool];
  if(tr&&x!=null){
    const [w,h]=TOOL_FOOT[currentTool]||[1,1];
    showRadius(wx(x)+(w-1)/2, wz(y)+(h-1)/2, tr, false);
  } else if(!radiusPinned) hideRadius();
  if(currentTool==='select'||!x){ ghost.visible=false; ghostTile=null; return; }
  ghostTile={x,y};
  const [w,h]=TOOL_FOOT[currentTool]||[1,1];
  ghostOk=ghostValidity(x,y);
  ghost.scale.set(w,1,h);
  ghost.position.set(wx(x)+(w-1)/2, 0.16, wz(y)+(h-1)/2);
  // lakes preview blue; everything else green/red
  ghost.material.color.setHex(currentTool==='lake'?(ghostOk?0x2a7aff:0xff2a2a):(ghostOk?0x2aff2a:0xff2a2a));
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
    case 'lake':
      r=digLake(S,x,y);
      if(r.ok){ refreshWaterTile(x,y); refreshShimmer(); }
      return afterBuild(r);
    case 'dock':
      r=placeDock(S,x,y);
      if(r.ok){ const st=structById(S,r.id); buildStructureMesh(st); }
      return afterBuild(r);
    case 'bathroom': case 'store': case 'playground':
      r=placeBuilding(S,currentTool,x,y);
      if(r.ok){ const st=structById(S,r.id); buildStructureMesh(st); }
      return afterBuild(r);
    case 'bulldoze': {
      const id0=structAt(S,x,y);
      const wasWater=S.terrain[idx(x,y)]===T_WATER;
      r=bulldoze(S,x,y);
      if(r.ok){
        if(r.id) removeStructureMesh(r.id);
        syncRoadTile(x,y);
        refreshWaterTile(x,y); // lake fill shows grass again
        if(wasWater) refreshShimmer(); // filled lakes leave the shimmer set
        if(curPanel>=0) closePanel();
      }
      return afterBuild(r,sRaze);
    }
  }
  return false;
}

/* ---------------- panel ---------------- */
const FIRE_NAMES=['none','dirt spot','wheel ring','fancy stone'];
let panelOpenT=-1e9;
function showRadius(cx,cz,r,pinned){
  if(!radiusGroup) return;
  radiusGroup.position.x=cx; radiusGroup.position.z=cz;
  radiusGroup.scale.set(r,1,r);
  radiusGroup.visible=true; radiusPinned=!!pinned;
}
function hideRadius(){
  radiusPinned=false;
  if(radiusGroup) radiusGroup.visible=false;
}
function openPanel(id){
  curPanel=id; renderPanel();
  el('panel').style.display='block';
  panelOpenT=performance.now();
  const st=structById(S,id), tr=radiusFor(st);
  if(tr) showRadius(wx(st.x)+(st.w-1)/2, wz(st.y)+(st.h-1)/2, tr, true);
  else hideRadius();
}
// The tap that opens the panel can land on a button the panel just revealed;
// swallow clicks that arrive within 500ms of the panel opening.
function guardPanelTap(e){
  if(performance.now()-panelOpenT<500){
    e.preventDefault(); e.stopImmediatePropagation();
  }
}
function closePanel(){
  curPanel=-1;
  el('panel').style.display='none';
  hideRadius();
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
    tb.textContent=st.table?'✓ Picnic table':'Add picnic table ($120)';
    tb.disabled=st.table||S.money<COST.table;
    show('pTableBtn',true);
    const fb=el('pFireBtn');
    const nt=st.firepit+1;
    fb.textContent=st.firepit>=3?'✓ Fancy stone firepit':
      'Firepit: '+FIRE_NAMES[st.firepit]+' → '+['','dirt ($25)','wheel ring ($70)','fancy stone ($160)'][nt];
    fb.disabled=st.firepit>=3||S.money<COST.firepit[nt];
    show('pFireBtn',true);
  }else if(st.kind==='pool'){
    const plv=st.level|0;
    el('panelTitle').textContent='🏊 Pool';
    body.textContent=(['2x2','3x3','4x4'][plv]||'2x2')+' pool • +2 happiness within '+poolRadius(st)+' tiles';
    const pnx=POOL_LEVELS[plv+1];
    show('pExpandBtn',!!pnx);
    if(pnx){
      el('pExpandBtn').textContent='Expand pool ($'+pnx.cost.toLocaleString('en-US')+')';
      el('pExpandBtn').disabled=S.money<pnx.cost;
    }
  }else if(st.kind==='dock'){
    const dlv=st.level|0;
    el('panelTitle').textContent='🎣 Fishing dock';
    body.textContent=['+1 happiness within 7 tiles','+1 happiness within 9 tiles • row boats','+1 happiness within 11 tiles • jetskis'][dlv]||'';
    const dnx=DOCK_LEVELS[dlv+1];
    show('pExpandBtn',!!dnx);
    if(dnx){
      el('pExpandBtn').textContent=(dlv===0?'Add row boats ($1,500)':'Add jetskis ($2,000)');
      el('pExpandBtn').disabled=S.money<dnx.cost;
    }
  }else{
    const nm={bathroom:'🚻 Bathroom',store:'🏪 Camp store',playground:'🛝 Playground'}[st.kind];
    el('panelTitle').textContent=nm;
    body.textContent={
      bathroom:'Guests within 8 tiles are happier.',
      store:'Earns $8 per guest, per night.',
      playground:'Big happiness boost for tent & popup families within 10 tiles.',
    }[st.kind];
  }
  // keep the radius circle in sync (e.g. pool expansion changes the footprint)
  const tr2=radiusFor(st);
  if(tr2) showRadius(wx(st.x)+(st.w-1)/2, wz(st.y)+(st.h-1)/2, tr2, true);
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
    r=(st.kind==='dock')?upgradeDock(S,st.id):expandPool(S,st.id);
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
  for(const [id,v] of [['spd0',0],['spd1',1],['spd2',5.4]])
    el(id).className='sbtn'+(S.speed===v?' on':'');
}
function setSpeed(v){
  S.speed=v; updateHUD(); sClick();
}

/* ---------------- persistence (silent autosave) ---------------- */
const SAVE_KEY='campground-tycoon-save-v1';
function saveGame(){
  if(!S) return;
  try{ localStorage.setItem(SAVE_KEY, saveState(S)); }catch(e){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    return loadState(raw);
  }catch(e){ return null; }
}
function reloadSave(){
  const s2=loadGame();
  if(s2){ S=s2; rebuildWorld(); closePanel(); updateHUD(); }
  return !!s2;
}
/* ---------------- restart (two-tap SURE? confirm) ---------------- */
function tapRestart(){
  const nowMs=performance.now();
  if(nowMs-restartArmedAt<3000){
    restartArmedAt=-1e9;
    if(restartBtnEl) restartBtnEl.textContent='↺';
    try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
    closeDbg(); // dismiss any departure reports from the old park
    startSeed((Date.now()%100000)|0);
    saveAcc=0;
    toast('Fresh campground — good luck!');
    sChime();
  }else{
    restartArmedAt=nowMs;
    if(restartBtnEl) restartBtnEl.textContent='SURE?';
    sClick();
  }
}

/* ---------------- events from sim ---------------- */
const VEH_COLORS=[0xc23b2e,0x2e6bc2,0x53a05a,0xe8a13c,0x8a4fc2,0x3a9a9a];
function drainEvents(evs){
  for(const e of evs){
    if(e.t==='turnedAway'){ sHonk(); if(debugMode) dbgPush(dbgTurnHtml(e)); }
    else if(e.t==='arrive'){ sArrive(); const st=structById(S,e.siteId); if(st) syncStructure(st); }
    else if(e.t==='paid'){
      sCash();
      const g=S.guests.find(v=>v.id===e.guestId);
      const st=g&&structById(S,g.siteId);
      if(st){ const c=siteCenter(st); spawnFloater('$'+e.amount,c.x,c.z,'#7dff7d'); }
    }
    else if(e.t==='depart'){
      const st=structById(S,e.siteId);
      if(st) syncStructure(st);
      if(e.tip>0){
        toast('⭐ '+e.stars+'-star stay! Tip +$'+e.tip);
        if(st){ const c=siteCenter(st); spawnFloater('+$'+e.tip+' tip',c.x,c.z,'#ffd24d'); }
      }
      if(debugMode&&e.report) dbgPush(dbgStayHtml(e.report));
    }
    else if(e.t==='midnight'){ sChime(); }
    else if(e.t==='storeRev'){ /* cash sound already via paid */ }
  }
  if(evs.length) updateHUD();
}

/* ---------------- debug departure dialog ---------------- */
let debugMode=false, dbgQueue=[], dbgIdx=0, dbgPaused=false, dbgPrevSpeed=1;
function toggleDebug(){
  debugMode=!debugMode;
  el('dbgBtn').className=debugMode?'on':'';
  if(!debugMode) closeDbg();
  const tb=el('mgTestBar'); if(tb) tb.style.display=debugMode?'flex':'none';
  toast(debugMode?'🐛 departure reports ON':'🐛 departure reports OFF');
}
function dbgPush(html){
  dbgQueue.push(html);
  if(el('dbgOverlay').style.display==='block') renderDbg();
  else {
    dbgIdx=0;
    // auto-pause for the report; remember speed so dismiss can resume
    dbgPaused=S.speed!==0;
    if(dbgPaused){ dbgPrevSpeed=S.speed; setSpeed(0); }
    renderDbg(); el('dbgOverlay').style.display='block';
  }
}
function renderDbg(){
  const n=dbgQueue.length;
  if(!n){ el('dbgOverlay').style.display='none'; return; }
  dbgIdx=Math.max(0,Math.min(dbgIdx,n-1));
  el('dbgBody').innerHTML=dbgQueue[dbgIdx];
  el('dbgPage').textContent=(dbgIdx+1)+' of '+n;
  el('dbgPrev').disabled=dbgIdx<=0;
  el('dbgNext').disabled=dbgIdx>=n-1;
}
function closeDbg(){
  dbgQueue=[]; dbgIdx=0; el('dbgOverlay').style.display='none';
  // resume only if we auto-paused and the user didn't touch speed meanwhile
  if(dbgPaused&&S.speed===0) setSpeed(dbgPrevSpeed);
  dbgPaused=false;
}
function dbgRow(k,v){ return '<div class="row"><span>'+k+'</span><b>'+v+'</b></div>'; }
function dbgStayHtml(r){
  const h=r.happy;
  return '<div class="sec">Group</div>'
    +dbgRow('Rig',RIG_NAMES[r.rig])
    +dbgRow('Budget','$'+r.budget)
    +dbgRow('Site',(r.siteCls||'—')+' @ $'+r.sitePrice+'/night')
    +'<div class="sec">Stay</div>'
    +dbgRow('Nights planned',r.nightsPlanned)
    +dbgRow('Nights stayed',r.nightsStayed)
    +dbgRow('Total paid','$'+r.totalPaid)
    +'<div class="sec">Happiness</div>'
    +dbgRow('Base','+'+h.base)
    +dbgRow('Picnic table','+'+h.table)
    +dbgRow('Firepit tier','+'+h.firepit)
    +dbgRow('Pool','+'+h.pool)
    +dbgRow('Playground','+'+h.playground)
    +dbgRow('Fishing dock','+'+h.dock)
    +dbgRow('Final (clamped 1–5)',h.final)
    +'<div class="sec">Checkout</div>'
    +dbgRow('Stars','★'.repeat(r.stars)+' ('+r.stars+')')
    +dbgRow('Tip','$'+r.tip)
    +dbgRow('Camp rating',r.ratingBefore.toFixed(2)+' → '+r.ratingAfter.toFixed(2));
}
function dbgTurnHtml(e){
  return '<div class="sec">Turned away (no stay)</div>'
    +dbgRow('Rig',RIG_NAMES[e.rig])
    +dbgRow('Budget','$'+e.budget)
    +dbgRow('Reason',e.reason);
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
    if(typeof mgKey==='function'&&mgKey(e,true)) return;
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
  window.addEventListener('keyup',e=>{ if(typeof mgKey==='function') mgKey(e,false); });
}
function toggleMute(){
  muted=!muted;
  el('muteBtn').textContent=muted?'🔇':'🔊';
  if(!muted) sClick();
}

/* ---------------- toolbar ---------------- */
const TOOL_IDS=['select','road','clear','tent','popup','medium','rv','pool','lake','bathroom','store','playground','dock','bulldoze'];
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
  el('spd2').addEventListener('click',()=>setSpeed(5.4));
  el('muteBtn').addEventListener('click',toggleMute);
  el('dbgBtn').addEventListener('click',()=>{ toggleDebug(); sClick(); });
  el('dbgPrev').addEventListener('click',()=>{ dbgIdx--; renderDbg(); sClick(); });
  el('dbgNext').addEventListener('click',()=>{ dbgIdx++; renderDbg(); sClick(); });
  el('dbgClose').addEventListener('click',()=>{ closeDbg(); sClick(); });
  el('rotBtn').addEventListener('click',rotateCam);
  restartBtnEl=el('restartBtn');
  restartBtnEl.addEventListener('click',tapRestart);
  el('panelClose').addEventListener('click',closePanel);
  el('panel').addEventListener('click',guardPanelTap,true); // capture: kill tap-through on fresh open
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
  if(restartBtnEl&&restartBtnEl.textContent==='SURE?'&&performance.now()-restartArmedAt>=3000){
    restartArmedAt=-1e9; restartBtnEl.textContent='↺';
  }
  saveAcc+=dt;
  if(saveAcc>=5){ saveAcc=0; saveGame(); }
  if(typeof mgTick==='function') mgTick(now);
  if(typeof MG!=='undefined'&&MG.active){
    // a camper-help minigame owns the screen; the main sim stays paused.
    // (the game may end itself mid-frame, so re-check before rendering)
    const mg=MG.active; mg.frame(dt, now);
    if(MG.active&&MG.renderer) MG.renderer.render(MG.active.scene, MG.active.camera);
  } else {
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
}
function syncVisuals(dt, now){
  // day/night lighting
  const lt=lightingFor(S.dayT/CYCLE_LEN);
  const dark=1-lt.dayness;
  if(sunLight){ sunLight.color.setHex(lt.sunColor); sunLight.intensity=lt.sunI; }
  if(hemiLight) hemiLight.intensity=lt.hemiI;
  if(bgCol) bgCol.setHex(lt.sky);
  if(scene.fog) scene.fog.color.setHex(lt.fog);
  for(const [id,e] of glowSprites){
    // campfire glow only when someone is at the site; the store always glows faintly
    const st=structById(S,id);
    const lit=!st||st.kind!=='site'||st.guestId>=0;
    const fl=0.72+0.20*Math.sin(now*9+e.phase)+0.08*Math.sin(now*23+e.phase*2.7);
    e.sprite.material.opacity=lit?dark*e.base*fl:0;
  }
  if(stars) stars.material.opacity=dark*0.9;
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
      // models face +x except pickup/trailer combos (built facing -x): flip those half a turn
      const flip=(g.rig===RIG_POPUP||g.rig===RIG_MEDIUM)?Math.PI:0;
      if(dx||dy) vg.rotation.y=Math.atan2(dx,dy)-Math.PI/2+flip;
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
  // fire flicker (flame visible only while the site is occupied)
  for(let i=0;i<fireMeshes.length;i++){
    const f=fireMeshes[i];
    const st=structById(S,f.id);
    const lit=st&&st.kind==='site'&&st.guestId>=0;
    f.m.visible=lit;
    if(lit) f.m.scale.y=1+0.25*Math.sin(now*13+i*1.7);
  }
  // people bob
  for(const [,pg] of peopleGroups){
    for(const p of pg.children){
      p.position.y=0.02*Math.abs(Math.sin(now*2.2+p.userData.phase));
      p.rotation.y=Math.sin(now*0.7+p.userData.phase)*0.6;
    }
  }
  // building signs bob
  for(const [,sg] of signSprites)
    sg.sprite.position.y=sg.baseY+0.12*Math.sin(now*2+sg.phase);
  // rising payment popups
  for(let i=floaters.length-1;i>=0;i--){
    const f=floaters[i]; f.life+=dt;
    f.sp.position.y+=dt*1.5;
    f.sp.material.opacity=1-f.life/f.ttl;
    if(f.life>=f.ttl){ scene.remove(f.sp); floaters.splice(i,1); }
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
  S=loadGame()||newGame((Date.now()%100000)|0);
  rebuildWorld();
  wireUI();
  bindInput();
  updateHUD();
  selectTool('select');
  window.addEventListener('pagehide',saveGame);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) saveGame(); });
  requestAnimationFrame(frame);
}
boot();

/* test hooks (harmless in browser) */
window.CampTest={
  selectTool, tapTile, setSpeed, openPanel, closePanel, panelAction, updateGhost,
  startSeed, screenToTile, toggleMute, toggleDebug, rotateCam, tapRestart,
  dbgNext:()=>{ dbgIdx++; renderDbg(); }, dbgPrev:()=>{ dbgIdx--; renderDbg(); }, closeDbg,
  _dbgPush:dbgPush,
  saveNow:saveGame, reloadSave,
  get S(){ return S; },
  get tool(){ return currentTool; },
  get panel(){ return curPanel; },
  get camRot(){ return camRot; },
  get debugMode(){ return debugMode; },
  get dbgQueue(){ return dbgQueue; },
  get dbgIdx(){ return dbgIdx; },
  get restartArmed(){ return performance.now()-restartArmedAt<3000; },
};
