'use strict';
const L = require('./logic.js');
let n=0;
function assert(c,msg){ n++; if(!c){ console.error('FAIL:',msg); process.exit(1); } }
function eq(a,b,msg){ assert(a===b, msg+' (got '+a+', want '+b+')'); }
// force a footprint to plain grass (test helper — placement rules still apply)
function flatten(s,x,y,w,h){
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
    const k=L.idx(x+dx,y+dy);
    s.terrain[k]=L.T_GRASS; s.road[k]=L.R_NONE; s.roadLocked[k]=0; s.tileStruct[k]=-1;
  }
  s.structures=s.structures.filter(st=>{
    for(let dy=0;dy<st.h;dy++)for(let dx=0;dx<st.w;dx++)
      if(st.x+dx>=x&&st.x+dx<x+w&&st.y+dy>=y&&st.y+dy<y+h) return false;
    return true;
  });
}

// ---------- map gen ----------
{
  const m = L.genMap(42);
  eq(m.terrain.length, 36*36, 'map size');
  eq(m.nLakes>=1&&m.nLakes<=3, true, '1-3 lakes');
  let water=0, trees=0;
  for(const t of m.terrain){ if(t===L.T_WATER)water++; if(t===L.T_TREE)trees++; }
  assert(water>20, 'lakes have water ('+water+')');
  assert(trees>50, 'trees scattered ('+trees+')');
  // entrance zone clear of water/trees
  for(let y=28;y<36;y++)for(let x=15;x<=21;x++){
    const t=m.terrain[L.idx(x,y)];
    assert(t===L.T_GRASS, 'entrance zone clear at '+x+','+y);
  }
  // deterministic
  const m2=L.genMap(42);
  assert(m.terrain.every((t,i)=>t===m2.terrain[i]), 'genMap deterministic');
}

// ---------- newGame / entrance road ----------
{
  const s=L.newGame(7);
  eq(s.money, L.START_MONEY, 'start money');
  for(let y=L.ENTRANCE_TOP;y<36;y++){
    const k=L.idx(L.ENTRANCE_X,y);
    eq(s.road[k], L.R_ASPHALT, 'entrance asphalt '+y);
    eq(s.roadLocked[k], 1, 'entrance locked '+y);
  }
}

// ---------- roads ----------
{
  const s=L.newGame(7);
  const m0=s.money;
  // find a clear grass tile adjacent to entrance road
  const r=L.buildRoad(s,17,33);
  assert(r.ok&&r.cost===15, 'dirt road built');
  eq(s.road[L.idx(17,33)], L.R_DIRT, 'road tile set');
  eq(s.money, m0-15, 'money deducted');
  const u1=L.buildRoad(s,17,33);
  assert(u1.ok&&u1.upgraded&&s.road[L.idx(17,33)]===L.R_GRAVEL, 'dirt->gravel $20');
  const u2=L.buildRoad(s,17,33);
  assert(u2.ok&&s.road[L.idx(17,33)]===L.R_ASPHALT, 'gravel->asphalt $35');
  const u3=L.buildRoad(s,17,33);
  assert(!u3.ok, 'asphalt->nothing fails');
  const lock=L.buildRoad(s,18,33);
  assert(!lock.ok&&/fixed/.test(lock.msg), 'entrance road locked');
  // road on water fails
  let wk=-1;
  for(let i=0;i<36*36;i++) if(s.terrain[i]===L.T_WATER){wk=i;break;}
  if(wk>=0){ const wr=L.buildRoad(s,wk%36,(wk/36)|0); assert(!wr.ok&&/water/.test(wr.msg),'no road on water'); }
  // road on tree fails
  let tk=-1;
  for(let i=0;i<36*36;i++) if(s.terrain[i]===L.T_TREE){tk=i;break;}
  if(tk>=0){ const tr=L.buildRoad(s,tk%36,(tk/36)|0); assert(!tr.ok&&/tree/i.test(tr.msg),'no road on tree'); }
}

// ---------- clear trees ----------
{
  const s=L.newGame(7);
  let tk=-1;
  for(let i=0;i<36*36;i++) if(s.terrain[i]===L.T_TREE){tk=i;break;}
  assert(tk>=0,'tree exists');
  const m0=s.money, x=tk%36, y=(tk/36)|0;
  const r=L.clearTree(s,x,y);
  assert(r.ok&&r.cost===25,'tree cleared $25');
  eq(s.terrain[tk],L.T_GRASS,'tree -> grass');
  eq(s.money,m0-25,'money -25');
  const r2=L.clearTree(s,x,y);
  assert(!r2.ok,'clearing grass fails');
}

// ---------- sites ----------
{
  const s=L.newGame(7);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  // site with no adjacent road fails
  flatten(s,5,5,1,1);
  const bad=L.placeSite(s,'tent',5,5);
  assert(!bad.ok&&/road access/.test(bad.msg),'site needs road access');
  // ok adjacent
  const m0=s.money;
  const ok=L.placeSite(s,'tent',16,32);
  assert(ok.ok&&ok.cost===120,'tent site placed $120');
  eq(s.money,m0-120,'money -120');
  const st=L.structById(s,ok.id);
  eq(st.price,25,'default price');
  eq(L.structAt(s,16,32),st.id,'tileStruct set');
  // occupied tile fails
  const dup=L.placeSite(s,'tent',16,32);
  assert(!dup.ok,'dup placement fails');
  // 2x2 popup
  const p=L.placeSite(s,'popup',16,30);
  assert(p.ok,'popup placed');
  const pst=L.structById(s,p.id);
  eq(pst.w,2,'popup w=2'); eq(pst.h,2,'popup h=2');
  // price adjust
  L.setSitePrice(s,ok.id,33);
  eq(L.structById(s,ok.id).price,35,'price rounds to 5s');
  L.setSitePrice(s,ok.id,999);
  eq(L.structById(s,ok.id).price,200,'price clamped');
  // upgrades
  const t=L.buyTable(s,ok.id);
  assert(t.ok&&L.structById(s,ok.id).table,'table bought');
  assert(!L.buyTable(s,ok.id).ok,'table twice fails');
  const f1=L.buyFirepit(s,ok.id);
  assert(f1.ok&&f1.tier===1&&f1.cost===25,'firepit tier1 $25');
  const f2=L.buyFirepit(s,ok.id);
  assert(f2.ok&&f2.tier===2&&f2.cost===70,'firepit tier2 $70');
  const f3=L.buyFirepit(s,ok.id);
  assert(f3.ok&&f3.tier===3&&f3.cost===160,'firepit tier3 $160');
  assert(!L.buyFirepit(s,ok.id).ok,'firepit tier4 fails');
}

// ---------- buildings / pool ----------
{
  const s=L.newGame(7);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32); L.buildRoad(s,17,31);
  flatten(s,15,30,2,2);
  const b=L.placeBuilding(s,'bathroom',15,30);
  assert(b.ok,'bathroom placed');
  flatten(s,5,5,3,2);
  const st=L.placeBuilding(s,'store',5,5);
  assert(!st.ok&&/road access/.test(st.msg),'store needs road access');
  flatten(s,19,31,2,2);
  const pl=L.placePool(s,19,31);
  assert(pl.ok,'pool placed');
  const ex=L.expandPool(s,pl.id);
  assert(ex.ok&&L.structById(s,pl.id).expanded,'pool expanded');
  assert(!L.expandPool(s,pl.id).ok,'pool expand twice fails');
}

// ---------- bulldoze ----------
{
  const s=L.newGame(7);
  L.buildRoad(s,17,33);
  const m0=s.money;
  const r=L.bulldoze(s,17,33);
  assert(r.ok&&r.refund===7,'dirt refund $7');
  eq(s.money,m0+7,'refund added');
  eq(s.road[L.idx(17,33)],L.R_NONE,'road gone');
  const lock=L.bulldoze(s,18,33);
  assert(!lock.ok,'entrance bulldoze fails');
  L.buildRoad(s,17,33);
  const ps=L.placeSite(s,'tent',16,33);
  const m1=s.money;
  const bs=L.bulldoze(s,16,33);
  assert(bs.ok&&bs.refund===60,'site refund 50% = $60');
  eq(s.money,m1+60,'site refund added');
  // occupied site protected
  L.buildRoad(s,17,32);
  const ps2=L.placeSite(s,'tent',16,32);
  const st=L.structById(s,ps2.id); st.guestId=999;
  assert(!L.bulldoze(s,16,32).ok,'occupied site protected');
}

// ---------- customers: spawn, choose, pay, depart ----------
{
  const s=L.newGame(1234);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'tent site for guest test');
  const g=L.forceSpawn(s,L.RIG_TENT);
  assert(g,'guest spawned');
  assert(g.rig===L.RIG_TENT,'rig tent');
  assert(g.budget>=20&&g.budget<=40,'tent budget range');
  assert(g.siteId>0,'guest chose the tent site');
  assert(g.path.length>1,'has a path');
  // drive until camped
  let guard=0;
  while(g.state==='arriving'&&guard++<600) L.tickSim(s,1/60);
  eq(g.state,'camped','guest camped');
  const st=L.structById(s,ps.id);
  eq(st.guestId,g.id,'site occupied');
  eq(g.price,25,'locked price');
  const m0=s.money, n0=g.nightsLeft;
  // midnight: charge
  L.midnight(s,[]);
  eq(s.money,m0+25,'nightly payment collected');
  eq(g.nightsLeft,n0-1,'one night consumed');
  eq(g.happiness>=1&&g.happiness<=5,true,'happiness in range');
  // run until departure
  guard=0;
  while(s.guests.includes(g)&&guard++<20000){
    if(s.dayT>=L.DAY_LEN-0.01){ /* let tickSim handle */ }
    L.tickSim(s,1/60);
    if(g.state==='camped'&&g.nightsLeft<=0) break;
  }
  // force final departure path completion
  guard=0;
  while(s.guests.includes(g)&&guard++<5000) L.tickSim(s,1/60);
  assert(!s.guests.includes(g),'guest left');
  eq(st.guestId,-1,'site vacant');
  assert(s.ratingN===1,'one rating recorded');
  assert(s.rating>=1&&s.rating<=5,'rating in range');
  assert(s.stats.visitors===1,'visitor counted');
}

// ---------- drive-through when no site fits ----------
{
  const s=L.newGame(555);
  const ev=[];
  const g=L.forceSpawn(s,L.RIG_RV);
  assert(g.siteId===-1,'no site -> drive-through');
  let guard=0;
  while(s.guests.includes(g)&&guard++<3000){
    const e=L.tickSim(s,1/60); ev.push(...e);
  }
  assert(ev.some(e=>e.t==='turnedAway'),'turnedAway event');
  eq(s.stats.turnedAway,1,'turnedAway counted');
  assert(!s.guests.includes(g),'drive-through guest gone');
}

// ---------- price filter: overpriced site rejected ----------
{
  const s=L.newGame(999);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  const ps=L.placeSite(s,'tent',16,32);
  L.setSitePrice(s,ps.id,200); // way over tent budget
  const g=L.forceSpawn(s,L.RIG_TENT);
  eq(g.siteId,-1,'overpriced site rejected');
}

// ---------- smaller rig fits larger site ----------
{
  const s=L.newGame(1000);
  L.buildRoad(s,17,32); L.buildRoad(s,17,33); // spur off the entrance road
  flatten(s,15,29,3,3);
  const ps=L.placeSite(s,'rv',15,29); // 3x3 at 15..17 x 29..31, road-adjacent at (17,32)
  assert(ps.ok,'rv site placed');
  L.setSitePrice(s,ps.id,20); // min tent budget — always affordable
  const g=L.forceSpawn(s,L.RIG_TENT);
  eq(g.siteId,ps.id,'tent rig fits rv site');
}

// ---------- store revenue ----------
{
  const s=L.newGame(2000);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32); L.buildRoad(s,17,31); L.buildRoad(s,19,31);
  flatten(s,16,32,1,1);
  L.placeSite(s,'tent',16,32);
  flatten(s,19,29,3,2);
  const bs=L.placeBuilding(s,'store',19,29); // 3x2 at 19..21,29..30 adjacent to road 19,31
  assert(bs.ok,'store placed');
  const g=L.forceSpawn(s,L.RIG_TENT);
  let guard=0;
  while(g.state==='arriving'&&guard++<600) L.tickSim(s,1/60);
  const m0=s.money;
  L.midnight(s,[]);
  assert(s.money>m0+25,'store revenue on top of site fee');
}

// ---------- day cycle ----------
{
  const s=newGame0(3000);
  function newGame0(seed){ return L.newGame(seed); }
  const d0=s.day;
  L.tickSim(s,L.DAY_LEN+1);
  eq(s.day,d0+1,'day advances after 45s');
}

// ---------- spawn interval scales with rating ----------
{
  const s=L.newGame(4000);
  s.rating=5;
  assert(L.spawnInterval(s)<L.spawnInterval(Object.assign({},s,{rating:1})),'higher rating -> faster spawns');
}

console.log('logic OK — '+n+' asserts');
