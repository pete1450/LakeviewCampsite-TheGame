'use strict';
/* Headless tests for the camper-help minigame LOGIC classes (no THREE/DOM). */
require('./harness.js');
let n=0;
function assert(c,msg){ n++; if(!c){ console.error('FAIL:',msg); process.exit(1); } }
function eq(a,b,msg){ assert(a===b, msg+' (got '+a+', want '+b+')'); }
function approx(a,b,e,msg){ assert(Math.abs(a-b)<=e, msg+' (got '+a+', want ~'+b+')'); }

// ---------- #1 marshmallow ----------
{
  const m=new MallowLogic();
  eq(m.downSide(),1,'angle 0 cooks side 1 (the -y face)');
  m.update(1);
  approx(m.sides[1],MALLOW_COOK_RATE,1e-9,'bottom side cooks at the cook rate');
  eq(m.sides[0]+m.sides[2]+m.sides[3],0,'other sides stay raw');
  m.rotate(Math.PI); eq(m.downSide(),0,'angle PI cooks side 0');
  m.update(1); approx(m.sides[0],MALLOW_COOK_RATE,1e-9,'side 0 cooks after half-turn');
  m.rotate(-Math.PI/2); eq(m.downSide(),2,'angle PI/2 cooks side 2');
  m.rotate(Math.PI); eq(m.downSide(),3,'angle -PI/2 cooks side 3');
  // color ramp: white -> golden-brown at 75 -> near-black at 100
  const c0=mallowColor(0); eq(c0[0],1,'raw is white (r)'); eq(c0[2],1,'raw is white (b)');
  const c75=mallowColor(75);
  assert(c75[0]>0.7&&c75[0]<0.9&&c75[1]>0.4&&c75[1]<0.6&&c75[2]<0.3,'75% is golden-brown ('+c75.map(v=>v.toFixed(2))+')');
  const c100=mallowColor(100);
  assert(c100[0]<0.15&&c100[1]<0.15&&c100[2]<0.15,'100% is near-black');
  // perfect play: each side to exactly 75%
  const m2=new MallowLogic();
  const spin={1:0,0:Math.PI,2:Math.PI/2,3:-Math.PI/2};
  for(const side of [1,0,2,3]){
    m2.angle=spin[side];
    let guard=0; while(m2.sides[side]<75&&guard++<2000) m2.update(0.01);
  }
  const r2=m2.finish();
  eq(r2.won,true,'all sides at 75% wins'); eq(r2.tip,100,'perfect roast tips $100');
  // tip curve: $100 minus 2x each side's distance from 75%
  const m3=new MallowLogic(); m3.sides=[75,75,75,60];
  eq(m3.finish().tip,70,'one side at 60% tips $70 (100-2*15)');
  const m4=new MallowLogic(); m4.sides=[70,70,70,70];
  const r4=m4.finish(); eq(r4.tip,60,'all sides at 70% tips $60'); eq(r4.won,true,'positive tip wins');
  const m5=new MallowLogic(); m5.sides=[40,40,40,40];
  const r5=m5.finish(); eq(r5.tip,0,'all sides at 40% tips $0 (clamped)'); eq(r5.won,false,'zero tip loses');
  // burn: a side hitting 100% bursts into flame = instant fail
  const m6=new MallowLogic(); m6.update(100);
  eq(m6.burned,true,'100% side burns'); eq(m6.over,true,'burn ends the game'); eq(m6.won,false,'burn loses');
  eq(m6.finish().burned,true,'finish reports the burn');
  // no cooking after game over
  const m7=new MallowLogic(); m7.finish(); m7.update(5);
  eq(m7.sides.join(','),'0,0,0,0','frozen after finish');
}

// ---------- #2 horseshoes ----------
{
  const h=new ShoesLogic();
  eq(h.phase,'dialH','starts on the horizontal dial');
  h.update(0.5); assert(h.pos!==0,'dial sweeps');
  for(let i=0;i<400;i++) h.update(0.05);
  assert(h.pos>=-1&&h.pos<=1,'dial ping-pongs inside [-1,1]');
  eq(h.dialSpeed(),2.55,'dial speed try 1');
  // perfect taps -> ringer
  const h2=new ShoesLogic();
  eq(h2.tap(),'dialV','first tap advances to vertical dial');
  eq(h2.tap(),'flying','second tap launches the shoe');
  eq(h2.tap(),null,'taps during flight do nothing');
  const r2=h2.resolve();
  eq(r2.hit,true,'dead-center both dials is a ringer'); eq(h2.points,1,'ringer scores');
  // total miss
  const h3=new ShoesLogic(); h3.pos=1; h3.tap(); h3.pos=-1; h3.tap();
  const r3=h3.resolve(); eq(r3.hit,false,'corner-corner misses'); eq(h3.points,0,'miss scores nothing');
  // landing offset scales with dial error
  const h3b=new ShoesLogic(); h3b.hErr=0.5; h3b.vErr=-0.25;
  const lp=h3b.landPos();
  approx(lp.x,0.5*SHOE_MAX_OFF,1e-9,'horizontal error maps to x offset');
  approx(lp.z,-0.25*SHOE_MAX_OFF,1e-9,'vertical error maps to z offset');
  // edge of the ring still counts
  const h3c=new ShoesLogic(); h3c.hErr=SHOE_RING_R/SHOE_MAX_OFF; h3c.vErr=0;
  eq(h3c.resolve().hit,true,'landing exactly on the ring edge counts');
  // full game: 3/3 wins, 2/3 loses
  const h4=new ShoesLogic();
  for(let i=0;i<3;i++){ h4.tap(); h4.tap(); h4.resolve(); }
  eq(h4.over,true,'game ends after 3 tries'); eq(h4.won,true,'3 ringers wins the game');
  eq(h4.dialSpeed(),1.5*(1.7+3*0.6),'dial speeds up each try');
  const h5=new ShoesLogic();
  h5.pos=1; h5.tap(); h5.pos=1; h5.tap(); h5.resolve(); // miss
  h5.tap(); h5.tap(); h5.resolve(); // ringer
  h5.tap(); h5.tap(); h5.resolve(); // ringer
  eq(h5.points,2,'two ringers = 2 points');
  eq(h5.won,false,'2/3 does not win');
}

// ---------- #3 trailer backup ----------
{
  const t=new TrailerLogic();
  eq(t.time,TRAILER_TIME,'15-second clock');
  const x0=t.truck.x, z0=t.truck.z;
  t.update(1); eq(t.truck.x,x0,'no drift without input'); eq(t.truck.z,z0,'no roll without input');
  // reverse heads toward the trailer (-z)
  const t2=new TrailerLogic(); t2.in.up=true; t2.update(1);
  assert(t2.truck.z<9.5,'holding up backs toward the trailer');
  // steering while reversing swings the hitch toward the steered side
  const t3=new TrailerLogic(); const hx0=t3.hitchPos().x;
  t3.in.up=true; t3.in.left=true; t3.update(1);
  assert(t3.hitchPos().x<hx0,'left steers the hitch left while reversing');
  const t3b=new TrailerLogic(); const hx0b=t3b.hitchPos().x;
  t3b.in.up=true; t3b.in.right=true; t3b.update(1);
  assert(t3b.hitchPos().x>hx0b,'right steers the hitch right while reversing');
  // forward gear recovers from an overshoot
  const t4=new TrailerLogic(); t4.in.down=true; t4.update(1);
  assert(t4.truck.z>9.5,'holding down pulls forward');
  // touching hitches wins
  const t5=new TrailerLogic(); t5.truck.x=0; t5.truck.z=-TRAILER_HITCH_L; t5.truck.heading=0;
  approx(t5.dist(),0,1e-9,'teleported hitch sits on the target');
  t5.update(0.01); eq(t5.over,true,'hitch touch ends the game'); eq(t5.won,true,'hitch touch wins');
  // running out the clock loses
  const t6=new TrailerLogic(); t6.time=0.05; t6.update(0.1);
  eq(t6.over,true,'timer expiry ends the game'); eq(t6.won,false,'timeout loses'); eq(t6.time,0,'clock clamps at 0');
  // a scripted straight reverse from an aligned start wins with time to spare
  const t7=new TrailerLogic(); t7.truck.x=0; t7.truck.z=6; t7.truck.heading=Math.PI;
  t7.in.up=true; let guard=0; while(!t7.over&&guard++<300) t7.update(0.1);
  eq(t7.won,true,'scripted straight reverse wins'); assert(t7.time>10,'with plenty of time left ('+t7.time.toFixed(1)+'s)');
  // steering while driving forward turns the nose screen-left on left
  const t8=new TrailerLogic(); const hd0=t8.truck.heading;
  t8.in.down=true; t8.in.left=true; t8.update(1);
  assert(t8.truck.heading>hd0,'forward+left turns the nose left');
}

console.log('minigames OK ('+n+' asserts)');
