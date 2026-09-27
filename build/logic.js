'use strict';
/* ============================================================================
   CAMPGROUND TYCOON — pure game logic. No DOM, no THREE. Node-testable.
   Map, economy, placement rules, customer AI, day cycle.
   ========================================================================== */

const W = 36, H = 36;
const T_GRASS = 0, T_WATER = 1, T_TREE = 2;
const R_NONE = 0, R_DIRT = 1, R_GRAVEL = 2, R_ASPHALT = 3;
const RIG_TENT = 0, RIG_POPUP = 1, RIG_MEDIUM = 2, RIG_RV = 3;
const RIG_NAMES = ['tent campers', 'popup campers', 'medium trailer', 'big RV'];

const ENTRANCE_X = 18;          // entrance road column
const ENTRANCE_TOP = 31;        // northernmost entrance tile (y=31..35, south edge)

const DAY_PART = 45;            // daylight seconds per cycle at 1x (pacing unchanged)
const CYCLE_LEN = 60;           // full day/night cycle seconds at 1x
const START_MONEY = 1000;
const MAX_GUESTS = 20;
const VEH_SPEED = 0.6;           // tiles per second at 1x

const SITE_CLASSES = [
  { id:'tent',   name:'Tent site',   w:1, h:1, cost:120,  cap:0, defPrice:25 },
  {id:'popup',  name:'Popup site',  w:2, h:2, cost:300,  cap:1, defPrice:40 },
  {id:'medium', name:'Medium site', w:2, h:3, cost:600,  cap:2, defPrice:65 },
  {id:'rv',     name:'RV site',     w:3, h:3, cost:1000, cap:3, defPrice:95 },
];
const BUILD_DEFS = {
  bathroom:   { name:'Bathroom',   w:2, h:2, cost:550  },
  store:      { name:'Camp store', w:3, h:2, cost:1400 },
  playground: { name:'Playground', w:2, h:2, cost:750  },
};
const POOL_DEF = { name:'Pool', w:2, h:2, cost:900 };
// pool upgrade levels: footprint, cost to reach, effective radius
const POOL_LEVELS = [
  {w:2,h:2,cost:0,   r:5},
  {w:3,h:3,cost:700, r:7},
  {w:4,h:4,cost:1200,r:10},
];
function poolRadius(st){ const L=POOL_LEVELS[st.level|0]; return L?L.r:5; }
const COST = {
  roadDirt: 15, roadGravel: 20, roadAsphalt: 35,
  clearTree: 25, table: 120, firepit: [0, 25, 70, 160],
  lake: 30,
};
const BUDGETS = [[20,40],[35,60],[55,90],[80,140]]; // [min,max] per rig class
const ROAD_NAMES = ['','dirt','gravel','asphalt'];

/* ---------------- RNG ---------------- */
function makeRng(seed){
  let a = seed >>> 0;
  const r = function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  r.get = ()=>a>>>0;   // expose internal state for save/load
  r.set = v=>{ a = v>>>0; };
  return r;
}
const ri = (r,a,b)=>a+Math.floor(r()*(b-a+1));
const pick = (r,arr)=>arr[Math.floor(r()*arr.length)];

/* ---------------- day/night lighting (pure, node-testable) ---------------- */
// Cycle fractions: day 0..0.75, dusk 0.75..0.82, night 0.82..0.93, dawn 0.93..1.
// The day rolls over at f=1, right as morning fades in after night.
const F_DAY_END=0.75, F_DUSK_END=0.82, F_NIGHT_END=0.93;
const smooth01=t=>{ t=t<0?0:t>1?1:t; return t*t*(3-2*t); };
function lerpHex(a,b,t){
  const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  return (Math.round(ar+(br-ar)*t)<<16)|(Math.round(ag+(bg-ag)*t)<<8)|Math.round(ab+(bb-ab)*t);
}
function lightingFor(f){
  f=((f%1)+1)%1;
  let dayness, duskGlow=0;
  if(f<F_DAY_END) dayness=1;
  else if(f<F_DUSK_END){
    const t=smooth01((f-F_DAY_END)/(F_DUSK_END-F_DAY_END));
    dayness=1-t; duskGlow=Math.sin(Math.PI*(f-F_DAY_END)/(F_DUSK_END-F_DAY_END));
  }
  else if(f<F_NIGHT_END) dayness=0;
  else{
    const t=smooth01((f-F_NIGHT_END)/(1-F_NIGHT_END));
    dayness=t; duskGlow=Math.sin(Math.PI*(f-F_NIGHT_END)/(1-F_NIGHT_END));
  }
  const sunI=0.22+0.63*dayness;
  const hemiI=0.28+0.67*dayness;
  let sunColor=lerpHex(0x8fa8d8,0xfff2d8,dayness);
  sunColor=lerpHex(sunColor,0xff8a3a,duskGlow*0.55);   // warm horizon at dusk/dawn
  let sky=lerpHex(0x0c1330,0x87b5e0,dayness);
  sky=lerpHex(sky,0x4a2a55,duskGlow*0.3);
  return {dayness,sunI,sunColor,hemiI,sky,fog:sky};
}

/* ---------------- map ---------------- */
const idx = (x,y)=>y*W+x;
const inB = (x,y)=>x>=0&&y>=0&&x<W&&y<H;

function genMap(seed){
  const r = makeRng(seed);
  const terrain = new Uint8Array(W*H); // all grass
  const inEntranceZone = (x,y)=>x>=15&&x<=21&&y>=28; // keep clear for entrance
  // 1-3 lakes: irregular elliptical blobs
  const nLakes = ri(r,1,3);
  for(let L=0; L<nLakes; L++){
    const cx = 6 + r()*24, cy = 5 + r()*22;
    const rx = 3 + r()*4, ry = 2 + r()*3;
    const rot = r()*Math.PI, blobs = ri(r,2,3);
    for(let b=0;b<blobs;b++){
      const bx = cx + (r()-0.5)*rx, by = cy + (r()-0.5)*ry;
      const brx = rx*(0.5+r()*0.5), bry = ry*(0.5+r()*0.5);
      const cos=Math.cos(rot), sin=Math.sin(rot);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        if(inEntranceZone(x,y)) continue;
        const dx=x+0.5-bx, dy=y+0.5-by;
        const ex=(dx*cos+dy*sin)/brx, ey=(-dx*sin+dy*cos)/bry;
        if(ex*ex+ey*ey<=1) terrain[idx(x,y)] = T_WATER;
      }
    }
  }
  // trees: scattered clusters on grass, never in the entrance zone
  const nClusters = ri(r,10,16);
  for(let c=0;c<nClusters;c++){
    const cx = r()*W, cy = r()*H, cr = 2+r()*4, n = ri(r,6,20);
    for(let i=0;i<n;i++){
      const x = Math.floor(cx+(r()-0.5)*2*cr), y = Math.floor(cy+(r()-0.5)*2*cr);
      if(!inB(x,y)||inEntranceZone(x,y)) continue;
      const k=idx(x,y);
      if(terrain[k]===T_GRASS && r()<0.75) terrain[k]=T_TREE;
    }
  }
  // lone trees
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const k=idx(x,y);
    if(terrain[k]===T_GRASS && !inEntranceZone(x,y) && r()<0.03) terrain[k]=T_TREE;
  }
  return { terrain, seed, nLakes };
}

function newGame(seed){
  const map = genMap(seed);
  const s = {
    seed, money: START_MONEY, day: 1, dayT: 8/24*CYCLE_LEN, // start at 8am
    speed: 1,
    terrain: map.terrain,
    road: new Uint8Array(W*H),
    roadLocked: new Uint8Array(W*H),
    structures: [], nextStructId: 1,
    tileStruct: new Int16Array(W*H).fill(-1),
    guests: [], nextGuestId: 1,
    rating: 3.0, ratingN: 0,
    spawnT: 6,
    rng: makeRng(seed^0x9e3779b9),
    stats: { earned:0, spent:0, visitors:0, turnedAway:0 },
  };
  // permanent asphalt entrance road, south edge center, 5 tiles
  for(let y=ENTRANCE_TOP; y<H; y++){
    const k = idx(ENTRANCE_X,y);
    s.road[k]=R_ASPHALT; s.roadLocked[k]=1; s.terrain[k]=T_GRASS;
  }
  return s;
}

/* ---------------- queries ---------------- */
function tileAt(s,x,y){ return inB(x,y)?s.terrain[idx(x,y)]:-1; }
function roadAt(s,x,y){ return inB(x,y)?s.road[idx(x,y)]:R_NONE; }
function structAt(s,x,y){ return inB(x,y)?s.tileStruct[idx(x,y)]:-1; }
function structById(s,id){ return s.structures.find(st=>st.id===id); }

function footprintClear(s,x,y,w,h){
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
    const tx=x+dx, ty=y+dy;
    if(!inB(tx,ty)) return {ok:false, reason:'Out of bounds'};
    const k=idx(tx,ty);
    if(s.terrain[k]===T_WATER) return {ok:false, reason:"Can't build on water"};
    if(s.terrain[k]===T_TREE)  return {ok:false, reason:'Clear trees first ($25)'};
    if(s.road[k]!==R_NONE)     return {ok:false, reason:'Tile has a road'};
    if(s.tileStruct[k]>=0)     return {ok:false, reason:'Tile occupied'};
  }
  return {ok:true};
}
function adjacentToRoad(s,x,y,w,h){
  for(let dy=-1;dy<=h;dy++)for(let dx=-1;dx<=w;dx++){
    if(dx>=0&&dx<w&&dy>=0&&dy<h) continue; // footprint itself
    const tx=x+dx, ty=y+dy;
    if(inB(tx,ty)&&s.road[idx(tx,ty)]!==R_NONE) return true;
  }
  return false;
}
// orthogonal road tiles adjacent to a footprint
function adjRoadTiles(s,x,y,w,h){
  const out=[];
  const seen=new Set();
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
    for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const tx=x+dx+ox, ty=y+dy+oy;
      if(!inB(tx,ty)) continue;
      const k=idx(tx,ty);
      if(s.road[k]!==R_NONE && !seen.has(k)){ seen.add(k); out.push({x:tx,y:ty}); }
    }
  }
  return out;
}
// BFS over road tiles from the entrance; returns {visited:Uint8Array, parent:Int32Array}
function bfsRoads(s){
  const visited=new Uint8Array(W*H), parent=new Int32Array(W*H).fill(-1);
  const sk=idx(ENTRANCE_X,H-1);
  if(s.road[sk]===R_NONE) return {visited,parent};
  const q=[sk]; visited[sk]=1;
  while(q.length){
    const k=q.pop();
    const x=k%W, y=(k/W)|0;
    for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const tx=x+ox, ty=y+oy;
      if(!inB(tx,ty)) continue;
      const tk=idx(tx,ty);
      if(!visited[tk]&&s.road[tk]!==R_NONE){ visited[tk]=1; parent[tk]=k; q.push(tk); }
    }
  }
  return {visited,parent};
}
function bfsPath(s,parent,fromK,toK){
  const path=[]; let k=toK;
  while(k>=0&&k!==fromK){ path.push({x:k%W,y:(k/W)|0}); k=parent[k]; }
  if(k<0) return null;
  path.push({x:fromK%W,y:(fromK/W)|0});
  path.reverse();
  return path;
}
// distance from a footprint's center to the closest point of a structure footprint
function nearStruct(s,kind,x,y,w,h,radius){
  for(const st of s.structures){
    if(st.kind!==kind) continue;
    const r=typeof radius==='function'?radius(st):radius;
    const cx=Math.max(st.x,Math.min(x+w/2,st.x+st.w)), cy=Math.max(st.y,Math.min(y+h/2,st.y+st.h));
    const dx=cx-(x+w/2), dy=cy-(y+h/2);
    if(Math.hypot(dx,dy)<=r) return true;
  }
  return false;
}
const PLAY_R=10, BATH_R=8;
function poolNear(s,x,y,w,h){ return nearStruct(s,'pool',x,y,w,h,poolRadius); }
function playgroundNear(s,x,y,w,h){ return nearStruct(s,'playground',x,y,w,h,PLAY_R); }
function bathroomNear(s,x,y,w,h){ return nearStruct(s,'bathroom',x,y,w,h,BATH_R); }
function siteAppeal(s,st,rig){
  let a=1;
  if(st.table) a+=1;
  a+=st.firepit;               // tier 0..3
  if(poolNear(s,st.x,st.y,st.w,st.h)) a+=2;
  if(playgroundNear(s,st.x,st.y,st.w,st.h)&&rig<=RIG_POPUP) a+=1;
  if(bathroomNear(s,st.x,st.y,st.w,st.h)) a+=1;
  const adj=adjRoadTiles(s,st.x,st.y,st.w,st.h);
  if(adj.some(t=>s.road[idx(t.x,t.y)]===R_ASPHALT)) a+=1;
  return a;
}
function occupiedCount(s){ return s.guests.filter(g=>g.state==='camped').length; }

/* ---------------- build actions: each returns {ok, cost?, msg?} ---------------- */
function need(s,cost){ return s.money>=cost?null:{ok:false,msg:'Not enough money ($'+cost+')'}; }
function spend(s,cost){ s.money-=cost; s.stats.spent+=cost; }

function buildRoad(s,x,y){
  if(!inB(x,y)) return {ok:false,msg:'Out of bounds'};
  const k=idx(x,y), cur=s.road[k];
  if(cur===R_NONE){
    if(s.terrain[k]===T_WATER) return {ok:false,msg:"Can't build on water"};
    if(s.terrain[k]===T_TREE)  return {ok:false,msg:'Clear trees first ($25)'};
    if(s.tileStruct[k]>=0)     return {ok:false,msg:'Tile occupied'};
    const n=need(s,COST.roadDirt); if(n) return n;
    spend(s,COST.roadDirt); s.road[k]=R_DIRT;
    return {ok:true,cost:COST.roadDirt,msg:'Dirt road built'};
  }
  if(s.roadLocked[k]) return {ok:false,msg:'Entrance road is fixed'};
  if(cur===R_DIRT){
    const n=need(s,COST.roadGravel); if(n) return n;
    spend(s,COST.roadGravel); s.road[k]=R_GRAVEL;
    return {ok:true,cost:COST.roadGravel,upgraded:true,msg:'Upgraded to gravel'};
  }
  if(cur===R_GRAVEL){
    const n=need(s,COST.roadAsphalt); if(n) return n;
    spend(s,COST.roadAsphalt); s.road[k]=R_ASPHALT;
    return {ok:true,cost:COST.roadAsphalt,upgraded:true,msg:'Upgraded to asphalt'};
  }
  return {ok:false,msg:'Already asphalt'};
}
function clearTree(s,x,y){
  if(!inB(x,y)) return {ok:false,msg:'Out of bounds'};
  const k=idx(x,y);
  if(s.terrain[k]!==T_TREE) return {ok:false,msg:'No tree here'};
  const n=need(s,COST.clearTree); if(n) return n;
  spend(s,COST.clearTree); s.terrain[k]=T_GRASS;
  return {ok:true,cost:COST.clearTree,msg:'Tree cleared'};
}
function digLake(s,x,y){
  if(!inB(x,y)) return {ok:false,msg:'Out of bounds'};
  const k=idx(x,y);
  if(s.terrain[k]===T_WATER) return {ok:false,msg:'Already water'};
  if(s.terrain[k]===T_TREE)  return {ok:false,msg:'Clear trees first ($25)'};
  if(s.road[k]!==R_NONE)     return {ok:false,msg:'Tile has a road'};
  if(s.tileStruct[k]>=0)     return {ok:false,msg:'Tile occupied'};
  const n=need(s,COST.lake); if(n) return n;
  spend(s,COST.lake); s.terrain[k]=T_WATER;
  return {ok:true,cost:COST.lake,msg:'Lake dug'};
}
function addStruct(s,st){
  st.id=s.nextStructId++;
  for(let dy=0;dy<st.h;dy++)for(let dx=0;dx<st.w;dx++)
    s.tileStruct[idx(st.x+dx,st.y+dy)]=st.id;
  s.structures.push(st);
  return st;
}
function placeSite(s,clsId,x,y){
  const def=SITE_CLASSES.find(c=>c.id===clsId);
  if(!def) return {ok:false,msg:'Unknown site class'};
  const c=footprintClear(s,x,y,def.w,def.h); if(!c.ok) return c;
  if(!adjacentToRoad(s,x,y,def.w,def.h)) return {ok:false,msg:'Site needs road access'};
  const n=need(s,def.cost); if(n) return n;
  spend(s,def.cost);
  const st=addStruct(s,{kind:'site',cls:clsId,cap:def.cap,x,y,w:def.w,h:def.h,
    price:def.defPrice,table:false,firepit:0,guestId:-1,invested:def.cost});
  return {ok:true,cost:def.cost,id:st.id,msg:def.name+' placed'};
}
function placeBuilding(s,kind,x,y){
  const def=BUILD_DEFS[kind];
  if(!def) return {ok:false,msg:'Unknown building'};
  const c=footprintClear(s,x,y,def.w,def.h); if(!c.ok) return c;
  if(!adjacentToRoad(s,x,y,def.w,def.h)) return {ok:false,msg:'Needs road access'};
  const n=need(s,def.cost); if(n) return n;
  spend(s,def.cost);
  const st=addStruct(s,{kind,x,y,w:def.w,h:def.h,invested:def.cost});
  return {ok:true,cost:def.cost,id:st.id,msg:def.name+' built'};
}
function placePool(s,x,y){
  const c=footprintClear(s,x,y,POOL_DEF.w,POOL_DEF.h); if(!c.ok) return c;
  if(!adjacentToRoad(s,x,y,POOL_DEF.w,POOL_DEF.h)) return {ok:false,msg:'Pool needs road access'};
  const n=need(s,POOL_DEF.cost); if(n) return n;
  spend(s,POOL_DEF.cost);
  const st=addStruct(s,{kind:'pool',x,y,w:POOL_DEF.w,h:POOL_DEF.h,level:0,invested:POOL_DEF.cost});
  return {ok:true,cost:POOL_DEF.cost,id:st.id,msg:'Pool built'};
}
function expandPool(s,id){
  const st=structById(s,id);
  if(!st||st.kind!=='pool') return {ok:false,msg:'No pool here'};
  const lv=st.level|0;
  if(lv>=POOL_LEVELS.length-1) return {ok:false,msg:'Pool fully expanded'};
  const nw=POOL_LEVELS[lv+1].w, nh=POOL_LEVELS[lv+1].h;
  // try growing in each direction: the new footprint adds one column and one
  // row, so try right/bottom, left/bottom, right/top, left/top in turn
  for(const d of [{dx:0,dy:0},{dx:-1,dy:0},{dx:0,dy:-1},{dx:-1,dy:-1}]){
    const nx=st.x+d.dx, ny=st.y+d.dy;
    let clear=true;
    for(let ty=ny;ty<ny+nh&&clear;ty++)for(let tx=nx;tx<nx+nw&&clear;tx++){
      if(tx>=st.x&&tx<st.x+st.w&&ty>=st.y&&ty<st.y+st.h) continue; // already ours
      if(!inB(tx,ty)){ clear=false; break; }
      const k=idx(tx,ty);
      if(s.terrain[k]!==T_GRASS||s.road[k]!==R_NONE||s.tileStruct[k]>=0) clear=false;
    }
    if(!clear) continue;
    const cost=POOL_LEVELS[lv+1].cost;
    const n=need(s,cost); if(n) return n;
    spend(s,cost);
    st.invested+=cost; st.level=lv+1; st.x=nx; st.y=ny; st.w=nw; st.h=nh;
    for(let ty=ny;ty<ny+nh;ty++)for(let tx=nx;tx<nx+nw;tx++)
      s.tileStruct[idx(tx,ty)]=st.id;
    return {ok:true,cost,msg:lv===0?'Pool expanded':'Pool fully expanded'};
  }
  return {ok:false,msg:'No room to expand'};
}
/* ---------------- fishing dock ---------------- */
const DOCK_DEF={name:'Fishing dock',w:2,h:2,cost:1000};
// dock upgrade levels: cost to reach, effective radius
const DOCK_LEVELS=[
  {cost:0,   r:7},
  {cost:1500,r:9},
  {cost:2000,r:11},
];
function dockRadius(st){ const L=DOCK_LEVELS[st.level|0]; return L?L.r:7; }
function tileAdjRoad(s,x,y){
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
    const tx=x+dx, ty=y+dy;
    return inB(tx,ty)&&s.road[idx(tx,ty)]!==R_NONE;
  });
}
function dockSpotOk(s,x,y){
  const w=DOCK_DEF.w, h=DOCK_DEF.h;
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
    const tx=x+dx, ty=y+dy;
    if(!inB(tx,ty)) return {ok:false,msg:'Out of bounds'};
    const k=idx(tx,ty);
    if(s.terrain[k]!==T_WATER) return {ok:false,msg:'Dock must go on water'};
    if(s.tileStruct[k]>=0) return {ok:false,msg:'Tile occupied'};
  }
  // needs neighboring land (grass) that touches a road
  for(let dy=-1;dy<=h;dy++)for(let dx=-1;dx<=w;dx++){
    if(dx>=0&&dx<w&&dy>=0&&dy<h) continue;
    const tx=x+dx, ty=y+dy;
    if(!inB(tx,ty)) continue;
    const k=idx(tx,ty);
    if(s.terrain[k]===T_GRASS&&s.road[k]===R_NONE&&tileAdjRoad(s,tx,ty))
      return {ok:true};
  }
  return {ok:false,msg:'Dock needs land with road access nearby'};
}
function placeDock(s,x,y){
  const c=dockSpotOk(s,x,y); if(!c.ok) return c;
  const n=need(s,DOCK_DEF.cost); if(n) return n;
  spend(s,DOCK_DEF.cost);
  const st=addStruct(s,{kind:'dock',x,y,w:DOCK_DEF.w,h:DOCK_DEF.h,level:0,invested:DOCK_DEF.cost});
  return {ok:true,cost:DOCK_DEF.cost,id:st.id,msg:'Fishing dock built'};
}
function upgradeDock(s,id){
  const st=structById(s,id);
  if(!st||st.kind!=='dock') return {ok:false,msg:'No dock here'};
  const lv=st.level|0;
  if(lv>=DOCK_LEVELS.length-1) return {ok:false,msg:'Dock fully upgraded'};
  const cost=DOCK_LEVELS[lv+1].cost;
  const n=need(s,cost); if(n) return n;
  spend(s,cost);
  st.invested+=cost; st.level=lv+1;
  return {ok:true,cost,msg:lv===0?'Row boats added':'Jetskis added'};
}
function dockNear(s,x,y,w,h){ return nearStruct(s,'dock',x,y,w,h,dockRadius); }
function roadRefund(tier){  // half of cumulative build cost
  return tier===R_DIRT?7 : tier===R_GRAVEL?17 : 35;
}
function bulldoze(s,x,y){
  if(!inB(x,y)) return {ok:false,msg:'Out of bounds'};
  const k=idx(x,y);
  if(s.road[k]!==R_NONE){
    if(s.roadLocked[k]) return {ok:false,msg:'Entrance road is fixed'};
    const refund=roadRefund(s.road[k]);
    s.road[k]=R_NONE; s.money+=refund;
    return {ok:true,refund,msg:'Road bulldozed (+$'+refund+')'};
  }
  const id=s.tileStruct[k];
  if(id<0){
    if(s.terrain[k]===T_TREE) return {ok:false,msg:'Use the clear tool on trees'};
    if(s.terrain[k]===T_WATER){
      s.terrain[k]=T_GRASS; // fill a lake back in: free, no refund
      return {ok:true,refund:0,msg:'Lake filled'};
    }
    return {ok:false,msg:'Nothing to bulldoze'};
  }
  const st=structById(s,id);
  if(st.kind==='site'&&st.guestId>=0) return {ok:false,msg:'Site is occupied'};
  const refund=Math.floor(st.invested/2);
  for(let dy=0;dy<st.h;dy++)for(let dx=0;dx<st.w;dx++)
    s.tileStruct[idx(st.x+dx,st.y+dy)]=-1;
  s.structures=s.structures.filter(t=>t.id!==id);
  s.money+=refund;
  return {ok:true,refund,id,msg:'Bulldozed (+$'+refund+')'};
}
function setSitePrice(s,id,price){
  const st=structById(s,id);
  if(!st||st.kind!=='site') return {ok:false,msg:'No site here'};
  st.price=Math.max(5,Math.min(200,Math.round(price/5)*5));
  return {ok:true,price:st.price};
}
function buyTable(s,id){
  const st=structById(s,id);
  if(!st||st.kind!=='site') return {ok:false,msg:'No site here'};
  if(st.table) return {ok:false,msg:'Already has a table'};
  const n=need(s,COST.table); if(n) return n;
  spend(s,COST.table); st.table=true; st.invested+=COST.table;
  return {ok:true,cost:COST.table,msg:'Picnic table added'};
}
function buyFirepit(s,id){
  const st=structById(s,id);
  if(!st||st.kind!=='site') return {ok:false,msg:'No site here'};
  if(st.firepit>=3) return {ok:false,msg:'Firepit is already fancy stone'};
  const cost=COST.firepit[st.firepit+1];
  const n=need(s,cost); if(n) return n;
  spend(s,cost); st.firepit++; st.invested+=cost;
  return {ok:true,cost,tier:st.firepit,msg:['','Dirt firepit','Wheel-ring firepit','Stone firepit'][st.firepit]+' added'};
}

/* ---------------- customers ---------------- */
function rollRig(r){
  const v=r();
  if(v<0.40) return RIG_TENT;
  if(v<0.65) return RIG_POPUP;
  if(v<0.85) return RIG_MEDIUM;
  return RIG_RV;
}
function spawnInterval(s){ return Math.max(3.5, Math.min(16, 16 - s.rating*2.2)); }

function chooseSite(s,rig,budget,visited){
  let best=null, bestScore=-1, bestTarget=null;
  for(const st of s.structures){
    if(st.kind!=='site'||st.guestId>=0) continue;
    const def=SITE_CLASSES.find(c=>c.id===st.cls);
    if(def.cap<rig) continue;
    if(st.price>budget) continue;
    const adj=adjRoadTiles(s,st.x,st.y,st.w,st.h).filter(t=>visited[idx(t.x,t.y)]);
    if(!adj.length) continue;
    const score=siteAppeal(s,st,rig)*100 - st.price; // appeal first, then cheaper
    if(score>bestScore){ bestScore=score; best=st; bestTarget=adj[0]; }
  }
  return best?{site:best,target:bestTarget}:null;
}

function spawnGuest(s,rig,events){
  if(s.guests.length>=MAX_GUESTS) return null;
  const r=s.rng;
  if(rig===undefined||rig===null) rig=rollRig(r);
  const [bmin,bmax]=BUDGETS[rig];
  const budget=ri(r,bmin,bmax);
  const {visited,parent}=bfsRoads(s);
  const startK=idx(ENTRANCE_X,H-1);
  const choice=chooseSite(s,rig,budget,visited);
  const g={
    id:s.nextGuestId++, rig, budget,
    state:'arriving', path:[], seg:0, segT:0,
    siteId:-1, nightsLeft:0, nightsPlanned:0, nightsStayed:0, totalPaid:0,
    price:0, happiness:3, tip:0,
    px:ENTRANCE_X, py:H-1,
  };
  if(choice){
    const path=bfsPath(s,parent,startK,idx(choice.target.x,choice.target.y));
    g.path=path||[{x:ENTRANCE_X,y:H-1}];
    g.siteId=choice.site.id;
    g.px=choice.target.x; g.py=choice.target.y;
  }else{
    // drive-through: cruise to the end of the entrance road and leave
    g.path=[{x:ENTRANCE_X,y:H-1},{x:ENTRANCE_X,y:ENTRANCE_TOP}];
    g.siteId=-1;
  }
  s.guests.push(g);
  events.push({t:'spawn',rig});
  return g;
}
function forceSpawn(s,rig){ return spawnGuest(s,rig,[]); }

function arrive(s,g,events){
  if(g.siteId>=0){
    const st=structById(s,g.siteId);
    if(st&&st.guestId<0){
      st.guestId=g.id; g.state='camped';
      g.nightsLeft=1+Math.floor(s.rng()*4);
      g.nightsPlanned=g.nightsLeft; g.nightsStayed=0; g.totalPaid=0;
      g.price=st.price; g.px=g.px; g.py=g.py;
      s.stats.visitors++;
      events.push({t:'arrive',guestId:g.id,siteId:st.id,nights:g.nightsLeft});
      return;
    }
    // site got taken / bulldozed while en route: try to re-pick
    const {visited}=bfsRoads(s);
    const choice=chooseSite(s,g.rig,g.budget,visited);
    if(choice){
      const {parent}=bfsRoads(s);
      const startK=idx(Math.round(g.px),Math.round(g.py));
      g.path=bfsPath(s,parent,startK,idx(choice.target.x,choice.target.y))||[];
      g.seg=0; g.segT=0; g.siteId=choice.site.id;
      g.px=choice.target.x; g.py=choice.target.y;
      return;
    }
  }
  // no site: sad drive-through
  s.stats.turnedAway++;
  const {visited:tv}=bfsRoads(s);
  const reason=turnawayReason(s,g.rig,g.budget,tv);
  events.push({t:'turnedAway',rig:g.rig,budget:g.budget,reason});
  g.state='departing';
  g.path=g.path.slice(0,g.seg+1).reverse();
  g.seg=0; g.segT=0;
}
function happinessParts(s,g){
  const st=structById(s,g.siteId);
  const p={base:2,table:0,firepit:0,pool:0,playground:0,dock:0};
  if(st){
    if(st.table)p.table=1; p.firepit=st.firepit;
    if(poolNear(s,st.x,st.y,st.w,st.h)) p.pool=1;
    if(playgroundNear(s,st.x,st.y,st.w,st.h)&&g.rig<=RIG_POPUP) p.playground=1;
    if(dockNear(s,st.x,st.y,st.w,st.h)) p.dock=1;
  }
  p.final=Math.max(1,Math.min(5,p.base+p.table+p.firepit+p.pool+p.playground+p.dock));
  return p;
}
function guestHappiness(s,g){ return happinessParts(s,g).final; }
// why a drive-through found no site (for the debug report)
function turnawayReason(s,rig,budget,visited){
  let vacant=0, fits=0, afford=0, reach=0;
  for(const st of s.structures){
    if(st.kind!=='site'||st.guestId>=0) continue;
    vacant++;
    const def=SITE_CLASSES.find(c=>c.id===st.cls);
    if(def.cap<rig) continue;
    fits++;
    if(st.price>budget) continue;
    afford++;
    if(adjRoadTiles(s,st.x,st.y,st.w,st.h).some(t=>visited[idx(t.x,t.y)])) reach++;
  }
  if(!vacant) return 'no vacant sites';
  if(!fits) return 'no vacant site fits this rig';
  if(!afford) return 'no fitting site within budget';
  if(!reach) return 'no affordable site reachable by road';
  return 'no eligible site';
}
function depart(s,g,events){
  const st=structById(s,g.siteId);
  const siteId=st?st.id:-1;
  if(st&&st.guestId===g.id) st.guestId=-1;
  const stars=Math.max(1,Math.min(5,Math.round(g.happiness)));
  const ratingBefore=s.rating;
  s.rating=(s.rating*s.ratingN+stars)/(s.ratingN+1);
  s.ratingN++;
  const tip=g.happiness>=4?(g.happiness-3)*15:0;
  if(tip>0){ s.money+=tip; s.stats.earned+=tip; }
  g.tip=tip;
  g.state='departing';
  const {parent}=bfsRoads(s);
  const startK=idx(Math.round(g.px),Math.round(g.py));
  g.path=bfsPath(s,parent,startK,idx(ENTRANCE_X,H-1))||[{x:ENTRANCE_X,y:H-1}];
  g.seg=0; g.segT=0;
  const def=st?SITE_CLASSES.find(c=>c.id===st.cls):null;
  events.push({t:'depart',guestId:g.id,siteId,stars,tip,
    report:{
      rig:g.rig, budget:g.budget,
      siteCls:def?def.name:null, sitePrice:g.price,
      nightsPlanned:g.nightsPlanned, nightsStayed:g.nightsStayed, totalPaid:g.totalPaid,
      happy:happinessParts(s,g), stars, tip,
      ratingBefore, ratingAfter:s.rating,
    }});
}
function midnight(s,events){
  s.day++;
  events.push({t:'midnight',day:s.day});
  const camped=s.guests.filter(g=>g.state==='camped');
  for(const g of camped){
    s.money+=g.price; s.stats.earned+=g.price;
    g.totalPaid+=g.price; g.nightsStayed++;
    g.happiness=guestHappiness(s,g);
    g.nightsLeft--;
    events.push({t:'paid',guestId:g.id,amount:g.price,nightsLeft:g.nightsLeft});
    if(g.nightsLeft<=0) depart(s,g,events);
  }
  const stores=s.structures.filter(st=>st.kind==='store').length;
  if(stores>0&&camped.length>0){
    const rev=8*camped.length*stores;
    s.money+=rev; s.stats.earned+=rev;
    events.push({t:'storeRev',amount:rev});
  }
}

function tickSim(s,dt){
  const events=[];
  if(dt<=0) return events;
  s.dayT+=dt;
  // spawning
  s.spawnT-=dt;
  if(s.spawnT<=0){
    spawnGuest(s,undefined,events);
    s.spawnT=spawnInterval(s)*(0.7+s.rng()*0.6);
  }
  // vehicle movement
  const step=VEH_SPEED*dt;
  for(const g of s.guests){
    if(g.state!=='arriving'&&g.state!=='departing') continue;
    if(!g.path.length){
      if(g.state==='arriving') arrive(s,g,events);
      else { g.gone=true; events.push({t:'gone',guestId:g.id}); }
      continue;
    }
    g.segT+=step;
    while(g.segT>=1&&g.seg<g.path.length-1){ g.segT-=1; g.seg++; }
    const last=g.path[g.path.length-1];
    const cx=g.seg<g.path.length-1
      ? g.path[g.seg].x+(g.path[g.seg+1].x-g.path[g.seg].x)*g.segT
      : last.x;
    const cy=g.seg<g.path.length-1
      ? g.path[g.seg].y+(g.path[g.seg+1].y-g.path[g.seg].y)*g.segT
      : last.y;
    g.px=cx; g.py=cy;
    if(g.seg>=g.path.length-1){
      if(g.state==='arriving') arrive(s,g,events);
      else { g.gone=true; events.push({t:'gone',guestId:g.id}); }
    }
  }
  s.guests=s.guests.filter(g=>!g.gone);
  if(s.dayT>=CYCLE_LEN){ s.dayT-=CYCLE_LEN; midnight(s,events); }
  return events;
}

/* ---------------- persistence (pure JSON; game.js handles localStorage) ---------------- */
const SAVE_VERSION=1;
function saveState(s){
  return JSON.stringify({
    v:SAVE_VERSION, seed:s.seed, money:s.money, day:s.day, dayT:s.dayT, speed:s.speed,
    terrain:Array.from(s.terrain), road:Array.from(s.road), roadLocked:Array.from(s.roadLocked),
    structures:s.structures, guests:s.guests,
    nextStructId:s.nextStructId, nextGuestId:s.nextGuestId,
    rating:s.rating, ratingN:s.ratingN, spawnT:s.spawnT,
    rngState:s.rng.get(), stats:s.stats,
  });
}
function loadState(json){
  const d=JSON.parse(json);
  if(!d||d.v!==SAVE_VERSION||!Array.isArray(d.terrain)||d.terrain.length!==W*H)
    throw new Error('bad save');
  const s={
    seed:d.seed, money:d.money, day:d.day, dayT:d.dayT, speed:d.speed,
    terrain:Uint8Array.from(d.terrain), road:Uint8Array.from(d.road),
    roadLocked:Uint8Array.from(d.roadLocked),
    structures:d.structures, nextStructId:d.nextStructId,
    tileStruct:new Int16Array(W*H).fill(-1),
    guests:d.guests, nextGuestId:d.nextGuestId,
    rating:d.rating, ratingN:d.ratingN, spawnT:d.spawnT,
    rng:makeRng(0), stats:d.stats,
  };
  s.rng.set(d.rngState);
  for(const st of s.structures){
    // migrate pre-tier saves: expanded pools become level 1
    if(st.kind==='pool'&&st.level==null) st.level=st.expanded?1:0;
    if(st.kind==='dock'&&st.level==null) st.level=0;
    for(let dy=0;dy<st.h;dy++)for(let dx=0;dx<st.w;dx++)
      s.tileStruct[idx(st.x+dx,st.y+dy)]=st.id;
  }
  return s;
}

/* ---------------- exports (node) ---------------- */
if(typeof module!=='undefined'&&module.exports){
  module.exports={W,H,T_GRASS,T_WATER,T_TREE,R_NONE,R_DIRT,R_GRAVEL,R_ASPHALT,
    RIG_TENT,RIG_POPUP,RIG_MEDIUM,RIG_RV,RIG_NAMES,ENTRANCE_X,ENTRANCE_TOP,
    DAY_PART,CYCLE_LEN,START_MONEY,MAX_GUESTS,VEH_SPEED,SITE_CLASSES,BUILD_DEFS,POOL_DEF,
    COST,BUDGETS,makeRng,genMap,newGame,idx,inB,tileAt,roadAt,structAt,structById,
    footprintClear,adjacentToRoad,adjRoadTiles,bfsRoads,bfsPath,
    nearStruct,poolNear,playgroundNear,bathroomNear,dockNear,poolRadius,dockRadius,
    POOL_LEVELS,DOCK_DEF,DOCK_LEVELS,dockSpotOk,tileAdjRoad,
    siteAppeal,occupiedCount,buildRoad,clearTree,digLake,placeSite,placeBuilding,placePool,
    expandPool,placeDock,upgradeDock,bulldoze,setSitePrice,buyTable,buyFirepit,spawnInterval,chooseSite,
    spawnGuest,forceSpawn,arrive,depart,midnight,tickSim,lightingFor,saveState,loadState,
    happinessParts,turnawayReason,guestHappiness};
}
