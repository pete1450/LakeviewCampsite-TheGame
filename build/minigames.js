/* ==================== CAMPGROUND TYCOON: camper-help minigames ====================
   Three 3D minigames that pop up as "A camper needs help!".
   The pure-logic classes (MallowLogic, ShoesLogic, TrailerLogic) have no THREE/DOM
   dependencies so they run headless in node tests. Renderers build THREE scenes.
   NOTE: the marshmallow renders as a chunky box, not a cylinder — the 4 flat sides
   map exactly to the 4 cookable faces and match the game's voxel art style. */

function mgLerp(a,b,t){ return a+(b-a)*t; }
function mgLerp3(a,b,t){ return [mgLerp(a[0],b[0],t),mgLerp(a[1],b[1],t),mgLerp(a[2],b[2],t)]; }

/* ---------------- #1 marshmallow roast ----------------
   Drag sideways to spin the marshmallow; the side facing the fire cooks.
   White -> golden-brown at 75% (perfect) -> black; 100% bursts into flame (fail).
   Swipe UP to pull it off the fire; scored on mean distance from 75%. */
const MALLOW_COOK_RATE=14, MALLOW_TARGET=75;
function mallowColor(d){
  const w=[1,1,1], g=[0.79,0.49,0.19], b=[0.07,0.05,0.04];
  d=Math.max(0,Math.min(100,d));
  return d<=MALLOW_TARGET?mgLerp3(w,g,d/MALLOW_TARGET):mgLerp3(g,b,(d-MALLOW_TARGET)/(100-MALLOW_TARGET));
}
class MallowLogic{
  constructor(){ this.sides=[0,0,0,0]; this.angle=0; this.over=false; this.won=false; this.tip=0; this.burned=false; }
  // faces: 0:+y, 1:-y, 2:+z, 3:-z of the cylinder (quarter-cylinder segments)
  downSide(){
    const a=this.angle, d=[-Math.cos(a),Math.cos(a),Math.sin(a),-Math.sin(a)];
    let bi=0; for(let i=1;i<4;i++) if(d[i]>d[bi]) bi=i;
    return bi;
  }
  update(dt){
    if(this.over||dt<=0) return;
    const s=this.downSide();
    this.sides[s]=Math.min(100,this.sides[s]+MALLOW_COOK_RATE*dt);
    if(this.sides[s]>=100){ this.burned=true; this.over=true; this.won=false; this.tip=0; }
  }
  rotate(dA){ if(!this.over) this.angle+=dA; }
  finish(){
    if(this.over) return {tip:this.tip,won:this.won,burned:this.burned};
    this.over=true;
    // tip starts at $100; each side loses 2x its distance from 75% golden-brown
    const dev=Math.abs(this.sides[0]-MALLOW_TARGET)+Math.abs(this.sides[1]-MALLOW_TARGET)+
              Math.abs(this.sides[2]-MALLOW_TARGET)+Math.abs(this.sides[3]-MALLOW_TARGET);
    this.tip=Math.max(0,Math.round(100-2*dev));
    this.won=this.tip>0; // any positive tip = the camper's happy (win bar: my call)
    return {tip:this.tip,won:this.won,burned:false};
  }
}

/* ---------------- #2 horseshoes ----------------
   Tap the sweeping horizontal dial dead-center, then the vertical dial;
   the shoe launches with that offset. Land inside the ring = 1 point.
   3 tries, 3 points to win. */
const SHOE_MAX_OFF=1.6, SHOE_RING_R=0.5, SHOE_TRIES=3;
class ShoesLogic{
  constructor(){
    this.tries=0; this.points=0; this.phase='dialH';
    this.pos=0; this.dir=1; this.hErr=0; this.vErr=0;
    this.over=false; this.won=false; this.last=null;
  }
  dialSpeed(){ return 1.5*(1.7+this.tries*0.6); }
  update(dt){
    if(dt<=0) return;
    if(this.phase==='dialH'||this.phase==='dialV'){
      this.pos+=this.dir*this.dialSpeed()*dt;
      if(this.pos>1){ this.pos=1; this.dir=-1; } else if(this.pos<-1){ this.pos=-1; this.dir=1; }
    }
  }
  tap(){
    if(this.phase==='dialH'){ this.hErr=this.pos; this.phase='dialV'; this.pos=0; this.dir=1; return 'dialV'; }
    if(this.phase==='dialV'){ this.vErr=this.pos; this.phase='flying'; return 'flying'; }
    return null;
  }
  landPos(){ return {x:this.hErr*SHOE_MAX_OFF, z:this.vErr*SHOE_MAX_OFF}; }
  resolve(){
    const lp=this.landPos(), d=Math.hypot(lp.x,lp.z), hit=d<=SHOE_RING_R;
    if(hit) this.points++;
    this.tries++;
    this.last={hit:hit,d:d,points:this.points,tries:this.tries};
    if(this.tries>=SHOE_TRIES){ this.phase='done'; this.over=true; this.won=this.points>=SHOE_TRIES; }
    else { this.phase='dialH'; this.pos=0; this.dir=1; }
    return this.last;
  }
}

/* ---------------- #3 trailer backup ----------------
   Rear-view mirror view. Up = back up, Down = pull forward, Left/Right = steer.
   15 seconds to touch the truck hitch to the camper hitch. */
const TRAILER_TIME=15, TRAILER_REV=1.7, TRAILER_FWD=1.1,
      TRAILER_HITCH_L=2.2, TRAILER_WIN_D=0.7, TRAILER_STEER=0.55;
class TrailerLogic{
  constructor(){
    // truck faces +z (away from the trailer); its rear hitch points -z at the camper
    this.truck={x:1.4,z:9.5,heading:Math.PI-0.28};
    this.target={x:0,z:0};
    this.time=TRAILER_TIME; this.over=false; this.won=false;
    this.in={up:false,down:false,left:false,right:false};
  }
  fwd(){ const h=this.truck.heading; return {x:Math.sin(h),z:-Math.cos(h)}; }
  hitchPos(){ const f=this.fwd(),t=this.truck; return {x:t.x-f.x*TRAILER_HITCH_L, z:t.z-f.z*TRAILER_HITCH_L}; }
  dist(){ const h=this.hitchPos(); return Math.hypot(h.x-this.target.x,h.z-this.target.z); }
  update(dt){
    if(this.over||dt<=0) return;
    this.time-=dt;
    const steer=(this.in.left?1:0)-(this.in.right?1:0);
    const v=(this.in.down?TRAILER_FWD:0)-(this.in.up?TRAILER_REV:0);
    if(v!==0){
      const f=this.fwd(), t=this.truck;
      t.x+=f.x*v*dt; t.z+=f.z*v*dt;
      // bicycle model (signed v): screen-centric — left arrow swings the hitch
      // toward screen-left whether reversing or pulling forward
      t.heading+=steer*v*TRAILER_STEER*dt;
    }
    if(this.dist()<=TRAILER_WIN_D){ this.over=true; this.won=true; }
    else if(this.time<=0){ this.time=0; this.over=true; this.won=false; }
  }
}

/* ---------------- minigame manager ---------------- */
const MG={active:null,renderer:null,canvas:null,nextAt:0,bannerUntil:0,prevSpeed:1};
const MG_REWARD=15; // thank-you tip for winning (invented: user didn't specify rewards)
function mgNow(){ return performance.now()/1000; }
function mgSchedule(){ MG.nextAt=mgNow()+150+Math.random()*90; } // every few minutes
function mgCamped(){ let n=0; for(const st of S.structures) if(st.kind==='site'&&st.guestId>=0) n++; return n; }
function mgSetHtml(id,html){ const e=mgEl(id); if(e) e.innerHTML=html; }

// element registry: mgInitDom creates each overlay element once and registers it,
// so listeners attach to the same object the game later uses (the DOM stub's
// getElementById auto-creates lookalikes that would otherwise diverge).
const mgEls={};
function mgEl(id){ return mgEls[id]||document.getElementById(id); }

let mgDomBuilt=false;
function mgInitDom(){
  if(mgDomBuilt) return; mgDomBuilt=true;
  const reg=function(tag,id,parent){ const e=document.createElement(tag); e.id=id; parent.appendChild(e); mgEls[id]=e; return e; };
  const ov=reg('div','mgOverlay',document.body);
  ov.style.cssText='position:fixed;inset:0;z-index:60;display:none;background:#000;overflow:hidden;';
  const mk=function(id,css){ const e=reg('div',id,ov); e.style.cssText=css; return e; };
  mk('mgTitle','position:absolute;top:10px;left:12px;font-size:18px;font-weight:800;color:#fff;text-shadow:0 2px 6px #000;z-index:3;pointer-events:none;max-width:72vw;');
  mk('mgStat','position:absolute;top:12px;right:66px;font-size:16px;font-weight:800;color:#ffe9a8;text-shadow:0 2px 6px #000;z-index:3;pointer-events:none;');
  const closeB=reg('button','mgClose',ov); closeB.textContent='✕';
  closeB.style.cssText='position:absolute;top:8px;right:10px;z-index:4;font-size:18px;background:rgba(0,0,0,.5);color:#fff;border:2px solid #fff;border-radius:10px;padding:4px 12px;';
  closeB.addEventListener('click',function(){ if(typeof sClick==='function') sClick(); mgQuit(); });
  mk('mgHint','position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#fff;font-size:14px;text-shadow:0 2px 6px #000;z-index:3;pointer-events:none;padding:0 16px;');
  mk('mgExtra','position:absolute;inset:0;z-index:2;pointer-events:none;');
  mk('mgMirror','position:absolute;inset:0;z-index:2;pointer-events:none;display:none;border:14px solid #1c1c22;border-radius:26px;box-shadow:inset 0 0 60px rgba(0,0,0,.6);');
  // help banner
  const bn=reg('div','mgBanner',document.body);
  bn.innerHTML='<span>🆘 <b>A camper needs help!</b></span>'+
    '<button id="mgHelpBtn" style="font-size:15px;font-weight:800;background:#ffd23f;border:none;border-radius:10px;padding:8px 16px;">Help!</button>';
  const hb=mgEl('mgHelpBtn');
  if(hb) hb.addEventListener('click',function(){ if(typeof sClick==='function') sClick();
    const ids=['mallow','shoes','trailer']; mgStart(ids[(Math.random()*3)|0]); });
  bn.style.display='none';
  // debug test bar (shown only in debug mode)
  const bar=reg('div','mgTestBar',document.body);
  const bs='font-size:20px;background:rgba(10,25,10,.85);border:2px solid #d8f3c0;border-radius:10px;padding:6px 10px;';
  bar.innerHTML='<button id="mgT1" title="marshmallow test" style="'+bs+'">🔥</button>'+
                '<button id="mgT2" title="horseshoes test" style="'+bs+'">🐴</button>'+
                '<button id="mgT3" title="trailer test" style="'+bs+'">🚚</button>';
  const w1=mgEl('mgT1'),w2=mgEl('mgT2'),w3=mgEl('mgT3');
  if(w1) w1.addEventListener('click',function(){ mgStart('mallow'); });
  if(w2) w2.addEventListener('click',function(){ mgStart('shoes'); });
  if(w3) w3.addEventListener('click',function(){ mgStart('trailer'); });
  bar.style.cssText='position:fixed;left:8px;bottom:8px;z-index:55;display:none;gap:6px;';
}

function mgShowBanner(){
  const bn=mgEl('mgBanner'); if(!bn) return;
  bn.style.cssText='position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:55;'+
    'background:rgba(20,30,12,.94);border:2px solid #ffd23f;border-radius:14px;padding:10px 14px;'+
    'display:flex;gap:12px;align-items:center;color:#fff;font-size:15px;max-width:94vw;white-space:nowrap;';
  bn.style.display='flex'; // explicit: stub DOMs don't parse cssText
  MG.bannerUntil=mgNow()+25;
}
function mgHideBanner(resched){
  const bn=mgEl('mgBanner'); if(bn) bn.style.display='none';
  MG.bannerUntil=0;
  if(resched) mgSchedule();
}
// called from the main frame loop
function mgTick(now){
  if(MG.active) return;
  if(MG.bannerUntil){ if(now>=MG.bannerUntil) mgHideBanner(true); return; }
  if(S.speed>0&&now>=MG.nextAt&&mgCamped()>0) mgShowBanner();
}

const MG_BUILDERS={mallow:'buildMallow',shoes:'buildShoes',trailer:'buildTrailerGame'};
const MG_TITLES={mallow:'🔥 Roast a marshmallow',shoes:'🐴 Horseshoes',trailer:'🚚 Back up the trailer'};
function mgStart(id){
  if(MG.active||!MG_BUILDERS[id]) return false;
  mgHideBanner(false);
  MG.prevSpeed=S.speed; setSpeed(0);
  if(!MG.renderer){
    MG.renderer=new THREE.WebGLRenderer({antialias:true});
    if(MG.renderer.setPixelRatio) MG.renderer.setPixelRatio(window.devicePixelRatio||1);
    const cv=MG.renderer.domElement||document.createElement('canvas');
    cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
    mgEl('mgOverlay').appendChild(cv);
    MG.canvas=cv;
  }
  MG.renderer.setSize(window.innerWidth,window.innerHeight);
  const g=(MG_BUILDERS[id]==='buildMallow'?buildMallow():MG_BUILDERS[id]==='buildShoes'?buildShoes():buildTrailerGame());
  MG.active=Object.assign({id:id,logic:g.logic},g);
  mgEl('mgOverlay').style.display='block';
  mgEl('mgTitle').textContent=MG_TITLES[id];
  mgEl('mgHint').textContent=g.hint;
  mgEl('mgStat').textContent='';
  return true;
}
function mgTeardown(){
  const a=MG.active; MG.active=null;
  if(a&&a.scene) a.scene.traverse(function(o){
    if(o.geometry&&o.geometry.dispose) o.geometry.dispose();
    if(o.material){ const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.forEach(function(m){ if(m.map&&m.map.dispose) m.map.dispose(); if(m.dispose) m.dispose(); }); }
  });
  try{ if(a&&a.dispose) a.dispose(); }catch(e){}
  mgEl('mgOverlay').style.display='none';
  mgSetHtml('mgExtra','');
  mgEl('mgMirror').style.display='none';
  mgEl('mgHint').textContent='';
  mgEl('mgStat').textContent='';
  mgEl('mgTitle').textContent='';
}
function mgEnd(res){
  if(!MG.active) return;
  const reward=(res&&res.reward!=null)?res.reward:MG_REWARD; // a game may pay its own tip
  if(res&&res.won){ S.money+=reward; S.stats.earned+=reward;
    if(typeof sCash==='function') sCash(); toast('🙏 The camper thanks you! +$'+reward); }
  else if(res&&res.msg) toast(res.msg);
  mgTeardown();
  setSpeed(MG.prevSpeed);
  if(typeof updateHUD==='function') updateHUD();
  mgSchedule();
}
function mgQuit(){ // ✕ / Esc: no reward, no toast
  if(!MG.active) return;
  mgTeardown();
  setSpeed(MG.prevSpeed);
  mgSchedule();
}
function mgKey(e,down){
  if(!MG.active) return false;
  if(e.key==='Escape'){ if(down) mgQuit(); return true; }
  const a=MG.active;
  if(a.id==='trailer'&&a.setInput){
    const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if(map[e.key]){ a.setInput(map[e.key],down); if(down&&e.preventDefault) e.preventDefault(); return true; }
  }
  return false;
}

function mgBox(w,h,d,color,x,y,z,emissive){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:color}));
  m.position.set(x,y,z);
  if(emissive!=null){ m.material.emissive=new THREE.Color(emissive); m.material.emissiveIntensity=0.9; }
  return m;
}

mgInitDom();
mgSchedule();
if(window.CampTest) Object.assign(window.CampTest,{
  mgStart:mgStart, mgQuit:mgQuit, mgEnd:mgEnd,
  mgActive:function(){ return !!MG.active; },
  mgId:function(){ return MG.active&&MG.active.id; },
  mgLogic:function(){ return MG.active&&MG.active.logic; },
  mgTickNow:function(n){ mgTick(n); },
  mgBannerVisible:function(){ const b=mgEl('mgBanner'); return !!(b&&b.style.display!=='none'); },
  _mgEl:mgEl,
  _MG:MG
});

/* ---------------- renderer: marshmallow ---------------- */
function buildMallow(){
  const logic=new MallowLogic();
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0b1026);
  const camera=new THREE.PerspectiveCamera(55,window.innerWidth/Math.max(1,window.innerHeight),0.1,100);
  camera.position.set(4.6,3.2,5.6); camera.lookAt(0,1.2,0);
  scene.add(new THREE.HemisphereLight(0x8fa3ff,0x14210f,0.55));
  const fireLight=new THREE.PointLight(0xff8033,2.4,16); fireLight.position.set(0,1.4,0); scene.add(fireLight);
  scene.add(mgBox(34,1,34,0x14301a,0,-0.5,0));
  for(let i=0;i<9;i++){ const a=i/9*Math.PI*2; scene.add(mgBox(0.44,0.32,0.44,0x8a8f96,Math.cos(a)*1.3,0.16,Math.sin(a)*1.3)); }
  for(let i=0;i<3;i++){ const log=mgBox(1.8,0.3,0.3,0x6b4a2a,0,0.42+i*0.22,0); log.rotation.y=i*Math.PI/3+0.4; scene.add(log); }
  const flame=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.6,7),new THREE.MeshBasicMaterial({color:0xff7b24}));
  flame.position.set(0,1.3,0); scene.add(flame);
  const flame2=new THREE.Mesh(new THREE.ConeGeometry(0.3,1.0,7),new THREE.MeshBasicMaterial({color:0xffd23f}));
  flame2.position.set(0,1.2,0); scene.add(flame2);
  // skewer: stick + chunky 4-sided marshmallow over the fire
  const skewer=new THREE.Group(); skewer.position.set(1.05,1.85,0); scene.add(skewer);
  skewer.add(mgBox(3.6,0.09,0.09,0x8a6238,0.7,0,0));
  const endMat=new THREE.MeshLambertMaterial({color:0xf3ecdd});
  const sideMats=[]; for(let i=0;i<4;i++) sideMats.push(new THREE.MeshLambertMaterial({color:0xffffff}));
  // white cylinder on the stick: 4 quarter-cylinder segments, one per logical
  // cooking side (0:+y, 1:-y, 2:+z, 3:-z); each colors independently as it cooks
  const mallow=new THREE.Group(); mallow.position.set(-1.05,0,0); skewer.add(mallow);
  const segCenter=[Math.PI/2, 3*Math.PI/2, 0, Math.PI]; // theta center per side k
  for(let k=0;k<4;k++){
    const g=new THREE.CylinderGeometry(0.31,0.31,0.95,8,1,true, segCenter[k]-Math.PI/4, Math.PI/2);
    g.rotateZ(Math.PI/2); // lay the cylinder axis along X (the stick)
    mallow.add(new THREE.Mesh(g, sideMats[k]));
  }
  const capG=new THREE.CircleGeometry(0.31,12);
  const cap1=new THREE.Mesh(capG,endMat); cap1.position.x=0.476; cap1.rotation.y=Math.PI/2; mallow.add(cap1);
  const cap2=new THREE.Mesh(capG,endMat); cap2.position.x=-0.476; cap2.rotation.y=-Math.PI/2; mallow.add(cap2);
  const burnFlame=new THREE.Mesh(new THREE.ConeGeometry(0.5,1.1,7),new THREE.MeshBasicMaterial({color:0xff4400}));
  burnFlame.position.set(-1.05,0.65,0); burnFlame.visible=false; skewer.add(burnFlame);
  // doneness bars HUD
  let bh='<div style="position:absolute;top:64px;left:12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;">';
  for(let i=0;i<4;i++) bh+='<div style="display:flex;align-items:center;gap:6px;">'+
    '<div style="width:90px;height:12px;background:rgba(0,0,0,.55);border:1px solid #fff;border-radius:6px;overflow:hidden;">'+
    '<div id="mgBar'+i+'" style="height:100%;width:0%;background:#ffd23f;"></div></div>'+
    '<div id="mgBarT'+i+'" style="color:#fff;font-size:12px;text-shadow:0 1px 4px #000;">0%</div></div>';
  mgSetHtml('mgExtra',bh+'</div>');
  const barEls=[],barTEs=[];
  for(let i=0;i<4;i++){ barEls.push(document.getElementById('mgBar'+i)); barTEs.push(document.getElementById('mgBarT'+i)); }
  // drag to rotate, swipe up to finish
  const cv=MG.canvas; let drag=null, burnT=0;
  const pd=function(e){ drag={x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY}; if(e.preventDefault)e.preventDefault(); };
  const pm=function(e){ if(!drag) return; const dx=e.clientX-drag.x; drag.x=e.clientX; drag.y=e.clientY; logic.rotate(dx*0.022); };
  const pu=function(e){ if(!drag) return;
    const dy=e.clientY-drag.y0, dx=e.clientX-drag.x0, H=window.innerHeight; drag=null;
    if(dy<0&&-dy>H*0.28&&-dy>Math.abs(dx)*1.2){ if(typeof sClick==='function')sClick(); const r=logic.finish();
      mgEnd(r.won?{won:true,reward:r.tip}:{won:false,msg:'Tip $'+r.tip+' — keep every side near 75% golden-brown!'}); } };
  const pc=function(){ drag=null; };
  cv.addEventListener('pointerdown',pd); cv.addEventListener('pointermove',pm);
  cv.addEventListener('pointerup',pu); cv.addEventListener('pointercancel',pc);
  return {
    logic:logic,scene:scene,camera:camera,
    hint:'Drag ↔ to spin the mallow • swipe UP to pull it off — tip starts at $100!',
    frame:function(dt,now){
      logic.update(dt);
      skewer.rotation.x=logic.angle;
      for(let i=0;i<4;i++){ const c=mallowColor(logic.sides[i]); sideMats[i].color.setRGB(c[0],c[1],c[2]);
        if(barEls[i]){ const d=logic.sides[i];
          barEls[i].style.width=d+'%';
          barEls[i].style.background=d>=100?'#ff4400':(Math.abs(d-75)<8?'#7ddf6a':'#ffd23f'); }
        if(barTEs[i]) barTEs[i].textContent=Math.round(logic.sides[i])+'%'; }
      const fl=0.85+0.22*Math.sin(now*13)+0.1*Math.sin(now*29+1.7);
      flame.scale.set(fl,fl,fl); flame2.scale.set(2-fl,2-fl,2-fl);
      fireLight.intensity=2.2+0.7*Math.sin(now*13);
      if(logic.burned){ burnFlame.visible=true; const bs=1+0.2*Math.sin(now*31); burnFlame.scale.set(bs,bs,bs);
        burnT+=dt; if(burnT>1.6) mgEnd({won:false,msg:'🔥 Burnt to a crisp!'}); }
    },
    dispose:function(){ if(cv.removeEventListener){ cv.removeEventListener('pointerdown',pd); cv.removeEventListener('pointermove',pm); cv.removeEventListener('pointerup',pu); cv.removeEventListener('pointercancel',pc); } }
  };
}

/* ---------------- renderer: horseshoes ---------------- */
function buildShoes(){
  const logic=new ShoesLogic();
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x87b5d6);
  const camera=new THREE.PerspectiveCamera(55,window.innerWidth/Math.max(1,window.innerHeight),0.1,100);
  camera.position.set(0,2.7,4.8); camera.lookAt(0,0.5,-6);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a7a5a,0.9));
  const sun=new THREE.DirectionalLight(0xfff2d9,0.9); sun.position.set(4,8,2); scene.add(sun);
  scene.add(mgBox(34,1,34,0xd9b77c,0,-0.5,-2));
  scene.add(mgBox(5,0.24,5,0xc9a25e,0,0.02,-6));
  scene.add(mgBox(0.18,1.5,0.18,0x6f777f,0,0.85,-6));
  scene.add(mgBox(0.5,0.12,0.5,0x54595f,0,0.06,-6));
  const ring=new THREE.Mesh(new THREE.RingGeometry(SHOE_RING_R-0.07,SHOE_RING_R+0.07,40),
    new THREE.MeshBasicMaterial({color:0xffffff}));
  ring.rotation.x=-Math.PI/2; ring.position.set(0,0.16,-6); scene.add(ring);
  const shoe=new THREE.Mesh(new THREE.TorusGeometry(0.32,0.09,8,20,Math.PI*1.5),
    new THREE.MeshLambertMaterial({color:0x3a3f45}));
  const HOME={x:0,y:1.1,z:2.8};
  shoe.position.set(HOME.x,HOME.y,HOME.z); shoe.rotation.x=-Math.PI/2; scene.add(shoe);
  mgSetHtml('mgExtra',
   '<div style="position:absolute;bottom:86px;left:0;right:0;display:flex;flex-direction:column;gap:12px;align-items:center;pointer-events:none;">'+
   '<div id="mgDialWrap" style="display:flex;gap:18px;align-items:center;">'+
   '<div id="mgDialH" style="position:relative;width:min(58vw,300px);height:36px;background:rgba(0,0,0,.55);border:3px solid #ffd23f;border-radius:10px;touch-action:none;pointer-events:auto;">'+
     '<div style="position:absolute;left:50%;top:0;bottom:0;width:4px;margin-left:-2px;background:#ffd23f;"></div>'+
     '<div id="mgDialHMark" style="position:absolute;top:3px;bottom:3px;width:12px;margin-left:-6px;background:#ff5a3c;border-radius:6px;left:50%;"></div></div>'+
   '<div id="mgDialV" style="position:relative;width:36px;height:110px;background:rgba(0,0,0,.55);border:3px solid #888;border-radius:10px;touch-action:none;pointer-events:auto;">'+
     '<div style="position:absolute;top:50%;left:0;right:0;height:4px;margin-top:-2px;background:#888;"></div>'+
     '<div id="mgDialVMark" style="position:absolute;left:3px;right:3px;height:12px;margin-top:-6px;background:#ff5a3c;border-radius:6px;top:50%;"></div></div>'+
   '</div>'+
   '<div id="mgShoeMsg" style="color:#fff;font-size:20px;font-weight:800;text-shadow:0 2px 8px #000;min-height:28px;"></div>'+
   '</div>');
  const hMark=document.getElementById('mgDialHMark'), vMark=document.getElementById('mgDialVMark'),
        dialH=document.getElementById('mgDialH'), dialV=document.getElementById('mgDialV'),
        dialWrap=document.getElementById('mgDialWrap'), msg=document.getElementById('mgShoeMsg'),
        stat=mgEl('mgStat');
  const tapH=function(e){ if(logic.phase==='dialH'){ if(typeof sClick==='function')sClick(); logic.tap(); } if(e&&e.preventDefault)e.preventDefault(); };
  const tapV=function(e){ if(logic.phase==='dialV'){ if(typeof sClick==='function')sClick(); logic.tap(); } if(e&&e.preventDefault)e.preventDefault(); };
  if(dialH) dialH.addEventListener('pointerdown',tapH);
  if(dialV) dialV.addEventListener('pointerdown',tapV);
  let anim='dials', flyT=0, waitT=0;
  const refreshStat=function(){ if(stat) stat.textContent='Try '+(logic.tries+1)+'/3 • '+logic.points+' pts'; };
  refreshStat();
  return {
    logic:logic,scene:scene,camera:camera,
    hint:'Tap the sweeping dial to stop it dead-center — horizontal first, then vertical',
    frame:function(dt,now){
      logic.update(dt);
      if(anim==='dials'){
        if(dialWrap) dialWrap.style.display='flex';
        if(hMark) hMark.style.left=((logic.phase==='dialH'?logic.pos:logic.hErr)+1)/2*100+'%';
        if(vMark) vMark.style.top=((logic.phase==='dialV'?logic.pos:logic.vErr)+1)/2*100+'%';
        if(dialH) dialH.style.borderColor=logic.phase==='dialH'?'#ffd23f':'#888';
        if(dialV) dialV.style.borderColor=logic.phase==='dialV'?'#ffd23f':'#888';
        if(logic.phase==='flying'){ anim='flying'; flyT=0; }
      } else if(anim==='flying'){
        if(dialWrap) dialWrap.style.display='none';
        flyT+=dt; const T=0.95, t=Math.min(1,flyT/T), lp=logic.landPos();
        shoe.position.set(mgLerp(HOME.x,lp.x,t), HOME.y+Math.sin(t*Math.PI)*2.8-t*(HOME.y-0.25), mgLerp(HOME.z,-6+lp.z,t));
        shoe.rotation.z+=9*dt;
        if(t>=1){ const res=logic.resolve(); refreshStat();
          if(msg){ msg.textContent=res.hit?'🎯 RINGER! +1':(res.d<1.5?'So close!':'Miss'); msg.style.color=res.hit?'#7ddf6a':'#fff'; }
          anim='result'; waitT=0; }
      } else if(anim==='result'){
        waitT+=dt;
        if(waitT>1.3){
          if(msg) msg.textContent='';
          if(logic.phase==='done') mgEnd(logic.won?{won:true}:{won:false,msg:'Horseshoes: '+logic.points+'/3 — need all 3 for the win!'});
          else { shoe.position.set(HOME.x,HOME.y,HOME.z); shoe.rotation.z=0; anim='dials'; }
        }
      }
    },
    dispose:function(){}
  };
}

/* ---------------- renderer: trailer backup ---------------- */
function buildTrailerGame(){
  const logic=new TrailerLogic();
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x9fc7e8);
  const camera=new THREE.PerspectiveCamera(60,window.innerWidth/Math.max(1,window.innerHeight),0.1,120);
  scene.add(new THREE.HemisphereLight(0xcfe8ff,0x3f6b34,0.95));
  const sun=new THREE.DirectionalLight(0xfff2d9,0.8); sun.position.set(5,9,4); scene.add(sun);
  scene.add(mgBox(60,1,60,0x4a7c3f,0,-0.5,4));
  scene.add(mgBox(7,0.08,34,0xb9a06a,0,0.04,4));
  // truck (faces -z; hitch at +z rear)
  const truck=new THREE.Group(); scene.add(truck);
  truck.add(mgBox(1.8,1.0,1.6,0xc23b2e,0,0.95,-1.1));
  truck.add(mgBox(1.62,0.55,0.12,0xbfe3f2,0,1.1,-1.92));
  truck.add(mgBox(1.8,0.72,2.3,0x6e7278,0,0.7,0.95));
  const wg=new THREE.BoxGeometry(0.34,0.64,0.64), wm=new THREE.MeshLambertMaterial({color:0x1e1e22});
  [[-0.95,-1.1],[0.95,-1.1],[-0.95,0.95],[0.95,0.95]].forEach(function(p){
    const w=new THREE.Mesh(wg,wm); w.position.set(p[0],0.32,p[1]); truck.add(w); });
  const hitchBall=mgBox(0.22,0.22,0.22,0xffd23f,0,0.62,TRAILER_HITCH_L,0xffd23f); truck.add(hitchBall);
  // camper trailer: coupler at origin, tongue pointing +z toward the incoming truck
  const trailer=new THREE.Group(); scene.add(trailer);
  trailer.add(mgBox(2.2,1.7,3.6,0xf2ede2,0,1.35,-2.8));
  trailer.add(mgBox(2.24,0.3,3.64,0x2e6f8e,0,2.05,-2.8));
  trailer.add(mgBox(0.16,0.16,2.2,0x8a8f96,0,0.6,-0.9));
  const coupler=mgBox(0.36,0.3,0.36,0xff8c1a,0,0.6,0,0xff8c1a); trailer.add(coupler);
  [[-1.0,-3.6],[1.0,-3.6]].forEach(function(p){
    const w=new THREE.Mesh(wg,wm); w.position.set(p[0],0.32,p[1]); trailer.add(w); });
  for(let i=0;i<5;i++){ scene.add(mgBox(0.4,0.7,0.4,0xff6a1a,-3.2,0.35,-2+i*4));
    scene.add(mgBox(0.4,0.7,0.4,0xff6a1a,3.2,0.35,-2+i*4)); }
  mgEl('mgMirror').style.display='block';
  const ab='font-size:26px;background:rgba(10,20,10,.62);color:#fff;border:2px solid #d8f3c0;border-radius:16px;touch-action:none;';
  mgSetHtml('mgExtra',
   '<div style="position:absolute;bottom:64px;left:0;right:0;display:flex;justify-content:center;pointer-events:none;">'+
   '<div style="display:grid;grid-template-columns:repeat(3,68px);grid-auto-rows:64px;gap:10px;pointer-events:auto;">'+
   '<div></div><button id="mgUp" style="'+ab+'">▲</button><div></div>'+
   '<button id="mgLeft" style="'+ab+'">◀</button><button id="mgDown" style="'+ab+'">▼</button><button id="mgRight" style="'+ab+'">▶</button>'+
   '</div></div>');
  const setInput=function(k,v){ logic.in[k]=v; };
  const wire=function(id,k){ const b=document.getElementById(id); if(!b) return;
    b.addEventListener('pointerdown',function(e){ setInput(k,true); if(e.preventDefault)e.preventDefault(); });
    const off=function(){ setInput(k,false); };
    b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('pointerleave',off); };
  wire('mgUp','up'); wire('mgDown','down'); wire('mgLeft','left'); wire('mgRight','right');
  const stat=mgEl('mgStat');
  return {
    logic:logic,scene:scene,camera:camera,setInput:setInput,trailer:trailer,
    hint:'▲ back up • ▼ pull forward • ◀ ▶ steer — touch the hitches before time runs out!',
    frame:function(dt,now){
      logic.update(dt);
      const t=logic.truck;
      truck.position.set(t.x,0,t.z); truck.rotation.y=t.heading;
      const s=1+0.18*Math.sin(now*7); coupler.scale.set(s,1,1);
      hitchBall.material.emissiveIntensity=0.6+0.4*Math.sin(now*7);
      // over-the-cab mirror view: bed/tailgate at the bottom of frame, trailer ahead
      camera.position.set(t.x*0.55,3.4,t.z+2.4);
      camera.lookAt(t.x*0.7,0.3,t.z-6);
      if(stat) stat.textContent='⏱ '+Math.max(0,logic.time).toFixed(1)+'s';
      if(logic.over) mgEnd(logic.won?{won:true}:{won:false,msg:'⏱ Time! Line up the hitches and try again.'});
    },
    dispose:function(){ mgEl('mgMirror').style.display='none'; }
  };
}
