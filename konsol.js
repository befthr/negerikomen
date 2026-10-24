/* playadalahmain — konsol mini game Negeri Komen (tanpa musik, cuma SFX).
   Dibuka lewat window.KONSOL.open(). 4 game: Adu Penalti, Tangkap Genteng, Pancing Ikan, Racik Bakso. */
(function(){
if(window.KONSOL)return;
const W=360,H=480;
const INK='#1C2520',KUNING='#F2C230',HIJAU='#2F6B4F',MERAH='#C4502F',KREM='#F4EFE3';
const css=`.kns{position:fixed;inset:0;z-index:200;background:rgba(10,14,12,.86);display:flex;align-items:center;justify-content:center;padding:12px;touch-action:none}
.kns-body{position:relative;width:min(400px,96vw);background:linear-gradient(160deg,#2F6B4F,#22503B);border:4px solid ${INK};border-radius:34px 34px 46px 46px;padding:16px 16px 22px;box-shadow:0 10px 0 ${INK},inset 0 3px 0 rgba(255,255,255,.18)}
.kns-top{display:flex;align-items:center;justify-content:space-between;margin:0 6px 10px;color:#fff;font-weight:800;font-family:inherit}
.kns-logo{font-size:17px;letter-spacing:.02em}.kns-logo b{color:${KUNING}}
.kns-led{width:10px;height:10px;border-radius:50%;background:#7CFF6B;box-shadow:0 0 8px #7CFF6B;display:inline-block;margin-right:6px}
.kns-x{width:34px;height:34px;border-radius:50%;border:3px solid ${INK};background:${KREM};font-weight:800;font-size:16px;cursor:pointer}
.kns-scr{background:#0E1512;border:4px solid ${INK};border-radius:16px;padding:6px;box-shadow:inset 0 0 0 3px #26332C}
.kns canvas{display:block;width:100%;height:auto;border-radius:10px;background:#9BC46A;touch-action:none}
.kns-pad{display:flex;justify-content:space-between;align-items:center;margin:14px 10px 0}
.kns-dpad{width:64px;height:64px;position:relative}.kns-dpad i{position:absolute;background:${INK};border-radius:5px}
.kns-dpad i:nth-child(1){left:22px;top:0;width:20px;height:64px}.kns-dpad i:nth-child(2){top:22px;left:0;height:20px;width:64px}
.kns-btns{display:flex;gap:12px}.kns-btns span{width:34px;height:34px;border-radius:50%;border:3px solid ${INK};display:inline-block}
.kns-btns span:nth-child(1){background:${KUNING}}.kns-btns span:nth-child(2){background:${MERAH};margin-top:-18px}
.kns-qa{position:absolute;left:50%;top:-14px;transform:translateX(-50%);background:${MERAH};color:#fff;font-weight:800;font-size:11px;padding:3px 10px;border-radius:999px;border:2px solid ${INK}}`;
let st,cv,ctx,dpr,raf=0,last=0,game=null,menuHot=-1,ac=null,root=null;
const lsGet=k=>{try{return +localStorage.getItem('kns_'+k)||0}catch(e){return 0}};
const lsSet=(k,v)=>{try{localStorage.setItem('kns_'+k,String(v))}catch(e){}};
// riwayat poin terakhir per game (5 terakhir, terbaru di depan)
const hGet=k=>{try{const v=JSON.parse(localStorage.getItem('kns_h_'+k)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}};
function catat(k,v){const h=hGet(k);h.unshift({v,at:Date.now()});try{localStorage.setItem('kns_h_'+k,JSON.stringify(h.slice(0,5)))}catch(e){};if(v>lsGet(k))lsSet(k,v)}
const lalu=t=>{const d=Math.round((Date.now()-t)/1000);return d<60?'barusan':d<3600?Math.round(d/60)+' mnt lalu':d<86400?Math.round(d/3600)+' jam lalu':Math.round(d/86400)+' hr lalu'};
// ---------- SFX (WebAudio, tanpa musik) ----------
function au(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume()}catch(e){}return ac}
function tone(f,d,type='square',v=.12,f2){const a=au();if(!a)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0008,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.02)}
function noise(d,v=.15,lp=1200){const a=au();if(!a)return;const n=Math.floor(a.sampleRate*d),b=a.createBuffer(1,n,a.sampleRate),c=b.getChannelData(0);for(let i=0;i<n;i++)c[i]=(Math.random()*2-1)*(1-i/n);const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();f.type='lowpass';f.frequency.value=lp;s.buffer=b;g.gain.value=v;s.connect(f);f.connect(g);g.connect(a.destination);s.start()}
const SFX={klik:()=>tone(880,.06,'square',.08),pop:()=>tone(500,.09,'sine',.14,1100),tendang:()=>{noise(.12,.25,900);tone(160,.12,'sine',.2,60)},gol:()=>{tone(660,.12,'square',.1);setTimeout(()=>tone(990,.2,'square',.1),110);noise(.6,.06,3000)},
  tepis:()=>{noise(.18,.2,600);tone(220,.18,'sawtooth',.08,110)},tangkap:()=>tone(720,.08,'triangle',.14,1200),emas:()=>{tone(1046,.08,'triangle',.12);setTimeout(()=>tone(1568,.14,'triangle',.12),70)},
  bom:()=>{noise(.4,.3,500);tone(90,.3,'sine',.25,40)},plung:()=>{tone(300,.15,'sine',.16,120);noise(.15,.06,1500)},strike:()=>tone(1200,.05,'square',.08),dapat:()=>{tone(880,.1,'triangle',.13);setTimeout(()=>tone(1320,.16,'triangle',.13),90)},
  lepas:()=>tone(330,.25,'sawtooth',.07,160),ting:()=>tone(1760,.12,'sine',.1),salah:()=>tone(150,.2,'square',.08,110),habis:()=>{tone(523,.15,'triangle',.1);setTimeout(()=>tone(392,.25,'triangle',.1),140)}};
// ---------- util gambar ----------
const rr=(x,y,w,h,r,f,s)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(f){ctx.fillStyle=f;ctx.fill()}if(s){ctx.strokeStyle=s;ctx.lineWidth=3;ctx.stroke()}};
const txt=(t,x,y,sz=20,c='#fff',al='center',wt=800,stroke=INK)=>{ctx.font=`${wt} ${sz}px Poppins,system-ui,sans-serif`;ctx.textAlign=al;ctx.textBaseline='middle';if(stroke){ctx.lineWidth=Math.max(3,sz/5);ctx.strokeStyle=stroke;ctx.lineJoin='round';ctx.strokeText(t,x,y)}ctx.fillStyle=c;ctx.fillText(t,x,y)};
const circ=(x,y,r,f,s,lw=3)=>{ctx.beginPath();ctx.arc(x,y,r,0,7);if(f){ctx.fillStyle=f;ctx.fill()}if(s){ctx.strokeStyle=s;ctx.lineWidth=lw;ctx.stroke()}};
const rnd=(a,b)=>a+Math.random()*(b-a);
function genteng(x,y,w,c='#C4402F'){ctx.save();ctx.translate(x,y);rr(-w/2,-w*.32,w,w*.64,4,c,INK);ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=2;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*w/3.2,-w*.3);ctx.lineTo(i*w/3.2,w*.3);ctx.stroke()}ctx.restore()}
// ---------- tombol di layar ----------
let BTN=[];const btn=(x,y,w,h,label,fn,col=KUNING,sz=17)=>{BTN.push({x,y,w,h,fn});rr(x,y,w,h,12,col,INK);txt(label,x+w/2,y+h/2+1,sz,col===KUNING||col===KREM||col==='#fff'?INK:'#fff','center',800,null)};
// ---------- MENU ----------
const GAMES=[{id:'penalti',n:'Adu Penalti',ic:'⚽',c:'#3E8FC9'},{id:'genteng',n:'Tangkap Genteng',ic:'🧱',c:MERAH},{id:'pancing',n:'Pancing Ikan',ic:'🎣',c:'#2E9C9A'},{id:'bakso',n:'Racik Bakso',ic:'🍜',c:'#E2A21B'}];
const Menu={draw(t){ctx.fillStyle='#22503B';ctx.fillRect(0,0,W,H);for(let i=0;i<12;i++){ctx.fillStyle='rgba(255,255,255,.04)';ctx.fillRect(0,i*44+(t*20%44),W,18)}
  ctx.font='800 26px Poppins,system-ui,sans-serif';{const a1=ctx.measureText('playadalah').width,a2=ctx.measureText('main').width,x0=W/2-(a1+a2)/2;txt('playadalah',x0,46,26,'#fff','left');txt('main',x0+a1,46,26,KUNING,'left')}txt('Pilih game-nya!',W/2,82,15,'#CFE8D8','center',700,null);
  GAMES.forEach((g,i)=>{const x=20+(i%2)*170,y=110+Math.floor(i/2)*170,hot=menuHot===i;BTN.push({x,y,w:150,h:150,fn:()=>start(g.id)});
    rr(x,y+(hot?2:0),150,150,20,g.c,INK);rr(x+8,y+8+(hot?2:0),134,96,14,'rgba(255,255,255,.18)');ctx.font='54px "Noto Color Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(g.ic,x+75,y+58+Math.sin(t*3+i)*3);
    txt(g.n,x+75,y+124,14,'#fff');const hs=lsGet(g.id),h=hGet(g.id);if(h.length)txt(`Terakhir ${h[0].v} · 🏆 ${hs}`,x+75,y+143,11,KUNING,'center',700,null)});
  txt('Tanpa musik · cuma suara kampung 😄',W/2,452,11,'#9CC2AE','center',600,null)}};
// ---------- 1. ADU PENALTI ----------
function Penalti(){const G={shot:0,gol:0,max:5,ph:'aim',t:0,ball:{x:W/2,y:400,r:12},tgt:null,kp:{x:W/2,dx:0},kpDir:0,msg:'',hs:'penalti',
  goal:{x:40,y:96,w:280,h:120}};
  G.tap=(x,y)=>{if(G.ph==='aim'&&y<G.goal.y+G.goal.h+30){G.tgt={x:Math.max(G.goal.x+14,Math.min(G.goal.x+G.goal.w-14,x)),y:Math.max(G.goal.y+14,Math.min(G.goal.y+G.goal.h-10,y))};
      // kiper nebak: kadang ke arah bola, kadang salah
      const zone=x<W/2-50?-1:x>W/2+50?1:0,smart=Math.random()<.42;G.kpDir=smart?zone:[-1,0,1][Math.floor(Math.random()*3)];G.ph='fly';G.t=0;SFX.tendang()}
    else if(G.ph==='hasil'&&G.t>.9){if(G.shot>=G.max){G.ph='end';SFX.habis();catat(G.hs,G.gol)}else reset()}
    else if(G.ph==='end')start('penalti')};
  const reset=()=>{G.ph='aim';G.t=0;G.ball={x:W/2,y:400,r:12};G.kp={x:W/2,dx:0};G.tgt=null;G.msg=''};
  G.update=dt=>{G.t+=dt;if(G.ph==='aim'){G.kp.x=W/2+Math.sin(G.t*2.4)*26}
    if(G.ph==='fly'){const u=Math.min(1,G.t/.55);G.ball.x=W/2+(G.tgt.x-W/2)*u;G.ball.y=400+(G.tgt.y-400)*u-Math.sin(u*Math.PI)*40;G.ball.r=12-u*4;
      const kx=W/2+G.kpDir*(G.goal.w/2-36);G.kp.x+= (kx-G.kp.x)*Math.min(1,dt*7);
      if(u>=1){G.shot++;const dx=Math.abs(G.tgt.x-G.kp.x),reach=G.tgt.y<G.goal.y+30?38:58;const saved=dx<reach;if(saved){G.msg='DITEPIS!';SFX.tepis()}else{G.gol++;G.msg='GOOOL!';SFX.gol()}G.ph='hasil';G.t=0}}};
  G.draw=t=>{ctx.fillStyle='#7FB65A';ctx.fillRect(0,0,W,H);for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#76AD52':'#86BD60';ctx.fillRect(0,230+i*32,W,32)}
    ctx.fillStyle='#5E8FB8';ctx.fillRect(0,0,W,72);for(let i=0;i<24;i++){circ(10+i*15,60+(i%3)*6,8,['#F2C230','#E2453C','#fff','#3E8FC9'][i%4])} // penonton
    const g=G.goal;ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1;for(let x=g.x;x<=g.x+g.w;x+=14){ctx.beginPath();ctx.moveTo(x,g.y);ctx.lineTo(x,g.y+g.h);ctx.stroke()}for(let y=g.y;y<=g.y+g.h;y+=14){ctx.beginPath();ctx.moveTo(g.x,y);ctx.lineTo(g.x+g.w,y);ctx.stroke()}
    ctx.lineWidth=8;ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(g.x,g.y+g.h);ctx.lineTo(g.x,g.y);ctx.lineTo(g.x+g.w,g.y);ctx.lineTo(g.x+g.w,g.y+g.h);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(20,g.y+g.h);ctx.lineTo(W-20,g.y+g.h);ctx.stroke();circ(W/2,400,4,'#fff');
    // kiper (tanpa wajah)
    const kx=G.kp.x,ky=g.y+g.h-34,dive=G.ph!=='aim'?G.kpDir:0;ctx.save();ctx.translate(kx,ky);ctx.rotate(dive*.7*Math.min(1,G.ph==='fly'?G.t/.4:1));rr(-16,-26,32,44,10,'#E2A21B',INK);circ(0,-38,13,'#F1C9A0',INK);rr(-34,-22,18,10,5,'#2E9C6A',INK);rr(16,-22,18,10,5,'#2E9C6A',INK);rr(-14,18,11,18,4,INK);rr(3,18,11,18,4,INK);ctx.restore();
    // bola
    if(G.ph!=='end'){circ(G.ball.x,G.ball.y+6,G.ball.r*.9,'rgba(0,0,0,.18)');circ(G.ball.x,G.ball.y,G.ball.r,'#fff',INK,2.5);circ(G.ball.x,G.ball.y,G.ball.r*.38,INK)}
    if(G.ph==='aim'){txt('Ketuk gawang buat nendang!',W/2,446,15,'#fff');ctx.globalAlpha=.6+.4*Math.sin(t*6);txt('👆',W/2+90,350,30,'#fff','center',400,null);ctx.globalAlpha=1}
    txt(`⚽ ${G.gol}/${G.shot}`,16,26,18,'#fff','left');txt(`Tendangan ${Math.min(G.shot+1,G.max)} dari ${G.max}`,W-14,26,13,'#fff','right',700);
    if(G.ph==='hasil'){txt(G.msg,W/2,300,44,G.msg[0]==='G'?KUNING:'#fff');if(G.t>.9)txt('ketuk buat lanjut',W/2,446,13,'#fff','center',700)}
    if(G.ph==='end')endCard(`${G.gol} gol dari ${G.max}`,G.gol>=4?'Jago banget! 🏆':G.gol>=2?'Lumayan! Coba lagi 💪':'Kipernya lagi on fire 😅',lsGet(G.hs))};
  return G}
// ---------- 2. TANGKAP GENTENG ----------
function Genteng(){const G={x:W/2,items:[],skor:0,nyawa:3,t:0,sp:0,ph:'main',hs:'genteng',drag:false,fx:[]};
  G.tap=(x,y)=>{if(G.ph==='end'){start('genteng');return}G.drag=true;G.x=x};G.move=x=>{if(G.drag)G.x=x};G.up=()=>{G.drag=false};
  G.update=dt=>{if(G.ph!=='main')return;G.t+=dt;G.sp+=dt;const rate=Math.max(.42,1.1-G.t*.012);
    if(G.sp>rate){G.sp=0;const r=Math.random(),tp=r<.13?'emas':r<.31?'bom':'genteng';G.items.push({x:rnd(24,W-24),y:-20,v:rnd(110,150)+G.t*3.2,tp,rot:rnd(-1,1)})}
    G.items.forEach(o=>{o.y+=o.v*dt;o.rot+=dt*2});G.x=Math.max(34,Math.min(W-34,G.x));
    G.items=G.items.filter(o=>{if(o.y>H-86&&o.y<H-52&&Math.abs(o.x-G.x)<40){if(o.tp==='bom'){G.nyawa--;SFX.bom();G.fx.push({x:o.x,y:o.y,t:0,s:'💥'})}else{const p=o.tp==='emas'?3:1;G.skor+=p;(o.tp==='emas'?SFX.emas:SFX.tangkap)();G.fx.push({x:o.x,y:o.y,t:0,s:'+'+p})}return false}
      if(o.y>H+20){return false}return true});G.fx.forEach(f=>f.t+=dt);G.fx=G.fx.filter(f=>f.t<.8);
    if(G.nyawa<=0){G.ph='end';SFX.habis();catat(G.hs,G.skor)}};
  G.draw=t=>{const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#8FD3F2');sky.addColorStop(1,'#CFEFFA');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    circ(60,70,22,'#fff');circ(84,66,18,'#fff');circ(270,110,20,'#fff');circ(292,106,15,'#fff');
    ctx.fillStyle='#7FB65A';ctx.fillRect(0,H-50,W,50);for(let i=0;i<6;i++){rr(i*64-10,H-92,52,44,4,['#E2574C','#3E8FC9','#F2C230','#8E5AA8','#2E9C6A','#E07A3E'][i],INK)}
    G.items.forEach(o=>{ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.rot*.3);if(o.tp==='bom'){circ(0,0,15,INK);ctx.strokeStyle='#E2A21B';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(6,-12);ctx.quadraticCurveTo(14,-22,8,-26);ctx.stroke();circ(8,-27,4+Math.sin(t*30)*1.5,'#FF8A3A');txt('KRPK',0,1,8,'#fff','center',800,null)}
      else genteng(0,0,34,o.tp==='emas'?'#F2C230':'#C4402F');ctx.restore()});
    // keranjang
    const bx=G.x,by=H-72;ctx.fillStyle='#8B5A2B';ctx.beginPath();ctx.moveTo(bx-38,by-14);ctx.lineTo(bx+38,by-14);ctx.lineTo(bx+28,by+16);ctx.lineTo(bx-28,by+16);ctx.closePath();ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=2;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(bx+i*13,by-12);ctx.lineTo(bx+i*10,by+14);ctx.stroke()}
    G.fx.forEach(f=>{ctx.globalAlpha=1-f.t/.8;txt(f.s,f.x,f.y-f.t*40,f.s==='💥'?28:20,f.s==='+3'?KUNING:'#fff');ctx.globalAlpha=1});
    txt(`🧱 ${G.skor}`,16,26,20,'#fff','left');txt('❤️'.repeat(Math.max(0,G.nyawa)),W-14,26,16,'#fff','right',400,null);
    if(G.t<3&&G.ph==='main')txt('Geser keranjangnya! Awas bom kerupuk 💣',W/2,140,13,'#fff');
    if(G.ph==='end')endCard(`${G.skor} genteng`,G.skor>=40?'Juragan Genteng! 👑':G.skor>=15?'Mantap! 🧱':'Ayo coba lagi! 💪',lsGet(G.hs))};
  return G}
// ---------- 3. PANCING IKAN ----------
function Pancing(){const IKAN=[{n:'Ikan kecil',c:'#F2A33A',p:1,s:.8},{n:'Ikan mas',c:'#F2C230',p:2,s:1},{n:'Lele',c:'#6B5B45',p:3,s:1.15},{n:'Ikan langka',c:'#4FB8FF',p:5,s:1.2}];
  const G={ph:'siap',t:0,waktu:60,skor:0,dapat:0,bob:null,wait:0,bite:0,fish:[],msg:'',mt:0,hs:'pancing'};
  for(let i=0;i<7;i++)G.fish.push({x:rnd(20,W-20),y:rnd(250,430),v:rnd(20,45)*(Math.random()<.5?-1:1),k:Math.random()});
  G.tap=(x,y)=>{if(G.ph==='end'){start('pancing');return}
    if(G.ph==='siap'||G.ph==='kosong'){if(y<210)return;G.bob={x,y:Math.max(240,y)};G.ph='tunggu';G.wait=rnd(1.2,3.2);SFX.plung();G.msg=''}
    else if(G.ph==='tunggu'){G.ph='siap';G.bob=null;G.msg='Kecepetan narik 😅';G.mt=1.2;SFX.lepas()}
    else if(G.ph==='makan'){const r=Math.random(),f=r<.06?IKAN[3]:r<.24?IKAN[2]:r<.55?IKAN[1]:IKAN[0];G.skor+=f.p;G.dapat++;G.msg=`Dapat ${f.n}! +${f.p}`;G.mt=1.4;G.last=f;G.ph='siap';G.bob=null;SFX.dapat()}};
  G.update=dt=>{if(G.ph==='end')return;G.t+=dt;G.waktu-=dt;G.mt-=dt;G.fish.forEach(f=>{f.x+=f.v*dt;if(f.x<-20)f.x=W+20;if(f.x>W+20)f.x=-20});
    if(G.ph==='tunggu'){G.wait-=dt;if(G.wait<=0){G.ph='makan';G.bite=.85;SFX.strike()}}
    else if(G.ph==='makan'){G.bite-=dt;if(G.bite<=0){G.ph='siap';G.bob=null;G.msg='Yah, ikannya kabur!';G.mt=1.2;SFX.lepas()}}
    if(G.waktu<=0){G.waktu=0;G.ph='end';SFX.habis();catat(G.hs,G.skor)}};
  G.draw=t=>{const sky=ctx.createLinearGradient(0,0,0,210);sky.addColorStop(0,'#FFD38A');sky.addColorStop(1,'#FFE9C2');ctx.fillStyle=sky;ctx.fillRect(0,0,W,210);circ(290,70,26,'#FFF3C4');
    ctx.fillStyle='#7FB65A';ctx.fillRect(0,150,W,62);for(let i=0;i<5;i++)rr(i*80+6,118,48,34,4,['#C4402F','#3E8FC9','#F2C230','#8E5AA8','#2E9C6A'][i],INK);
    const wg=ctx.createLinearGradient(0,210,0,H);wg.addColorStop(0,'#4FA9D6');wg.addColorStop(1,'#256E9E');ctx.fillStyle=wg;ctx.fillRect(0,210,W,H-210);
    ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=2;for(let i=0;i<9;i++){const y=230+i*28,o=(t*30+i*40)%80;ctx.beginPath();for(let x=-80+o;x<W;x+=80){ctx.moveTo(x,y);ctx.quadraticCurveTo(x+20,y-5,x+40,y)}ctx.stroke()}
    G.fish.forEach(f=>{ctx.save();ctx.translate(f.x,f.y);ctx.scale(f.v<0?-1:1,1);ctx.globalAlpha=.55;ctx.fillStyle=f.k>.85?'#4FB8FF':'#1E4E6E';ctx.beginPath();ctx.ellipse(0,0,16,7,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-24,-7);ctx.lineTo(-24,7);ctx.closePath();ctx.fill();ctx.restore();ctx.globalAlpha=1});
    // pemancing di tepi (tanpa wajah) + joran
    rr(150,160,24,34,8,'#E2574C',INK);circ(162,148,11,'#F1C9A0',INK);rr(150,140,24,8,4,'#8B5A2B');
    if(G.bob){const shake=G.ph==='makan'?Math.sin(t*50)*4:Math.sin(t*3)*1.5;ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(170,165);ctx.lineTo(205,115);ctx.stroke();ctx.strokeStyle='rgba(28,37,32,.7)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(205,115);ctx.quadraticCurveTo((205+G.bob.x)/2,G.bob.y-60,G.bob.x,G.bob.y+shake);ctx.stroke();
      circ(G.bob.x,G.bob.y+shake,7,'#E2453C',INK,2);ctx.fillStyle='#fff';ctx.fillRect(G.bob.x-7,G.bob.y+shake-1,14,3);
      if(G.ph==='makan'){txt('!',G.bob.x,G.bob.y-30,34,KUNING);txt('TARIK SEKARANG!',W/2,446,18,KUNING)}}
    else{ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(170,165);ctx.lineTo(200,120);ctx.stroke()}
    txt(`🎣 ${G.skor}`,16,26,20,'#fff','left');txt(`⏱ ${Math.ceil(G.waktu)}`,W-14,26,18,'#fff','right');
    if(G.ph==='siap'&&G.mt<=0)txt('Ketuk air buat lempar kail',W/2,446,15,'#fff');if(G.ph==='tunggu')txt('Sabar… tunggu pelampungnya goyang',W/2,446,14,'#fff','center',700);
    if(G.mt>0&&G.msg)txt(G.msg,W/2,240,20,G.msg.startsWith('Dapat')?KUNING:'#fff');
    if(G.ph==='end')endCard(`${G.skor} poin · ${G.dapat} ikan`,G.skor>=25?'Raja Pancing! 🎣':G.skor>=10?'Mantap, panen ikan! 🐟':'Ikannya lagi malu-malu 😄',lsGet(G.hs))};
  return G}
// ---------- 4. RACIK BAKSO ----------
function Bakso(){const BHN=[{id:'mi',n:'Mi',e:'🍜'},{id:'bakso',n:'Bakso',e:'🟤'},{id:'sawi',n:'Sawi',e:'🥬'},{id:'sambal',n:'Sambal',e:'🌶️'},{id:'bawang',n:'Bawang goreng',e:'🧅'},{id:'tahu',n:'Tahu',e:'🟨'}];
  const G={ph:'main',t:0,waktu:60,skor:0,porsi:0,order:null,isi:{},msg:'',mt:0,hs:'bakso',pembeli:0};
  const baru=()=>{const o={};const n=2+Math.min(3,Math.floor(G.porsi/2));const pool=BHN.slice();o.bakso=1+Math.floor(Math.random()*3);for(let i=0;i<n-1;i++){const b=pool[1+Math.floor(Math.random()*(pool.length-1))];if(b.id!=='bakso')o[b.id]=(o[b.id]||0)+1}if(Math.random()<.7)o.mi=1;G.order=o;G.isi={};G.pembeli=(G.pembeli+1)%5};
  baru();
  const cocok=()=>{const k=new Set([...Object.keys(G.order),...Object.keys(G.isi)]);for(const x of k)if((G.order[x]||0)!==(G.isi[x]||0))return false;return true};
  G.tap=(x,y)=>{if(G.ph==='end'){start('bakso');return}for(const b of BTN)if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.fn();return}};
  G.btns=()=>{};
  G.update=dt=>{if(G.ph!=='main')return;G.t+=dt;G.waktu-=dt;G.mt-=dt;if(G.waktu<=0){G.waktu=0;G.ph='end';SFX.habis();catat(G.hs,G.skor)}};
  G.draw=t=>{ctx.fillStyle='#F7E6C4';ctx.fillRect(0,0,W,H);ctx.fillStyle='#E2574C';for(let i=0;i<9;i++)ctx.fillRect(i*44,0,22,40);ctx.fillStyle='#fff';for(let i=0;i<9;i++)ctx.fillRect(i*44+22,0,22,40);rr(0,36,W,12,0,'#8B5A2B');
    // pembeli (tanpa wajah) + gelembung pesanan
    const px=56;rr(px-20,96,40,54,12,['#3E8FC9','#8E5AA8','#2E9C6A','#E07A3E','#E2453C'][G.pembeli],INK);circ(px,82,16,'#F1C9A0',INK);
    rr(100,62,244,96,16,'#fff',INK);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(102,104);ctx.lineTo(86,112);ctx.lineTo(102,118);ctx.fill();
    txt('Pesanan:',114,80,13,INK,'left',800,null);let ox=114,oy=108;Object.entries(G.order).forEach(([k,v])=>{const b=BHN.find(x=>x.id===k);ctx.font='20px "Noto Color Emoji",sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(b.e,ox,oy);txt('×'+v,ox+24,oy+1,14,INK,'left',800,null);ox+=58;if(ox>300){ox=114;oy+=30}});
    // mangkuk
    ctx.fillStyle='#D9DDE3';ctx.beginPath();ctx.ellipse(W/2,232,92,22,0,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(W/2-92,232);ctx.quadraticCurveTo(W/2,330,W/2+92,232);ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#E9B572';ctx.beginPath();ctx.ellipse(W/2,232,84,17,0,0,7);ctx.fill();ctx.fillStyle='#E2574C';ctx.fillRect(W/2-60,268,120,6);
    let i=0;Object.entries(G.isi).forEach(([k,v])=>{const b=BHN.find(x=>x.id===k);for(let j=0;j<v;j++){ctx.font='22px "Noto Color Emoji",sans-serif';ctx.textAlign='center';ctx.fillText(b.e,W/2-60+((i*37)%120),226+Math.floor(i/4)*10);i++}});
    // tombol bahan
    BTN=[];BHN.forEach((b,k)=>{const x=14+(k%3)*114,y=300+Math.floor(k/3)*58;BTN.push({x,y,w:104,h:50,fn:()=>{G.isi[b.id]=(G.isi[b.id]||0)+1;SFX.pop()}});rr(x,y,104,50,12,KREM,INK);ctx.font='20px "Noto Color Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.e,x+22,y+26);txt(b.n,x+66,y+26,b.n.length>8?10:13,INK,'center',800,null)});
    BTN.push({x:14,y:420,w:120,h:44,fn:()=>{G.isi={};SFX.klik()}});rr(14,420,120,44,12,'#fff',INK);txt('🗑️ Ulang',74,443,14,INK,'center',800,null);
    BTN.push({x:146,y:420,w:200,h:44,fn:()=>{if(cocok()){G.porsi++;const p=3+Object.values(G.order).reduce((a,b)=>a+b,0);G.skor+=p;G.msg=`Pas! +${p} 😋`;G.mt=1.1;SFX.ting();baru()}else{G.msg='Belum pas, cek lagi!';G.mt=1;SFX.salah()}}});rr(146,420,200,44,12,KUNING,INK);txt('🛎️ Sajikan!',246,443,16,INK,'center',800,null);
    txt(`🍜 ${G.skor}`,16,62,18,INK,'left',800,null);txt(`⏱ ${Math.ceil(G.waktu)}`,W-14,186,16,INK,'right',800,null);
    if(G.mt>0)txt(G.msg,W/2,200,18,G.msg.startsWith('Pas')?'#2E9C6A':MERAH,'center',800,'#fff');
    if(G.ph==='end'){BTN=[];endCard(`${G.porsi} porsi · ${G.skor} poin`,G.porsi>=8?'Juragan Bakso! 👑':G.porsi>=4?'Warung laris manis! 🍜':'Pembelinya sabar kok 😄',lsGet(G.hs))}};
  return G}
// ---------- kartu akhir ----------
function endCard(a,b,hs){ctx.fillStyle='rgba(14,21,18,.72)';ctx.fillRect(0,0,W,H);rr(40,92,280,330,22,KREM,INK);txt('SELESAI!',W/2,126,28,MERAH,'center',800,null);txt(a,W/2,166,22,INK,'center',800,null);txt(b,W/2,198,15,HIJAU,'center',700,null);txt('🏆 Rekor: '+hs,W/2,226,14,INK,'center',700,null);
  rr(58,242,244,124,12,'#fff');txt('📜 Riwayat poin terakhir',W/2,258,12,INK,'center',800,null);hGet(game.id).forEach((o,i)=>{const y=280+i*17;txt((i?'':'▶ ')+o.v+' '+({penalti:'gol',genteng:'genteng'}[game.id]||'poin'),72,y,12,i?INK:MERAH,'left',800,null);txt(lalu(o.at),288,y,11,'#777','right',600,null)});
  BTN=[];btn(60,374,110,36,'🔁 Main lagi',()=>start(game.id),KUNING,14);btn(190,374,110,36,'🎮 Menu',()=>{game=null;SFX.klik()},'#fff',14)}
// ---------- loop ----------
function start(id){SFX.klik();const f={penalti:Penalti,genteng:Genteng,pancing:Pancing,bakso:Bakso}[id];game=f();game.id=id}
function frame(ts){raf=requestAnimationFrame(frame);const dt=Math.min(.05,(ts-(last||ts))/1000);last=ts;const t=ts/1000;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);if(game&&game.id!=='bakso')BTN=[];if(!game){BTN=[];Menu.draw(t)}else{game.update(dt);game.draw(t)}
  if(game){BTN.push({x:W-48,y:44,w:40,h:28,fn:()=>{game=null;SFX.klik()}});if(!(game.id==='bakso'))rr(W-48,44,40,28,8,'rgba(255,255,255,.85)',INK);else rr(W-48,44,40,28,8,'#fff',INK);txt('☰',W-28,58,16,INK,'center',800,null)}}
function pos(e){const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]}
function down(e){e.preventDefault();au();const [x,y]=pos(e);for(const b of BTN.slice().reverse())if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.fn();return}if(game&&game.tap)game.tap(x,y)}
function move(e){const [x,y]=pos(e);if(!game){menuHot=GAMES.findIndex((g,i)=>{const gx=20+(i%2)*170,gy=110+Math.floor(i/2)*170;return x>=gx&&x<=gx+150&&y>=gy&&y<=gy+150});return}if(game.move)game.move(x,y)}
function up(){if(game&&game.up)game.up()}
function open(opt={}){if(root)return;if(!document.getElementById('kns-css')){const s=document.createElement('style');s.id='kns-css';s.textContent=css;document.head.append(s)}
  root=document.createElement('div');root.className='kns';root.innerHTML=`<div class="kns-body">${opt.qa?'<span class="kns-qa">MODE UJI (QA)</span>':''}<div class="kns-top"><span class="kns-logo"><span class="kns-led"></span>playadalah<b>main</b></span><button type="button" class="kns-x" aria-label="Tutup">✕</button></div>
   <div class="kns-scr"><canvas width="${W}" height="${H}"></canvas></div><div class="kns-pad"><div class="kns-dpad"><i></i><i></i></div><div class="kns-btns"><span></span><span></span></div></div></div>`;
  document.body.append(root);cv=root.querySelector('canvas');dpr=Math.min(3,window.devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;ctx=cv.getContext('2d');
  cv.addEventListener('pointerdown',down);cv.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  root.querySelector('.kns-x').onclick=close;root.addEventListener('pointerdown',e=>{if(e.target===root)close()});game=opt.game?null:null;last=0;raf=requestAnimationFrame(frame)}
function close(){cancelAnimationFrame(raf);window.removeEventListener('pointerup',up);if(root)root.remove();root=null;game=null}
window.KONSOL={open,close};
})();
