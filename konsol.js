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
let OPT={},RANK=null,rankSel=0,st,cv,ctx,dpr,raf=0,last=0,game=null,menuHot=-1,ac=null,root=null;
const lsGet=k=>{try{return +localStorage.getItem('kns_'+k)||0}catch(e){return 0}};
const lsSet=(k,v)=>{try{localStorage.setItem('kns_'+k,String(v))}catch(e){}};
// riwayat poin terakhir per game (5 terakhir, terbaru di depan)
const hGet=k=>{try{const v=JSON.parse(localStorage.getItem('kns_h_'+k)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}};
function catat(k,v){const h=hGet(k);h.unshift({v,at:Date.now()});try{localStorage.setItem('kns_h_'+k,JSON.stringify(h.slice(0,5)))}catch(e){};if(v>lsGet(k))lsSet(k,v);if(OPT.kirim){try{Promise.resolve(OPT.kirim(k,v)).then(r=>{if(r&&r.rank&&game&&game.id===k)game.rankKu=r.rank;RANK=null}).catch(()=>{})}catch(e){}}}
const lalu=t=>{const d=Math.round((Date.now()-t)/1000);return d<60?'barusan':d<3600?Math.round(d/60)+' mnt lalu':d<86400?Math.round(d/3600)+' jam lalu':Math.round(d/86400)+' hr lalu'};
// ---------- SFX (WebAudio, tanpa musik) ----------
function au(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume()}catch(e){}return ac}
function tone(f,d,type='square',v=.12,f2){const a=au();if(!a||MUTE)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0008,t+d);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.02)}
function noise(d,v=.15,lp=1200){const a=au();if(!a||MUTE)return;const n=Math.floor(a.sampleRate*d),b=a.createBuffer(1,n,a.sampleRate),c=b.getChannelData(0);for(let i=0;i<n;i++)c[i]=(Math.random()*2-1)*(1-i/n);const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();f.type='lowpass';f.frequency.value=lp;s.buffer=b;g.gain.value=v;s.connect(f);f.connect(g);g.connect(a.destination);s.start()}
function nz(d,v,type,fq,atk=.01,q=1){const a=au();if(!a||MUTE)return;const n=Math.floor(a.sampleRate*d),b=a.createBuffer(1,n,a.sampleRate),c=b.getChannelData(0);for(let i=0;i<n;i++)c[i]=Math.random()*2-1;
  const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain(),t=a.currentTime;f.type=type;f.frequency.value=fq;f.Q.value=q;s.buffer=b;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+atk);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(f);f.connect(g);g.connect(a.destination);s.start()}
const at=(ms,fn)=>setTimeout(fn,ms);
let MUTE=false;try{MUTE=localStorage.getItem('kns_mute')==='1'}catch(e){}
function sebut(teks){if(MUTE||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(teks);u.lang='id-ID';u.rate=1.08;u.pitch=1.25;u.volume=.9;
  const v=speechSynthesis.getVoices().find(x=>/^id/i.test(x.lang));if(v)u.voice=v;speechSynthesis.speak(u)}catch(e){}}
// suara khas tiap game saat dipilih di menu (efek & suasana, tanpa musik)
const PRE={penalti:()=>{SFX.tendang();at(180,()=>nz(1.1,.07,'bandpass',900,.35,.7))},
  genteng:()=>{nz(.05,.2,'highpass',2500);at(90,()=>nz(.05,.16,'highpass',3000));at(180,()=>tone(140,.12,'sine',.14,70))},
  pancing:()=>{tone(1800,.25,'sine',.04,600);at(260,()=>SFX.plung())},
  bakso:()=>{nz(.9,.05,'highpass',4000,.05);at(250,()=>tone(2093,.35,'sine',.07));at(420,()=>tone(2637,.3,'sine',.05))},
  ayam:()=>{[0,130,260,520].forEach((d,i)=>at(d,()=>tone(i<3?760:980,i<3?.07:.22,'sawtooth',.05,i<3?480:560)))},
  karung:()=>{[0,260,520].forEach(d=>at(d,()=>{tone(90,.12,'sine',.22,50);nz(.08,.08,'lowpass',500)}))},
  layang:()=>nz(1.3,.09,'bandpass',700,.5,1.4),
  memori:()=>{nz(.06,.12,'highpass',3500);at(160,()=>nz(.06,.12,'highpass',3500));at(320,()=>SFX.emas())}};
// suasana kampung pelan saat di menu: jangkrik, burung, ayam jauh, anak-anak bersorak
const AMB=[()=>{for(let i=0;i<9;i++)at(i*70,()=>tone(4400,.035,'sine',.012))},()=>{[0,140,260].forEach((d,i)=>at(d,()=>tone(2600+i*300,.08,'sine',.02,3400+i*200)))},
  ()=>{[0,160,320].forEach((d,i)=>at(d,()=>tone(i<2?620:700,i<2?.12:.45,'sawtooth',.012,i<2?660:420)))},()=>nz(1.4,.025,'bandpass',1100,.5,.8)];
let ambNext=0;
const SFX={klik:()=>tone(880,.06,'square',.08),nav:i=>{tone(440*Math.pow(2,i/8),.05,'square',.06);at(45,()=>tone(660*Math.pow(2,i/8),.05,'square',.05))},mulai:()=>{tone(784,.08,'square',.09);at(80,()=>tone(1175,.08,'square',.09));at(160,()=>tone(1568,.18,'triangle',.1));at(150,()=>nz(1.2,.08,'bandpass',1000,.2,.6))},pop:()=>tone(500,.09,'sine',.14,1100),tendang:()=>{noise(.12,.25,900);tone(160,.12,'sine',.2,60)},gol:()=>{tone(660,.12,'square',.1);setTimeout(()=>tone(990,.2,'square',.1),110);noise(.6,.06,3000)},
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
const GAMES=[{id:'penalti',n:'ADU PENALTI',ic:'⚽'},{id:'genteng',n:'TANGKAP GENTENG',ic:'🧱'},{id:'pancing',n:'PANCING IKAN',ic:'🎣'},{id:'bakso',n:'RACIK BAKSO',ic:'🍜'},
  {id:'ayam',n:'KEJAR AYAM',ic:'🐔'},{id:'karung',n:'BALAP KARUNG',ic:'🥔'},{id:'layang',n:'LAYANGAN',ic:'🪁'},{id:'memori',n:'MEMORI GENTENG',ic:'🃏'}];
let menuSel=0;const ROW0=98,ROWH=38;
// menu gaya kaset "8 in 1": latar biru tua, bintang, daftar bernomor, bar sorot berkedip
const Menu={draw(t){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0B1A4A');g.addColorStop(1,'#1B0B3A');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  for(let i=0;i<40;i++){const x=(i*97)%W,y=(i*53+t*12*(1+i%3))%H;ctx.fillStyle=`rgba(255,255,255,${.3+.5*((i*7)%10)/10})`;ctx.fillRect(x,y,2,2)}
  txt('★ 8 in 1 ★',W/2,30,15,'#FF5E8A','center',800,'#2A0B3A');
  ctx.font='800 26px Poppins,system-ui,sans-serif';{const a1=ctx.measureText('playadalah').width,a2=ctx.measureText('main').width,x0=W/2-(a1+a2)/2;txt('playadalah',x0,60,26,'#fff','left',800,'#1A2A6A');txt('main',x0+a1,60,26,KUNING,'left',800,'#1A2A6A')}
  txt('SUPER KOLEKSI GAME KAMPUNG',W/2,84,11,'#7FD8FF','center',700,null);
  GAMES.forEach((gm,i)=>{const y=ROW0+i*ROWH,on=i===menuSel;BTN.push({x:16,y,w:W-32,h:ROWH-4,fn:()=>{if(menuSel===i){SFX.mulai();sebut(gm.n.toLowerCase()+'!');start(gm.id,1)}else{menuSel=i;SFX.nav(i);(PRE[gm.id]||SFX.klik)();ambNext=performance.now()/1000+6}}});
    if(on){ctx.globalAlpha=.75+.25*Math.sin(t*8);rr(16,y,W-32,ROWH-4,6,'#F2C230');ctx.globalAlpha=1}
    txt(String(i+1).padStart(2,'0')+'.',30,y+18,15,on?INK:'#7FD8FF','left',800,null);ctx.font='18px "Noto Color Emoji",sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(gm.ic,64,y+18);
    txt(gm.n,94,y+18,15,on?INK:'#fff','left',800,null);const h=hGet(gm.id);if(h.length)txt('🏆'+lsGet(gm.id),W-28,y+18,11,on?INK:KUNING,'right',700,null)});
  const sel=GAMES[menuSel],h=hGet(sel.id);txt(h.length?`Terakhir: ${h[0].v} · Rekor: ${lsGet(sel.id)}`:'Belum pernah dimainkan',W/2,ROW0+8*ROWH+8,11,'#B9C7FF','center',600,null);
  btn(14,10,38,28,MUTE?'🔇':'🔊',()=>{MUTE=!MUTE;try{localStorage.setItem('kns_mute',MUTE?'1':'0')}catch(e){}if(MUTE&&window.speechSynthesis)speechSynthesis.cancel();else SFX.klik()},'rgba(255,255,255,.14)',14);
  if(ac&&!MUTE&&t>ambNext){if(ambNext)AMB[Math.floor(Math.random()*AMB.length)]();ambNext=t+3.5+Math.random()*4}
  btn(16,H-48,150,34,'🏆 RANKING',()=>{rankSel=menuSel;game=Rank();game.id='rank'},'#FF5E8A',14);txt('Ketuk 2x = MULAI',W-20,H-31,12,'#FF9EC0','right',700,null)}};
// ---------- papan ranking pemilik playadalahmain ----------
function Rank(){const G={t:0,hs:'rank'};if(!RANK&&OPT.rank){RANK='muat';Promise.resolve(OPT.rank()).then(j=>{RANK=(j&&j.rank)||{}}).catch(()=>{RANK={}})}
  G.tap=(x,y)=>{if(y>H-60){if(x<W/2)rankSel=(rankSel+7)%8;else rankSel=(rankSel+1)%8;SFX.klik()}};G.update=dt=>{G.t+=dt};
  G.draw=t=>{const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0B1A4A');g.addColorStop(1,'#1B0B3A');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    txt('🏆 RANKING',W/2,30,22,KUNING,'center',800,'#1A2A6A');txt('Khusus pemilik playadalahmain 1.0',W/2,54,11,'#7FD8FF','center',700,null);
    const gm=GAMES[rankSel];rr(20,70,W-40,36,8,'#F2C230');ctx.font='18px "Noto Color Emoji",sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(gm.ic,32,88);txt(gm.n,60,89,15,INK,'left',800,null);
    if(RANK==='muat'||!OPT.rank)txt(OPT.rank?'Memuat…':'Ranking muncul setelah konsol dijual',W/2,240,14,'#B9C7FF','center',700,null);
    else{const L=(RANK[gm.id]||[]);if(!L.length)txt('Belum ada skor. Jadi yang pertama! 💪',W/2,240,14,'#B9C7FF','center',700,null);
      L.forEach((o,i)=>{const y=126+i*30,ku=OPT.me&&o.u.toLowerCase()===String(OPT.me).toLowerCase();if(ku)rr(20,y-13,W-40,26,6,'rgba(242,194,48,.35)');
        txt(i<3?['🥇','🥈','🥉'][i]:String(i+1)+'.',40,y,i<3?16:13,'#fff','center',800,null);txt('@'+o.u,62,y,13,ku?KUNING:'#fff','left',700,null);txt(String(o.v),W-32,y,14,KUNING,'right',800,null)})}
    rr(16,H-52,150,38,10,'rgba(255,255,255,.12)');txt('◀ Game sebelumnya',91,H-33,11,'#fff','center',700,null);rr(W-166,H-52,150,38,10,'rgba(255,255,255,.12)');txt('Game berikutnya ▶',W-91,H-33,11,'#fff','center',700,null)};
  return G}
// ---------- 1. ADU PENALTI ----------
function Penalti(){const G={shot:0,gol:0,max:5,ph:'aim',t:0,ball:{x:W/2,y:400,r:12},tgt:null,kp:{x:W/2,dx:0},kpDir:0,msg:'',hs:'penalti',
  goal:{x:40,y:96,w:280,h:120}};
  // swipe: tarik dari bawah ke arah gawang. Arah = tujuan, panjang = tinggi, cepat = kiper susah nebak
  G.tap=(x,y)=>{if(G.ph==='aim'){if(y>G.goal.y+G.goal.h+20)G.sw={x0:x,y0:y,x,y,t0:performance.now(),tr:[[x,y]]};return}
    if(G.ph==='hasil'&&G.t>.9){if(G.shot>=G.max){G.ph='end';SFX.habis();catat(G.hs,G.gol)}else reset()}
    else if(G.ph==='end')start('penalti')};
  G.move=(x,y)=>{if(!G.sw)return;G.sw.x=x;G.sw.y=y;G.sw.tr.push([x,y]);if(G.sw.tr.length>14)G.sw.tr.shift()};
  G.up=()=>{const w=G.sw;G.sw=null;if(!w||G.ph!=='aim')return;const dx=w.x-w.x0,dy=w.y0-w.y,len=Math.hypot(dx,dy);if(dy<40||len<50)return;
    const ms=Math.max(60,performance.now()-w.t0),g=G.goal,gx=W/2+dx/dy*(400-(g.y+g.h/2))*.9,tinggi=Math.min(1.25,(len-50)/190),gy=g.y+g.h-12-tinggi*(g.h-6);
    G.tgt={x:gx,y:gy};G.miss=gx<g.x+6?'MELENCENG!':gx>g.x+g.w-6?'MELENCENG!':gy<g.y+4?'KETINGGIAN!':'';
    const zone=gx<W/2-50?-1:gx>W/2+50?1:0,smart=Math.random()<(ms<170?.3:ms<320?.42:.6);G.kpDir=smart?zone:[-1,0,1][Math.floor(Math.random()*3)];
    {const kx=W/2+G.kpDir*(g.w/2-36),reach=gy<g.y+30?38:58;G.save=!G.miss&&Math.abs(gx-kx)<reach;if(G.save)G.kpDir=gx<W/2-30?-1:gx>W/2+30?1:0}
    G.ph='fly';G.t=0;SFX.tendang()};
  const reset=()=>{G.ph='aim';G.sw=null;G.miss='';G.save=false;G.bv=null;G.t=0;G.ball={x:W/2,y:400,r:12};G.kp={x:W/2,dx:0,ly:0};G.tgt=null;G.msg=''};
  G.update=dt=>{G.t+=dt;if(G.ph==='hasil'&&G.bv){G.ball.x+=G.bv.x*dt;G.ball.y+=G.bv.y*dt;G.bv.y+=380*dt;G.ball.r=Math.min(10,G.ball.r+dt*4);const fl=G.goal.y+G.goal.h+26;if(G.ball.y>fl){G.ball.y=fl;G.bv.y*=-.45;G.bv.x*=.7}}if(G.ph==='aim'){G.kp.x=W/2+Math.sin(G.t*2.4)*26}
    if(G.ph==='fly'){const u=Math.min(1,G.t/.55);G.ball.x=W/2+(G.tgt.x-W/2)*u;G.ball.y=400+(G.tgt.y-400)*u-Math.sin(u*Math.PI)*40;G.ball.r=12-u*4;
      const kx=G.save?G.tgt.x:W/2+G.kpDir*(G.goal.w/2-36);G.kp.x+=(kx-G.kp.x)*Math.min(1,dt*(G.save?9:7));
      if(G.save){const ly=Math.min(0,G.tgt.y-(G.goal.y+G.goal.h-34)+12);G.kp.ly=(G.kp.ly||0)+(ly-(G.kp.ly||0))*Math.min(1,dt*9)}
      if(u>=1&&G.miss){G.shot++;G.msg=G.miss;SFX.tepis();G.ph='hasil';G.t=0}
      else if(u>=1){G.shot++;const saved=G.save;if(saved){G.msg='DITEPIS!';SFX.tepis();G.bv={x:(G.tgt.x<W/2?-1:G.tgt.x>W/2?1:(Math.random()<.5?-1:1))*120,y:-110}}else{G.gol++;G.msg='GOOOL!';SFX.gol()}G.ph='hasil';G.t=0}}};
  G.draw=t=>{ctx.fillStyle='#7FB65A';ctx.fillRect(0,0,W,H);for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#76AD52':'#86BD60';ctx.fillRect(0,230+i*32,W,32)}
    ctx.fillStyle='#5E8FB8';ctx.fillRect(0,0,W,72);for(let i=0;i<24;i++){circ(10+i*15,60+(i%3)*6,8,['#F2C230','#E2453C','#fff','#3E8FC9'][i%4])} // penonton
    const g=G.goal;ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1;for(let x=g.x;x<=g.x+g.w;x+=14){ctx.beginPath();ctx.moveTo(x,g.y);ctx.lineTo(x,g.y+g.h);ctx.stroke()}for(let y=g.y;y<=g.y+g.h;y+=14){ctx.beginPath();ctx.moveTo(g.x,y);ctx.lineTo(g.x+g.w,y);ctx.stroke()}
    ctx.lineWidth=8;ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(g.x,g.y+g.h);ctx.lineTo(g.x,g.y);ctx.lineTo(g.x+g.w,g.y);ctx.lineTo(g.x+g.w,g.y+g.h);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(20,g.y+g.h);ctx.lineTo(W-20,g.y+g.h);ctx.stroke();circ(W/2,400,4,'#fff');
    // kiper (tanpa wajah)
    const kx=G.kp.x,ky=g.y+g.h-34+(G.kp.ly||0),dive=G.ph!=='aim'?G.kpDir:0;ctx.save();ctx.translate(kx,ky);ctx.rotate(dive*.7*Math.min(1,G.ph==='fly'?G.t/.4:1));rr(-16,-26,32,44,10,'#E2A21B',INK);circ(0,-38,13,'#F1C9A0',INK);rr(-34,-22,18,10,5,'#2E9C6A',INK);rr(16,-22,18,10,5,'#2E9C6A',INK);rr(-14,18,11,18,4,INK);rr(3,18,11,18,4,INK);ctx.restore();
    // bola
    if(G.ph!=='end'){circ(G.ball.x,G.ball.y+6,G.ball.r*.9,'rgba(0,0,0,.18)');circ(G.ball.x,G.ball.y,G.ball.r,'#fff',INK,2.5);circ(G.ball.x,G.ball.y,G.ball.r*.38,INK)}
    if(G.ph==='aim'&&G.sw&&G.sw.tr.length>1){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();G.sw.tr.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.lineCap='butt'}
    if(G.ph==='aim'&&!G.sw){txt('Swipe ke atas buat nendang!',W/2,446,15,'#fff');const k=(t*.9)%1;ctx.globalAlpha=Math.sin(k*Math.PI);txt('👆',W/2+70-k*30,430-k*110,30,'#fff','center',400,null);ctx.globalAlpha=1;txt('Panjang = tinggi · cepat = kencang',W/2,466,11,'rgba(255,255,255,.8)','center',600,null)}
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
    else if(G.ph==='makan'){const r=Math.random(),f=r<.06?IKAN[3]:r<.24?IKAN[2]:r<.55?IKAN[1]:IKAN[0];G.skor+=f.p;G.dapat++;G.msg=`Dapat ${f.n}! +${f.p}`;G.mt=1.4;G.last=f;G.angkat={f,t:0,x:G.bob.x,y:G.bob.y};G.ph='siap';G.bob=null;SFX.dapat()}};
  G.update=dt=>{if(G.angkat){G.angkat.t+=dt;if(G.angkat.t>1.8)G.angkat=null}if(G.ph==='end')return;G.t+=dt;G.waktu-=dt;G.mt-=dt;G.fish.forEach(f=>{f.x+=f.v*dt;if(f.x<-20)f.x=W+20;if(f.x>W+20)f.x=-20});
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
    else if(G.angkat){const A=G.angkat,u=Math.min(1,A.t/.45),e=1-Math.pow(1-u,3),tx=226,ty=150,fx=A.x+(tx-A.x)*e,fy=A.y+(ty-A.y)*e-Math.sin(u*Math.PI)*40,sw=Math.sin(A.t*14)*(u>=1?.5:.25);
      // joran melengkung, ikan tergantung & menggelepar di ujung tali
      ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(170,165);ctx.quadraticCurveTo(190,110,215,100);ctx.stroke();ctx.strokeStyle='rgba(28,37,32,.75)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(215,100);ctx.lineTo(fx,fy-12);ctx.stroke();
      ctx.save();ctx.translate(fx,fy);ctx.rotate(Math.PI/2+sw);const sc=A.f.s;ctx.scale(sc,sc);ctx.fillStyle=A.f.c;ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,15,8,0,0,7);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(24,-8);ctx.lineTo(24,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='rgba(255,255,255,.5)';ctx.beginPath();ctx.ellipse(-3,-3,6,2.5,0,0,7);ctx.fill();ctx.restore();
      if(u<1){ctx.fillStyle='rgba(255,255,255,.7)';for(let i=0;i<4;i++)circ(A.x+Math.cos(i*1.6)*14*u*2,A.y-6-u*10+Math.sin(i*2)*4,2.5,'rgba(255,255,255,.75)')}}
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
// ---------- 5. KEJAR AYAM ----------
function Ayam(){const G={ph:'main',t:0,waktu:45,skor:0,ay:[],fx:[],hs:'ayam'};
  const spawn=()=>{const emas=Math.random()<.12;G.ay.push({x:rnd(40,W-40),y:rnd(150,420),vx:rnd(40,90)*(Math.random()<.5?-1:1),vy:rnd(-30,30),emas,t:0,lompat:rnd(0,6)})};
  for(let i=0;i<4;i++)spawn();
  G.tap=(x,y)=>{if(G.ph==='end'){start('ayam');return}let hit=-1,best=1e9;G.ay.forEach((a,i)=>{const d=Math.hypot(a.x-x,a.y-y);if(d<34&&d<best){best=d;hit=i}});
    if(hit>=0){const a=G.ay[hit];const p=a.emas?3:1;G.skor+=p;G.fx.push({x:a.x,y:a.y,t:0,s:'+'+p});G.ay.splice(hit,1);(a.emas?SFX.emas:SFX.tangkap)();spawn()}else SFX.lepas()};
  G.update=dt=>{if(G.ph!=='main')return;G.t+=dt;G.waktu-=dt;const sp=1+G.t/30;
    G.ay.forEach(a=>{a.t+=dt;a.x+=a.vx*dt*sp;a.y+=a.vy*dt*sp;if(a.x<24||a.x>W-24){a.vx*=-1;a.x=Math.max(24,Math.min(W-24,a.x))}if(a.y<140||a.y>440){a.vy*=-1;a.y=Math.max(140,Math.min(440,a.y))}if(Math.random()<dt*.8){a.vx=rnd(40,100)*(Math.random()<.5?-1:1);a.vy=rnd(-40,40)}});
    if(G.ay.length<4+Math.floor(G.t/12))spawn();G.fx.forEach(f=>f.t+=dt);G.fx=G.fx.filter(f=>f.t<.8);
    if(G.waktu<=0){G.waktu=0;G.ph='end';SFX.habis();catat(G.hs,G.skor)}};
  G.draw=t=>{ctx.fillStyle='#93BE62';ctx.fillRect(0,0,W,H);ctx.fillStyle='#89B65A';for(let i=0;i<30;i++)circ((i*71)%W,140+(i*53)%320,10,'#86B356');
    rr(0,0,W,120,0,'#CFE8F5');rr(30,50,120,70,4,'#E2574C',INK);rr(40,80,28,40,3,'#8B5A2B',INK);rr(200,40,130,80,4,'#3E8FC9',INK);ctx.fillStyle='#8B5A2B';for(let x=0;x<W;x+=24)ctx.fillRect(x,118,6,24);ctx.fillRect(0,124,W,5);
    G.ay.forEach(a=>{const hop=Math.abs(Math.sin(a.t*10+a.lompat))*5;ctx.save();ctx.translate(a.x,a.y-hop);ctx.scale(a.vx<0?-1:1,1);ctx.fillStyle='rgba(0,0,0,.15)';ctx.beginPath();ctx.ellipse(0,14+hop,14,4,0,0,7);ctx.fill();
      circ(0,0,14,a.emas?'#F2C230':'#fff',INK,2.5);circ(11,-10,8,a.emas?'#F2C230':'#fff',INK,2.5);ctx.fillStyle='#E2453C';ctx.beginPath();ctx.moveTo(8,-18);ctx.lineTo(12,-24);ctx.lineTo(15,-17);ctx.fill();ctx.fillStyle='#F2A33A';ctx.beginPath();ctx.moveTo(18,-10);ctx.lineTo(25,-8);ctx.lineTo(18,-6);ctx.fill();
      ctx.strokeStyle='#F2A33A';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-4,13);ctx.lineTo(-4,19);ctx.moveTo(4,13);ctx.lineTo(4,19);ctx.stroke();ctx.restore()});
    G.fx.forEach(f=>{ctx.globalAlpha=1-f.t/.8;txt(f.s,f.x,f.y-30-f.t*40,20,f.s==='+3'?KUNING:'#fff');ctx.globalAlpha=1});
    txt(`🐔 ${G.skor}`,16,26,20,'#fff','left');txt(`⏱ ${Math.ceil(G.waktu)}`,W-60,26,18,'#fff','right');if(G.t<3)txt('Ketuk ayamnya sebelum kabur!',W/2,460,14,'#fff');
    if(G.ph==='end')endCard(`${G.skor} ayam`,G.skor>=35?'Pawang Ayam! 🐔👑':G.skor>=18?'Gesit banget! 💨':'Ayamnya licin ya 😄',lsGet(G.hs))};
  return G}
// ---------- 6. BALAP KARUNG ----------
function Karung(){const FIN=1000,COL=['#E2574C','#3E8FC9','#F2C230','#8E5AA8'];
  const P=[0,1,2,3].map(i=>({x:0,h:0,vh:0,air:false,jatuh:0,ai:i>0,sp:rnd(2.1,2.9)+i*.05,nt:rnd(.2,.5),selesai:0,c:COL[i]}));
  const G={ph:'siap',t:0,cd:3,hs:'karung',rank:0,skor:0,msg:'',mt:0,urut:[]};
  const hop=p=>{p.air=true;p.vh=320;p.vx=150};
  G.tap=()=>{if(G.ph==='end'){start('karung');return}if(G.ph!=='lari')return;const me=P[0];if(me.jatuh>0)return;if(me.air&&me.h>45){me.jatuh=.6;me.air=false;me.h=0;me.q=false;G.msg='Kesandung! 😵';G.mt=.8;SFX.salah();return}if(me.air){me.q=true;return}hop(me);SFX.pop()};
  G.update=dt=>{G.t+=dt;G.mt-=dt;if(G.ph==='siap'){G.cd-=dt;if(G.cd<=0){G.ph='lari';G.t=0;SFX.ting()}return}if(G.ph==='end')return;
    P.forEach(p=>{if(p.selesai)return;if(p.jatuh>0){p.jatuh-=dt;return}if(p.ai){p.nt-=dt;if(p.nt<=0&&!p.air){hop(p);p.nt=rnd(.16,.42)/(p.sp/2.5)}}
      if(p.air){p.vh-=900*dt;p.h+=p.vh*dt;p.x+=p.vx*dt*(p.ai?p.sp/2.5:1);if(p.h<=0){p.h=0;p.air=false;if(p.q){p.q=false;hop(p);SFX.pop()}}}
      if(p.x>=FIN&&!p.selesai){p.selesai=G.t;G.urut.push(p);if(!p.ai){G.rank=G.urut.length;G.skor=Math.max(1,[50,30,15,5][G.rank-1]+Math.max(0,Math.round(30-G.t)));G.ph='end';(G.rank===1?SFX.gol:SFX.habis)();catat(G.hs,G.skor)}}})};
  G.draw=t=>{const me=P[0],cam=Math.max(0,Math.min(FIN-200,me.x-110));ctx.fillStyle='#CFE8F5';ctx.fillRect(0,0,W,140);
    for(let i=0;i<8;i++){const x=((i*140-cam*.3)%(W+140)+W+140)%(W+140)-70;rr(x,70,90,70,4,['#E2574C','#3E8FC9','#F2C230','#2E9C6A'][i%4],INK)}
    for(let i=0;i<14;i++){const x=((i*60-cam*.6)%(W+60)+W+60)%(W+60)-30;ctx.fillStyle='#E2453C';ctx.fillRect(x,40,30,12);ctx.fillStyle='#fff';ctx.fillRect(x+30,40,30,12)} // bendera merah putih
    ctx.fillStyle='#93BE62';ctx.fillRect(0,140,W,H-140);
    P.forEach((p,i)=>{const ly=190+i*72;ctx.fillStyle=i%2?'#8DB85C':'#98C266';ctx.fillRect(0,ly-30,W,72);
      const fx=FIN-cam+40;if(fx<W+20){for(let k=0;k<6;k++){ctx.fillStyle=k%2?'#fff':INK;ctx.fillRect(fx,ly-30+k*12,10,12)}}
      const x=p.x-cam+40,y=ly+16-p.h;ctx.fillStyle='rgba(0,0,0,.15)';ctx.beginPath();ctx.ellipse(x,ly+26,16,5,0,0,7);ctx.fill();
      ctx.save();ctx.translate(x,y);if(p.jatuh>0)ctx.rotate(.9);rr(-14,-34,28,40,8,'#C9A46A',INK);ctx.strokeStyle='#8B6A3E';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-10,-20);ctx.lineTo(10,-20);ctx.stroke();rr(-11,-50,22,18,6,p.c,INK);circ(0,-58,10,'#F1C9A0',INK,2.5);ctx.restore();
      if(!p.ai)txt('KAMU',x,y-82,11,KUNING,'center',800);if(p.selesai)txt('#'+(G.urut.indexOf(p)+1),x+26,y-40,13,'#fff')});
    txt(`🥔 ${Math.max(0,Math.round((FIN-me.x)/10))} m lagi`,16,26,16,'#fff','left');
    if(G.ph==='siap')txt(G.cd>0?String(Math.ceil(G.cd)):'MULAI!',W/2,110,48,KUNING);if(G.ph==='lari'&&G.t<2.5)txt('Ketuk tiap mendarat! Jangan kecepetan',W/2,110,14,'#fff');
    if(G.mt>0)txt(G.msg,W/2,150,18,'#fff');
    if(G.ph==='end')endCard(`Juara ${G.rank} · ${G.skor} poin`,G.rank===1?'Juara 17-an! 🇮🇩🏆':G.rank===2?'Tipis banget! 🥈':'Karungnya licin 😄',lsGet(G.hs))};
  return G}
// ---------- 7. LAYANGAN ----------
function Layang(){const G={ph:'main',t:0,y:220,v:0,ob:[],sp:1.2,skor:0,hs:'layang',awan:[]};for(let i=0;i<5;i++)G.awan.push({x:rnd(0,W),y:rnd(40,300),s:rnd(.6,1.2)});
  G.tap=()=>{if(G.ph==='end'){start('layang');return}G.v=-230;SFX.klik()};
  G.update=dt=>{if(G.ph!=='main')return;G.t+=dt;G.v+=520*dt;G.y+=G.v*dt;G.sp+=dt;const v=110+G.t*2;
    if(G.sp>1.7){G.sp=0;const gap=150-Math.min(40,G.t),c=rnd(120,H-140);G.ob.push({x:W+30,c,gap,lewat:false})}
    G.ob.forEach(o=>{o.x-=v*dt;if(!o.lewat&&o.x<90){o.lewat=true;G.skor++;SFX.ting()}});G.ob=G.ob.filter(o=>o.x>-40);G.awan.forEach(a=>{a.x-=a.s*20*dt;if(a.x<-60)a.x=W+60});
    const hit=G.y<10||G.y>H-60||G.ob.some(o=>Math.abs(o.x-110)<28&&(G.y<o.c-o.gap/2||G.y>o.c+o.gap/2));if(hit){G.ph='end';SFX.lepas();catat(G.hs,G.skor)}};
  G.draw=t=>{const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#7EC8F0');g.addColorStop(1,'#D8F1FB');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);G.awan.forEach(a=>{circ(a.x,a.y,18*a.s,'#fff');circ(a.x+18*a.s,a.y+4,14*a.s,'#fff');circ(a.x-16*a.s,a.y+5,12*a.s,'#fff')});
    G.ob.forEach(o=>{const top=o.c-o.gap/2,bot=o.c+o.gap/2;rr(o.x-14,-10,28,top+10,4,'#5E6266',INK);ctx.fillStyle='#2E9C6A';circ(o.x,top-8,22,'#2E9C6A',INK);rr(o.x-10,bot,20,H-bot,3,'#8B5A2B',INK);circ(o.x,bot+6,24,'#3E8E68',INK)});
    ctx.fillStyle='#7FB65A';ctx.fillRect(0,H-50,W,50);for(let i=0;i<7;i++)rr(i*56-8,H-84,46,36,4,['#E2574C','#3E8FC9','#F2C230','#8E5AA8','#2E9C6A','#E07A3E','#E58AA6'][i],INK);
    // benang + layangan
    ctx.strokeStyle='rgba(28,37,32,.6)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(20,H-60);ctx.quadraticCurveTo(70,G.y+80,110,G.y);ctx.stroke();
    ctx.save();ctx.translate(110,G.y);ctx.rotate(Math.max(-.5,Math.min(.5,G.v/600)));ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(16,0);ctx.lineTo(0,22);ctx.lineTo(-16,0);ctx.closePath();ctx.fillStyle=MERAH;ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle=KUNING;ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(16,0);ctx.lineTo(0,0);ctx.fill();
    ctx.strokeStyle=KUNING;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,22);ctx.quadraticCurveTo(-8+Math.sin(t*10)*5,34,0,46);ctx.stroke();ctx.restore();
    txt(`🪁 ${G.skor}`,16,26,20,'#fff','left');if(G.t<2.5)txt('Ketuk buat naikin layangan!',W/2,140,15,'#fff');
    if(G.ph==='end')endCard(`${G.skor} rintangan`,G.skor>=25?'Raja Layangan! 🪁':G.skor>=10?'Tinggi banget! ☁️':'Benangnya nyangkut 😅',lsGet(G.hs))};
  return G}
// ---------- 8. MEMORI GENTENG ----------
function Memori(){const COL=['#E2574C','#3E8FC9','#F2C230','#2E9C6A','#8E5AA8','#E07A3E','#E58AA6','#1C2520'];const kartu=[...COL,...COL].sort(()=>Math.random()-.5).map(c=>({c,buka:false,ok:false,f:0}));
  const G={ph:'main',t:0,waktu:60,pilih:[],tunggu:0,skor:0,cocok:0,langkah:0,hs:'memori'};const X0=30,Y0=90,S=75;
  G.tap=(x,y)=>{if(G.ph==='end'){start('memori');return}if(G.tunggu>0||G.pilih.length>=2)return;const cx=Math.floor((x-X0)/S),cy=Math.floor((y-Y0)/S);if(cx<0||cx>3||cy<0||cy>3)return;const k=kartu[cy*4+cx];if(k.buka||k.ok)return;
    k.buka=true;G.pilih.push(k);SFX.klik();if(G.pilih.length===2){G.langkah++;const [a,b]=G.pilih;if(a.c===b.c){a.ok=b.ok=true;G.cocok++;G.pilih=[];SFX.ting();if(G.cocok===8){G.skor=G.cocok*10+Math.ceil(G.waktu);G.ph='end';SFX.dapat();catat(G.hs,G.skor)}}else G.tunggu=.7}};
  G.update=dt=>{if(G.ph!=='main')return;G.t+=dt;G.waktu-=dt;kartu.forEach(k=>k.f+=((k.buka||k.ok?1:0)-k.f)*Math.min(1,dt*12));if(G.tunggu>0){G.tunggu-=dt;if(G.tunggu<=0){G.pilih.forEach(k=>k.buka=false);G.pilih=[];SFX.salah()}}
    if(G.waktu<=0){G.waktu=0;G.skor=G.cocok*10;G.ph='end';SFX.habis();catat(G.hs,G.skor)}};
  G.draw=t=>{ctx.fillStyle='#F4EFE3';ctx.fillRect(0,0,W,H);txt('Cari pasangan genteng yang sama!',W/2,64,13,INK,'center',800,null);
    kartu.forEach((k,i)=>{const x=X0+(i%4)*S+4,y=Y0+Math.floor(i/4)*S+4,w=S-8,sc=Math.abs(Math.cos(k.f*Math.PI/2*2))||.05,cxp=x+w/2;ctx.save();ctx.translate(cxp,y+w/2);ctx.scale(Math.max(.06,Math.abs(1-2*k.f)),1);
      if(k.f>.5){rr(-w/2,-w/2,w,w,10,'#fff',INK);genteng(0,-4,40,k.c);ctx.fillStyle=k.c;ctx.fillRect(-14,10,28,14);ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.strokeRect(-14,10,28,14);if(k.ok){txt('✓',w/2-12,-w/2+12,14,'#2E9C6A','center',800,null)}}
      else{rr(-w/2,-w/2,w,w,10,HIJAU,INK);txt('?',0,2,28,KUNING,'center',800,null)}ctx.restore()});
    txt(`🃏 ${G.cocok}/8`,16,26,20,INK,'left',800,null);txt(`⏱ ${Math.ceil(G.waktu)}`,W-60,26,18,INK,'right',800,null);txt(`Langkah: ${G.langkah}`,W/2,H-24,13,INK,'center',700,null);
    if(G.ph==='end')endCard(`${G.skor} poin`,G.cocok===8?'Ingatan super! 🧠✨':'Hampir semua ketemu! 💪',lsGet(G.hs))};
  return G}
// ---------- kartu akhir ----------
function endCard(a,b,hs){ctx.fillStyle='rgba(14,21,18,.72)';ctx.fillRect(0,0,W,H);rr(40,92,280,330,22,KREM,INK);txt('SELESAI!',W/2,126,28,MERAH,'center',800,null);txt(a,W/2,166,22,INK,'center',800,null);txt(b,W/2,198,15,HIJAU,'center',700,null);txt('🏆 Rekor: '+hs+(game&&game.rankKu?` · Ranking #${game.rankKu}`:''),W/2,226,14,INK,'center',700,null);
  rr(58,242,244,124,12,'#fff');txt('📜 Riwayat poin terakhir',W/2,258,12,INK,'center',800,null);hGet(game.id).forEach((o,i)=>{const y=280+i*17;txt((i?'':'▶ ')+o.v+' '+({penalti:'gol',genteng:'genteng',ayam:'ayam'}[game.id]||'poin'),72,y,12,i?INK:MERAH,'left',800,null);txt(lalu(o.at),288,y,11,'#777','right',600,null)});
  BTN=[];btn(60,374,110,36,'🔁 Main lagi',()=>start(game.id),KUNING,14);btn(190,374,110,36,'🎮 Menu',()=>{game=null;SFX.klik()},'#fff',14)}
// ---------- loop ----------
function start(id,diam){if(!diam)SFX.klik();const f={penalti:Penalti,genteng:Genteng,pancing:Pancing,bakso:Bakso,ayam:Ayam,karung:Karung,layang:Layang,memori:Memori}[id];game=f();game.id=id}
function frame(ts){raf=requestAnimationFrame(frame);const dt=Math.min(.05,(ts-(last||ts))/1000);last=ts;const t=ts/1000;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);if(game&&game.id!=='bakso')BTN=[];if(!game){BTN=[];Menu.draw(t)}else{game.update(dt);game.draw(t)}
  if(game){BTN.push({x:W-48,y:44,w:40,h:28,fn:()=>{game=null;SFX.klik()}});if(!(game.id==='bakso'))rr(W-48,44,40,28,8,'rgba(255,255,255,.85)',INK);else rr(W-48,44,40,28,8,'#fff',INK);txt('☰',W-28,58,16,INK,'center',800,null)}}
function pos(e){const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]}
function down(e){e.preventDefault();au();const [x,y]=pos(e);for(const b of BTN.slice().reverse())if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.fn();return}if(game&&game.tap)game.tap(x,y)}
function move(e){const [x,y]=pos(e);if(!game)return;if(game.move)game.move(x,y)}
function up(){if(game&&game.up)game.up()}
function open(opt={}){if(root)return;OPT=opt||{};RANK=null;if(!document.getElementById('kns-css')){const s=document.createElement('style');s.id='kns-css';s.textContent=css;document.head.append(s)}
  root=document.createElement('div');root.className='kns';root.innerHTML=`<div class="kns-body">${opt.qa?'<span class="kns-qa">MODE UJI (QA)</span>':''}<div class="kns-top"><span class="kns-logo"><span class="kns-led"></span>playadalah<b>main</b></span><button type="button" class="kns-x" aria-label="Tutup">✕</button></div>
   <div class="kns-scr"><canvas width="${W}" height="${H}"></canvas></div><div class="kns-pad"><div class="kns-dpad"><i></i><i></i></div><div class="kns-btns"><span></span><span></span></div></div></div>`;
  document.body.append(root);cv=root.querySelector('canvas');dpr=Math.min(3,window.devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;ctx=cv.getContext('2d');
  cv.addEventListener('pointerdown',down);cv.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  {const bx=root.querySelector('.kns-x');let yakin=0;bx.onclick=()=>{const main=game&&game.id!=='rank'&&game.ph!=='end';if(!main||Date.now()<yakin){close();return}
    yakin=Date.now()+2500;bx.textContent='Keluar?';bx.style.width='auto';bx.style.padding='0 10px';bx.style.borderRadius='999px';setTimeout(()=>{if(root){bx.textContent='✕';bx.style.cssText=''}},2500)}}game=opt.game?null:null;last=0;raf=requestAnimationFrame(frame)}
function close(){cancelAnimationFrame(raf);window.removeEventListener('pointerup',up);if(root)root.remove();root=null;game=null}
window.KONSOL={open,close};
})();
