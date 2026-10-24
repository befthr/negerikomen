/* Liga Dusun — lapangan bola desa baru (QA). Dibuka lewat window.LIGA.open({tim,qa}).
   8 pertandingan sehari (13.00–20.00 WIB), tiap laga 30 menit. Hasil & pemain ditentukan dari tanggal+jam
   (seed), jadi semua perangkat melihat laga, skor, dan pencetak gol yang sama. Pemain tanpa wajah. Tanpa musik. */
(()=>{
const W=360,H=600,INK='#1C2520',KUNING='#F2C230',KREM='#F4EFE3';
const JAM=[13,14,15,16,17,18,19,20],DUR=30; // menit nyata per laga
const css=`.lg{position:fixed;inset:0;z-index:210;background:rgba(10,14,12,.88);display:flex;align-items:center;justify-content:center;padding:10px;touch-action:none}
.lg-b{width:min(420px,100%);max-height:100%;overflow:auto;background:#24402E;border:4px solid ${INK};border-radius:22px;padding:12px;box-shadow:0 10px 0 #0006;font-family:Poppins,system-ui,sans-serif;color:#fff}
.lg-t{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.lg-t b{font-size:17px}.lg-x{width:34px;height:34px;border-radius:50%;border:3px solid ${INK};background:${KREM};font-weight:800;cursor:pointer}
.lg canvas{display:block;width:100%;height:auto;border-radius:12px}.lg-qa{display:inline-block;background:#C4502F;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:800;margin-left:6px}
.lg-row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.lg-row button{flex:1;min-width:56px;border:2px solid ${INK};background:${KREM};color:${INK};border-radius:10px;padding:6px 4px;font:700 12px Poppins,sans-serif;cursor:pointer}.lg-row button.on{background:${KUNING}}
.lg-k{margin:10px 0 2px;font-size:11.5px;line-height:1.35;color:#ffffffcc}.lg-k b{color:#F2C230}
.lg-tab{display:flex;gap:6px;margin:12px 0 6px}.lg-tab button{flex:1;border:2px solid #1C2520;background:#ffffff14;color:#fff;border-radius:999px;padding:7px 8px;font:800 12.5px Poppins,sans-serif;cursor:pointer}.lg-tab button.on{background:#F2C230;color:#1C2520}
.lg h4{margin:12px 0 6px;font-size:13px;letter-spacing:.06em;color:${KUNING}}.lg table{width:100%;border-collapse:collapse;font-size:12.5px}.lg td,.lg th{padding:5px 4px;border-bottom:1px solid #ffffff22;text-align:center}.lg td:first-child,.lg th:first-child{text-align:left}
.lg .jd{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:8px;font-size:12.5px;cursor:pointer}.lg .jd.now{background:#ffffff22}.lg .jd:hover{background:#ffffff14}.lg .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;border:1.5px solid ${INK};vertical-align:-1px}`;
// ---------- acak berbenih ----------
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const rngOf=seed=>{let a=hash(seed)||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
const PAIR=[];for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)PAIR.push([i,j]);
const hariKe=ms=>Math.floor((ms+252e5)/864e5); // hari WIB sejak epoch
let TIM=[],OPT={},root,cv,ctx,dpr,raf,last=0,vt=0,speed=1,mute=false,ac=null,lastEv='',hari0=0;
// jadwal hari d slot s → pasangan tim (bergiliran supaya semua tim ketemu semua lawan)
function laga(d,s){const r=rngOf('liga'+d);const urut=PAIR.map((p,i)=>[r(),p]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);const p=urut[s%10];const sw=(d+s)%2;
  const A=sw?p[1]:p[0],B=sw?p[0]:p[1],R=rngOf('laga'+d+'-'+s);
  const pilih=k=>{const pool=TIM[k].pemain.slice();const out=[];while(out.length<11&&pool.length)out.push(pool.splice(Math.floor(R()*pool.length),1)[0]);while(out.length<11)out.push('warga'+(out.length+1));return out};
  const la=pilih(A),lb=pilih(B);const ga=Math.floor(Math.pow(R(),1.5)*4.4),gb=Math.floor(Math.pow(R(),1.5)*4.4);
  const gol=[];for(let i=0;i<ga;i++)gol.push({m:3+R()*85,t:0,n:la[5+Math.floor(R()*6)]});for(let i=0;i<gb;i++)gol.push({m:3+R()*85,t:1,n:lb[5+Math.floor(R()*6)]});gol.sort((a,b)=>a.m-b.m);
  // jaga jarak antar gol supaya animasi tidak tabrakan
  for(let i=1;i<gol.length;i++)if(gol[i].m-gol[i-1].m<4)gol[i].m=Math.min(89,gol[i-1].m+4);
  const ph=[...Array(8)].map(()=>R()*6.28);return {A,B,la,lb,gol,ga,gb,ph,d,s}}
// waktu virtual (WIB, ms). QA bisa mempercepat & lompat jam
const now=()=>vt;
function status(){const t=now(),d=hariKe(t),mnt=((t+252e5)%864e5)/6e4;for(let s=0;s<8;s++){const m0=JAM[s]*60;if(mnt>=m0&&mnt<m0+DUR)return {d,s,menit:(mnt-m0)/DUR*90,main:true}}
  const nx=JAM.findIndex(j=>j*60>mnt);return {d,s:nx,main:false,mnt}}
// ---------- klasemen dari semua laga yang sudah selesai sejak hari mulai ----------
function klasemen(){const st=TIM.map((t,k)=>({k,m:0,mn:0,s:0,k2:0,gf:0,ga:0,p:0}));const t=now(),d1=hariKe(t),mnt=((t+252e5)%864e5)/6e4;
  for(let d=hari0;d<=d1;d++)for(let s=0;s<8;s++){if(d===d1&&mnt<JAM[s]*60+DUR)continue;const L=laga(d,s),a=st[L.A],b=st[L.B];a.m++;b.m++;a.gf+=L.ga;a.ga+=L.gb;b.gf+=L.gb;b.ga+=L.ga;
    if(L.ga>L.gb){a.mn++;b.k2++;a.p+=3}else if(L.ga<L.gb){b.mn++;a.k2++;b.p+=3}else{a.s++;b.s++;a.p++;b.p++}}
  return st.sort((x,y)=>y.p-x.p||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf)}
// ---------- suara (efek saja) ----------
function au(){try{if(!ac)ac=new(window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume()}catch(e){}return ac}
function nz(d,v,f,q=.7){const a=au();if(!a||mute)return;const n=Math.floor(a.sampleRate*d),b=a.createBuffer(1,n,a.sampleRate),c=b.getChannelData(0);for(let i=0;i<n;i++)c[i]=Math.random()*2-1;
  const s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain(),t=a.currentTime;fl.type='bandpass';fl.frequency.value=f;fl.Q.value=q;s.buffer=b;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+d*.3);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(fl);fl.connect(g);g.connect(a.destination);s.start()}
function peluit(n=1){const a=au();if(!a||mute)return;for(let i=0;i<n;i++){const o=a.createOscillator(),g=a.createGain(),l=a.createOscillator(),lg=a.createGain(),t=a.currentTime+i*.45;o.frequency.value=2900;l.frequency.value=28;lg.gain.value=120;l.connect(lg);lg.connect(o.frequency);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.06,t+.02);g.gain.setValueAtTime(.06,t+.3);g.gain.exponentialRampToValueAtTime(.0001,t+.38);o.connect(g);g.connect(a.destination);o.start(t);l.start(t);o.stop(t+.4);l.stop(t+.4)}}
const SORAK=()=>{nz(2.2,.18,900,.5);nz(1.6,.1,1800,.8)};
// ---------- gambar ----------
const FX=24,FY=70,FW=W-48,FH=H-150; // lapangan (vertikal: tim A menyerang ke atas)
function rr(x,y,w,h,r,f,s){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(f){ctx.fillStyle=f;ctx.fill()}if(s){ctx.strokeStyle=s;ctx.lineWidth=2;ctx.stroke()}}
function txt(t,x,y,sz,c,al='center',w=800){ctx.font=`${w} ${sz}px Poppins,system-ui,sans-serif`;ctx.textAlign=al;ctx.textBaseline='middle';ctx.fillStyle=c;ctx.fillText(t,x,y)}
function orang(x,y,col,r=6){ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(x+1.5,y+3,r,r*.6,0,0,7);ctx.fill();ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#F1C9A0';ctx.beginPath();ctx.arc(x,y-1,r*.48,0,7);ctx.fill()}
function pemain(c,x,y,col,no,nama,k,lari){const tg=col==='#eee'||col==='#F4EFE3'?INK:'#fff';const ay=Math.sin(lari)*2.2;
  c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(x+1.5,y+10,8*k,3.5*k,0,0,7);c.fill();
  // kaki & celana
  c.fillStyle='#F1C9A0';c.fillRect(x-4*k,y+5*k+ay*k*.4,2.6*k,4.5*k);c.fillRect(x+1.4*k,y+5*k-ay*k*.4,2.6*k,4.5*k);c.fillStyle=INK;c.fillRect(x-4.6*k,y+9*k+ay*k*.4,3.4*k,1.8*k);c.fillRect(x+1.2*k,y+9*k-ay*k*.4,3.4*k,1.8*k);
  c.fillStyle='#1C2520';c.beginPath();c.roundRect(x-5*k,y+2.5*k,10*k,4*k,1.5*k);c.fill();
  // lengan & jersey
  c.fillStyle=col;c.strokeStyle=INK;c.lineWidth=1.2;c.beginPath();c.roundRect(x-8*k,y-5*k-ay*k*.3,3.2*k,6*k,1.5*k);c.fill();c.stroke();c.beginPath();c.roundRect(x+4.8*k,y-5*k+ay*k*.3,3.2*k,6*k,1.5*k);c.fill();c.stroke();
  c.beginPath();c.roundRect(x-5.5*k,y-6*k,11*k,10*k,3*k);c.fill();c.stroke();
  c.fillStyle=tg;c.font=`800 ${6.5*k}px Poppins,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(no,x,y-.8*k);
  // kepala tanpa wajah
  c.fillStyle='#F1C9A0';c.beginPath();c.arc(x,y-9.5*k,3.8*k,0,7);c.fill();c.stroke();c.fillStyle='#3A2A1E';c.beginPath();c.arc(x,y-10.6*k,3.6*k,Math.PI,0);c.fill();
  if(nama){const t=nama.length>11?nama.slice(0,10)+'…':nama;c.font=`700 ${5.6*k}px Poppins,sans-serif`;const w=c.measureText(t).width+5;c.fillStyle='rgba(28,37,32,.72)';c.beginPath();c.roundRect(x-w/2,y+12*k,w,8*k,3);c.fill();c.fillStyle='#fff';c.fillText(t,x,y+16.2*k)}}
const NOMOR=[1,2,4,5,3,6,8,10,7,9,11];
const FORM=[[.5,.95],[.15,.78],[.38,.8],[.62,.8],[.85,.78],[.2,.6],[.42,.62],[.58,.62],[.8,.6],[.38,.45],[.62,.45]];
function bolaDi(L,m){const s=(k,a)=>Math.sin(m*a+L.ph[k]);let x=.5+.32*s(0,.21)+.1*s(1,.67),y=.5+.3*s(2,.17)+.1*s(3,.53);
  for(const g of L.gol){const dt=g.m-m;if(dt>=0&&dt<1.6){const u=1-dt/1.6;const gy=g.t===0?-.02:1.02;x=x+(.5-x)*u;y=y+(gy-y)*u*u}else if(dt<0&&dt>-1.2){return {x:.5,y:g.t===0?-.03:1.03,net:true}}else if(dt<=-1.2&&dt>-2){const u=(-dt-1.2)/.8;return {x:.5,y:(g.t===0?-.03:1.03)*(1-u)+.5*u}}}
  return {x:Math.max(.04,Math.min(.96,x)),y:Math.max(.03,Math.min(.97,y))}}
function draw(t){const st=status(),jamN=((now()+252e5)%864e5)/36e5,malam=jamN>=18||jamN<5.5,sepi=!st.main&&(jamN>=21||jamN<6);
  ctx.fillStyle='#2F5E3A';ctx.fillRect(0,0,W,H);
  // penonton
  for(let i=0;i<26;i++){const c=['#F2C230','#E58AA6','#8E5AA8','#F4EFE3','#2F9E6A','#E07A3E','#3E8FC9'][i%7];const hop=st.main&&lastEv&&(t*8+i)%6<1?2:0;orang(14+i*12.8,FY-14-hop,c,4.5);orang(14+i*12.8,FY+FH+14-hop,['#3E8FC9','#F2C230','#C4402F','#F4EFE3'][i%4],4.5)}
  for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#5DAA55':'#54A04D';ctx.fillRect(FX,FY+i*FH/10,FW,FH/10)}
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(FX+4,FY+4,FW-8,FH-8);ctx.beginPath();ctx.moveTo(FX+4,FY+FH/2);ctx.lineTo(FX+FW-4,FY+FH/2);ctx.stroke();ctx.beginPath();ctx.arc(W/2,FY+FH/2,36,0,7);ctx.stroke();
  ctx.strokeRect(W/2-60,FY+4,120,50);ctx.strokeRect(W/2-60,FY+FH-54,120,50);ctx.fillStyle='#fff';ctx.fillRect(W/2-26,FY-2,52,6);ctx.fillRect(W/2-26,FY+FH-4,52,6);
  if(malam&&sepi){ctx.fillStyle='rgba(8,14,36,.55)';ctx.fillRect(0,0,W,H)}else if(malam){ctx.fillStyle='rgba(10,20,50,.35)';ctx.fillRect(0,0,W,H);[[FX-6,FY-6],[FX+FW+6,FY-6],[FX-6,FY+FH+6],[FX+FW+6,FY+FH+6]].forEach(([x,y])=>{const g=ctx.createRadialGradient(x,y,2,x,y,160);g.addColorStop(0,'rgba(255,245,200,.55)');g.addColorStop(1,'rgba(255,245,200,0)');ctx.fillStyle=g;ctx.fillRect(x-160,y-160,320,320);ctx.fillStyle='#ddd';ctx.fillRect(x-4,y-4,8,8)})}
  const P=(x,y)=>[FX+x*FW,FY+y*FH];
  if(st.main){const L=laga(st.d,st.s),m=st.menit,b=bolaDi(L,m);
    // pemain mengikuti bola dari posisi formasi; yang terdekat mengejar
    [[L.A,0],[L.B,1]].forEach(([k,side])=>{const col=TIM[k].col;let best=-1,bd=9;const pos=FORM.map((f,i)=>{let hx=f[0],hy=side?1-f[1]:f[1];const w=i===0?.08:i<5?.25:i<9?.4:.35;
        let x=hx+(b.x-hx)*w+.02*Math.sin(m*1.7+i+side*3),y=hy+(b.y-hy)*w*.8+.02*Math.cos(m*1.3+i*2+side);if(i===0)y=side?Math.min(.1,y):Math.max(.9,y);const dd=Math.hypot(x-b.x,y-b.y);if(i&&dd<bd){bd=dd;best=i}return [x,y]});
      if(best>0&&!b.net){pos[best]=[b.x+(side?.02:-.02),b.y+(side?-.03:.03)]}const nm=side?L.lb:L.la;pos.forEach(([x,y],i)=>{const [px,py]=P(x,y);pemain(ctx,px,py,i===0?(side?'#333':'#eee'):col,NOMOR[i],nm[i],.95,performance.now()/80+i*1.3)})});
    const [bx,by]=P(b.x,b.y);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(bx,by,4,0,7);ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=1.5;ctx.stroke();
    const sa=L.gol.filter(g=>g.t===0&&g.m<=m).length,sb=L.gol.filter(g=>g.t===1&&g.m<=m).length;
    // kejadian: gol, peluit
    const ev=L.gol.find(g=>m-g.m>=0&&m-g.m<3.5);const key=ev?L.d+'-'+L.s+'-'+ev.m:'';if(key&&key!==lastEv){lastEv=key;SORAK();peluit(1)}if(!key)lastEv='';
    rr(10,8,W-20,46,10,INK);ctx.fillStyle=TIM[L.A].col;ctx.fillRect(16,14,8,34);ctx.fillStyle=TIM[L.B].col;ctx.fillRect(W-24,14,8,34);
    txt(TIM[L.A].nama,30,22,12,'#fff','left');txt(TIM[L.B].nama,W-30,22,12,'#fff','right');txt(`${sa} – ${sb}`,W/2,31,24,KUNING);txt(`${Math.min(90,Math.floor(m))}'`,W/2,47,10,'#9effa0');
    txt('⚽ menyerang ke atas',30,40,9,'#ffffffaa','left',600);
    if(ev){rr(40,FY+FH/2-34,W-80,68,14,KUNING,INK);txt('GOOOL!',W/2,FY+FH/2-12,24,INK);txt('@'+ev.n+' · '+TIM[ev.t?L.B:L.A].nama,W/2,FY+FH/2+16,11,INK,'center',700)}
    const lg=L.gol.filter(g=>g.m<=m);txt(lg.length?'⚽ '+lg.map(g=>'@'+g.n+" "+Math.floor(g.m)+"'").join(' · '):'Belum ada gol',W/2,H-28,10,'#fff','center',600)}
  else{rr(10,8,W-20,46,10,INK);if(st.s>=0){const L=laga(st.d,st.s);txt('Laga berikutnya '+String(JAM[st.s]).padStart(2,'0')+'.00',W/2,20,11,'#9effa0');txt(`${TIM[L.A].nama}  vs  ${TIM[L.B].nama}`,W/2,40,14,KUNING)}
    else{txt('Laga hari ini selesai',W/2,22,12,'#9effa0');txt('Besok mulai 13.00',W/2,40,14,KUNING)}
    if(!sepi){pemain(ctx,W/2-30,FY+FH/2+60,'#E07A3E','',null,.8,t*10);pemain(ctx,W/2+10,FY+FH/2+40,'#8E5AA8','',null,.8,t*10+2);}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(W/2-8+(sepi?0:Math.sin(t*2)*14),FY+FH/2+52,4,0,7);ctx.fill();
    txt(sepi?'Lapangan tutup · warga sudah tidur 😴':'Lapangan sepi · anak-anak main sendiri',W/2,H-28,10,'#ffffffcc','center',600)}
  const jam=new Date(now()+252e5);txt('🕒 '+String(jam.getUTCHours()).padStart(2,'0')+'.'+String(jam.getUTCMinutes()).padStart(2,'0')+' WIB'+(OPT.qa&&speed>1?` · ⏩ x${speed}`:''),W/2,H-10,10,'#ffffffaa','center',600)}
// ---------- panel bawah: jadwal & klasemen ----------
let panel,pk=0,tab='jadwal';function isiPanel(){if(!panel)return;const st=status(),d=hariKe(now());panel.innerHTML='';
  const tbr=document.createElement('div');tbr.className='lg-tab';[['jadwal','📅 Jadwal hari ini'],['klas','🏆 Klasemen']].forEach(([k,t])=>{const b=document.createElement('button');b.textContent=t;if(tab===k)b.className='on';b.onclick=()=>{tab=k;isiPanel()};tbr.append(b)});panel.append(tbr);
  const j=document.createElement('div');j.hidden=tab!=='jadwal';JAM.forEach((h,s)=>{const L=laga(d,s),r=document.createElement('div');r.className='jd'+(st.main&&st.s===s?' now':'');
    const sel=((now()+252e5)%864e5)/6e4>=h*60+DUR;r.innerHTML=`<span>${String(h).padStart(2,'0')}.00</span><span><i class="dot" style="background:${TIM[L.A].col}"></i>${TIM[L.A].nama} ${sel?`<b>${L.ga}–${L.gb}</b>`:'vs'} ${TIM[L.B].nama}<i class="dot" style="background:${TIM[L.B].col};margin:0 0 0 5px"></i></span>`;
    if(OPT.qa)r.onclick=()=>{lompat(h,0)};j.append(r)});panel.append(j);
  const k=document.createElement('div');k.hidden=tab!=='klas';const tb=document.createElement('table');tb.innerHTML='<tr><th>Tim</th><th>M</th><th>Mn</th><th>S</th><th>K</th><th>GD</th><th>Poin</th></tr>';
  klasemen().forEach(o=>{const tr=document.createElement('tr');tr.innerHTML=`<td><i class="dot" style="background:${TIM[o.k].col}"></i>${TIM[o.k].nama}</td><td>${o.m}</td><td>${o.mn}</td><td>${o.s}</td><td>${o.k2}</td><td>${o.gf-o.ga}</td><td><b>${o.p}</b></td>`;tb.append(tr)});k.append(tb);panel.append(k)}
function lompat(h,mm){const d=hariKe(now());vt=d*864e5-252e5+(h*60+mm)*6e4;lastEv='';isiPanel()}
function frame(ts){raf=requestAnimationFrame(frame);const dt=Math.min(.1,(ts-(last||ts))/1000);last=ts;vt+=dt*1000*speed;ctx.setTransform(dpr,0,0,dpr,0,0);draw(ts/1000);if((pk+=dt)>1){pk=0;isiPanel()}}
function open(opt={}){if(root)return;OPT=opt;TIM=opt.tim||[];vt=Date.now();speed=1;hari0=opt.mulai?hariKe(Date.parse(opt.mulai)):hariKe(vt);
  if(!document.getElementById('lg-css')){const s=document.createElement('style');s.id='lg-css';s.textContent=css;document.head.append(s)}
  root=document.createElement('div');root.className='lg';root.innerHTML=`<div class="lg-b"><div class="lg-t"><b>⚽ Liga Dusun${opt.qa?'<span class="lg-qa">MODE UJI (QA)</span>':''}</b><span><button class="lg-x lg-m" title="Suara">🔊</button> <button class="lg-x lg-c" aria-label="Tutup">✕</button></span></div><canvas width="${W}" height="${H}"></canvas>
   ${opt.qa?'<p class="lg-k">⏩ <b>Kecepatan waktu</b> · x30 = 1 laga (30 menit) selesai dalam 1 menit. Khusus QA, warga nggak lihat tombol ini.</p><div class="lg-row lg-sp"><button data-s="1" class="on">x1</button><button data-s="30">x30</button><button data-s="120">x120</button><button data-j="1" title="Lompat ke laga yang sedang/akan main">Laga sekarang ▶</button></div><p class="lg-k">🕒 <b>Lompat ke laga jam…</b> · langsung nonton laga di jam itu dari menit awal.</p><div class="lg-row lg-jm">'+JAM.map(h=>`<button data-h="${h}">${h}.00</button>`).join('')+'</div>':''}<div class="lg-p"></div></div>`;
  document.body.append(root);cv=root.querySelector('canvas');dpr=Math.min(3,window.devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;ctx=cv.getContext('2d');panel=root.querySelector('.lg-p');
  root.querySelector('.lg-c').onclick=close;root.addEventListener('pointerdown',e=>{au();if(e.target===root)close()});
  root.querySelector('.lg-m').onclick=e=>{mute=!mute;e.target.textContent=mute?'🔇':'🔊'};
  root.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{speed=+b.dataset.s;root.querySelectorAll('[data-s]').forEach(x=>x.classList.toggle('on',x===b))});
  root.querySelectorAll('[data-h]').forEach(b=>b.onclick=()=>{lompat(+b.dataset.h,0);peluit(1)});
  const jn=root.querySelector('[data-j]');if(jn)jn.onclick=()=>{const st=status();if(!st.main){const h=JAM[st.s>=0?st.s:0];lompat(h,0);peluit(1)}};
  if(opt.qa&&!status().main){const st=status();lompat(st.s>=0?JAM[st.s]:20,st.s>=0?0:2)}
  isiPanel();last=0;raf=requestAnimationFrame(frame)}
function close(){cancelAnimationFrame(raf);if(root)root.remove();root=null}
function liveAt(ms){const d=hariKe(ms),mnt=((ms+252e5)%864e5)/6e4;for(let s=0;s<8;s++){const m0=JAM[s]*60;if(mnt>=m0&&mnt<m0+DUR)return {main:true,L:laga(d,s),menit:(mnt-m0)/DUR*90}}const nx=JAM.findIndex(j=>j*60>mnt);return {main:false,next:nx>=0?{jam:JAM[nx],L:laga(d,nx)}:null}}
function drawMini(c,x,y,w,h,ms){const st=liveAt(ms);if(!st.main)return st;const L=st.L,m=st.menit,b=bolaDi(L,m);const P=(u,v)=>[x+u*w,y+v*h];
  const o=(px,py,col,r)=>{c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(px+r*.3,py+r*.5,r,r*.6,0,0,7);c.fill();c.fillStyle=col;c.beginPath();c.arc(px,py,r,0,7);c.fill();c.fillStyle='#F1C9A0';c.beginPath();c.arc(px,py-r*.15,r*.45,0,7);c.fill()};
  const r=Math.max(2.2,w*.022),kk=w/300;[[L.A,0],[L.B,1]].forEach(([k,side])=>{const nm=side?L.lb:L.la;FORM.forEach((f,i)=>{const hx=f[0],hy=side?1-f[1]:f[1],wt=i===0?.08:i<5?.25:i<9?.4:.35;let px=hx+(b.x-hx)*wt+.02*Math.sin(m*1.7+i+side*3),py=hy+(b.y-hy)*wt*.8+.02*Math.cos(m*1.3+i*2+side);if(i===0)py=side?Math.min(.1,py):Math.max(.9,py);const [X,Y]=P(px,py);c.save();c.translate(X,Y);c.rotate(-Math.PI/2);pemain(c,0,0,i===0?(side?'#333':'#eee'):TIM[k].col,NOMOR[i],nm[i],kk,performance.now()/80+i*1.3);c.restore()})});
  const [bx,by]=P(b.x,b.y);c.fillStyle='#fff';c.beginPath();c.arc(bx,by,r*.7,0,7);c.fill();
  st.sa=L.gol.filter(g=>g.t===0&&g.m<=m).length;st.sb=L.gol.filter(g=>g.t===1&&g.m<=m).length;st.gol=L.gol.find(g=>m-g.m>=0&&m-g.m<3.5);return st}
window.LIGA={open,close,laga,klasemen,liveAt,drawMini,setTim:t=>{TIM=t},tim:()=>TIM};
})();
