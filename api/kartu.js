// Kartu Komen: bukti "ini rumahku" untuk tiap warga.
// Alur: web minta kunci (mis. "kunci genteng merah 27") → warga komen kunci itu di postingan Kartu Komen (di-pin)
// atau video terbaru → server cek komentar lewat Instagram API → kartu (token sesi) tersimpan di perangkat warga.
// Database: Upstash Redis lewat env KV_REST_API_URL + KV_REST_API_TOKEN (dipasang otomatis oleh Vercel).
//
// Aksi (?aksi=...):
//   GET  pilihan              → versi rumah yang dipilih warga + aktif (postingan #kartukomen sudah ada?)
//   POST kunci   {u}          → buat kunci baru (berlaku 30 menit)
//   POST cek     {u}          → cari komentar kunci; kalau cocok → {token}
//   GET  saya    (Bearer)     → info kartu: jatah ganti minggu ini, versi dipakai, admin?
//   POST pilih   {n} (Bearer) → pakai versi rumah ke-n (jatah 3x per minggu, reset Senin 00.00 WIB)
//   POST keluar-lain (Bearer) → keluarkan semua perangkat lain
//   POST keluar  (Bearer)     → keluarkan perangkat ini
//   POST aktifkan {target} (Bearer kartu @negerikomen) → token aktivasi manual (jalur cadangan lewat DM)
//   POST minta-ubah {jenis,...} (Bearer) → kode pesanan; warga traktir Genteng dengan kode itu di pesan traktiran
//        jenis: warna {wall,roof,n} 1 Genteng · emas 2 Genteng · ruko {wall,roof} 20 Genteng · item {items:[id],teks} sesuai katalog
//        (minta-warna lama tetap jalan = minta-ubah jenis warna)
//   POST batal-ubah {jenis} (Bearer) → batalkan pesanan jenis itu
//   POST jalan {id} (Bearer) → motor/sepeda yang dipajang langsung keliling kampung (jeda 60 detik)
//   POST pajang {ids} (Bearer) → pilih maks 3 item koleksi yang tampil di pekarangan
//   POST cicil {kode,n} (Bearer kartu @negerikomen) → catat Genteng cicilan yang sudah masuk untuk pesanan itu
//   POST tanpa-kode {hapus?} (Bearer kartu @negerikomen) → traktiran dari webhook Trakteer yang tidak memuat kode pesanan
//   POST bayar-saldo {kode} (Bearer) → lunasi pesanan pakai Saldo Genteng
//   POST tambah-saldo {target,n,hapus?} (Bearer kartu @negerikomen) → masukkan traktiran tanpa kode ke saldo warga
//   POST cari-kode {kode} (Bearer kartu @negerikomen) → cari pesanan lewat kode, termasuk yang dibatalkan/diganti warga
//   POST antre-ubah / konfirmasi-ubah {kode,ok} (Bearer kartu @negerikomen) → cek & setujui pesanan
//   POST reset-jatah {target} (Bearer kartu @negerikomen) → kembalikan jatah ganti rumah warga minggu ini
import crypto from 'crypto';
import { terapkan, bolehOtomatis } from './_terapkan.js';
import { EKS } from './_kavling.js';
// ===== Jasa Pindahan Pak Kades =====
const PINDAH = { truk: { harga: 3, dur: 1800 }, heli: { harga: 8, dur: 180 } }; // Truk Titut 30 mnt (kavling biasa) · Helikoper 3 mnt (kavling mana pun, termasuk eksklusif)
const JEDA_PINDAH = 7 * 864e2; // boleh pindah lagi setelah 7 hari
const JALUR_K = { bx0: -3, bx1: -1, by0: 6, by1: 11 }, KC = 45, KS = 6;
const md = (a, m) => ((a % m) + m) % m;
function diJalurK(x, y) { const bx = Math.floor((x - KC) / KS), by = Math.floor((y - KC) / KS); if (bx < JALUR_K.bx0 || bx > JALUR_K.bx1 || by < JALUR_K.by0 || by > JALUR_K.by1) return false;
  const lx = md(x - KC, KS), ly = md(y - KC, KS); return lx >= 1 && lx <= 5 && ly >= 1 && ly <= 5 && (lx === 1 || lx === 5 || ly === 1 || ly === 5) }
const eksDi = (x, y) => EKS.find(e => e.x === x && e.y === y) || null;
async function pindahSemua() { const a = await kv(['HGETALL', 'pindah']) || [], o = {}; for (let i = 0; i + 1 < a.length; i += 2) { const v = jparse(a[i + 1]); if (v) o[a[i]] = v } return o }
// ===== Reaksi Rumah + Buku Tamu + Tetangga Idaman =====
const RX = { mantap: 1, genteng: 2, tetangga: 3 }; // poin mingguan Tetangga Idaman
const hariWIB = (now = Date.now()) => { const w = new Date(now + 7 * 3600e3); return w.getUTCFullYear() + '-' + String(w.getUTCMonth() + 1).padStart(2, '0') + '-' + String(w.getUTCDate()).padStart(2, '0') };
const KASAR = ['anjing','anjg','anjir','anjrit','bangsat','bajingan','babi','kontol','kntl','memek','mmk','ngentot','entot','ngewe','jancok','jancuk','jancik','asu','goblok','goblog','tolol','bego','idiot','kampret','tai','taik','brengsek','pantek','puki','pukimak','lonte','pelacur','sundal','perek','bencong','jembut','peler','toket','sange','colmek','coli','bokep','porno','bugil','telanjang','fuck','fck','shit','bitch','dick','pussy','asshole','nigga','nigger','kafir','bunuh','mampus','modar','setan','iblis','bodoh','dongo','cupu','sialan','keparat','laknat','bacot','bacod','tetek','pepek','itil','silit'];
const KASAR_SUB = ['anjing','goblok','tolol','brengsek','kampret','pantek','lonte','kontol','memek','ngentot','bangsat','bajingan','pukimak','jancok','jancuk','ngewe','pelacur','jembut','colmek','bokep','pepek'];
function pesanKasar(t) { const n = String(t || '').toLowerCase().replace(/[0@4]/g, m => ({ '0': 'o', '@': 'a', '4': 'a' })[m]).replace(/1|!/g, 'i').replace(/3/g, 'e').replace(/5|\$/g, 's').replace(/7/g, 't').replace(/(.)\1{2,}/g, '$1$1');
  const kata = n.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.replace(/(.)\1+/g, '$1')); const rapat = n.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  return kata.some(w => KASAR.includes(w)) || KASAR_SUB.some(k => rapat.includes(k.replace(/(.)\1+/g, '$1'))) }
async function papanIdaman(w0) { const [p, t] = await kvMany([['HGETALL', 'rx:w:' + w0 + ':p'], ['HGETALL', 'rx:w:' + w0 + ':t']]); const P = {}, Tm = {};
  for (let i = 0; p && i + 1 < p.length; i += 2) P[p[i]] = +p[i + 1] || 0; for (let i = 0; t && i + 1 < t.length; i += 2) Tm[t[i]] = +t[i + 1] || 0;
  return Object.keys(P).filter(u => P[u] > 0).sort((a, b) => P[b] - P[a] || (Tm[a] || 0) - (Tm[b] || 0)).slice(0, 3).map(u => ({ u, poin: P[u] })) }
async function tiketKu(u) { const [t, h] = await kv(['HMGET', 'tiket', u + ':truk', u + ':heli']) || []; return { truk: +t || 0, heli: +h || 0 } }
async function heliTerjual() { const a = await kv(['HGETALL', 'tiket']) || []; let n = 0; for (let i = 0; i + 1 < a.length; i += 2) if (String(a[i]).endsWith(':heli')) n += Math.max(0, +a[i + 1] || 0); return n }

const KV_URL = String(process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const KV_TOKEN = String(process.env.KV_REST_API_TOKEN || '');
const IG_TOKEN = String(process.env.IG_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const OWNER = 'negerikomen';
const LOKER_NEGERI = { rental: { tutup: Date.UTC(2026, 9, 30, 17, 0) }, proyek: { tutup: Date.UTC(2026, 9, 30, 17, 0) } }; // tutup Jumat 30 Okt 24.00 WIB
const PENANDA = 'kartukomen'; // hashtag di caption postingan Kartu Komen yang di-pin
const KUNCI_DETIK = 30 * 60;
const SESI_DETIK = 400 * 24 * 3600;
const JATAH = 3;

const BENDA = ['genteng', 'ayam', 'sawah', 'kentongan', 'bakso', 'tugu', 'sepeda', 'layangan', 'kerupuk', 'payung',
  'bebek', 'kelinci', 'sapi', 'pohon', 'sumur', 'gerobak', 'bambu', 'bendera', 'kelereng', 'jagung', 'pisang', 'kucing', 'perahu', 'gasing'];
const WARNA = ['merah', 'biru', 'hijau', 'kuning', 'ungu', 'putih', 'hitam', 'oranye', 'pink', 'coklat', 'emas', 'abu'];

async function kv(cmd) {
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('db: ' + (j.error || r.status));
  return j.result;
}
async function kvMany(cmds) {
  const r = await fetch(KV_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await r.json().catch(() => []);
  if (!r.ok) throw new Error('db: ' + r.status);
  return j.map(x => x && x.result);
}
const jparse = s => { try { return s ? JSON.parse(s) : null } catch (e) { return null } };
const cleanU = u => String(u || '').trim().replace(/^@/, '').toLowerCase();
const okU = u => /^[a-z0-9._]{1,30}$/.test(u);
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// data kampung dari data.js milik situs ini (cache 60 detik)
let DATA = null, DATA_AT = 0;
async function dataKampung(req) {
  if (DATA && Date.now() - DATA_AT < 60000) return DATA;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const t = await (await fetch('https://' + host + '/data.js?v=' + Math.floor(Date.now() / 60000))).text();
  DATA = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); DATA_AT = Date.now();
  return DATA;
}
function warga(D, u) { return (D.residents || []).find(r => String(r.name).toLowerCase() === u) || null }
// warna tambahan hasil traktir (disimpan di database) digabung ke riwayat rumah dari data.js
async function wargaPlus(D, u, extra) {
  const r = warga(D, u); if (!r) return null;
  const ex = extra !== undefined ? extra : (jparse(await kv(['HGET', 'warnaplus', u])) || []);
  if (!ex.length) return r;
  return { ...r, history: [...(r.history || []), ...ex.map(e => ({ ...e, x: 1 }))] };
}
const WARNA_OK = ['merah','merah muda','biru','biru muda','hijau','hijau muda','kuning','oranye','ungu','ungu muda','coklat','hitam','abu-abu','putih','emas','tosca','navy','krem','marun','terakota'];
const okWarna = w => WARNA_OK.includes(w) || /^#[0-9a-fA-F]{6}$/.test(String(w || ''));
// pesanan ubah rumah & item (harga dalam Genteng)
const JENIS = { warna: { awal: 'WARNA', harga: 1 }, emas: { awal: 'EMAS', harga: 2 }, ruko: { awal: 'RUKO', harga: 20 }, item: { awal: 'ITEM', harga: 0 }, tingkat: { awal: 'TINGKAT', harga: 0 } };
const HARGA_TINGKAT = (mau, kini) => mau === 2 ? 10 : (kini >= 2 ? 4 : 14); // tingkat 2: 10 Receh · tingkat 3: 14 Receh (naik dari tingkat 2: 4 Receh)
const GAJI = 2; // gaji karyawan fasilitas per pekan (Receh)
const KONSOL_G = ['penalti', 'genteng', 'pancing', 'bakso', 'ayam', 'karung', 'layang', 'memori', 'pinang', 'kentongan', 'karet', 'pesawat', 'tambang', 'egrang'];
const KONSOL_MAX = { penalti: 5, genteng: 800, pancing: 400, bakso: 900, ayam: 400, karung: 80, layang: 600, memori: 140, pinang: 40, kentongan: 80, karet: 400, pesawat: 3000, tambang: 60, egrang: 5000 };
const KATALOG = { sepeda: 2, motor: 4, ayam: 1, kucing: 2, kambing: 2, lampu: 1, mangga: 1, kolam: 2, ayunan: 2, papan: 2, robot: 22, patromax: 12, sorot: 19, konsol: 4, bougenville: 2 };
const MAKS_PAJANG = 3;
// karyawan bangunan milik warga: pemilik atur sendiri dari Kartu Komen (tanpa gaji; bonus Receh opsional dari Recehan pemilik)
const MAKS_STAF = 3, KONTRAK_HARI = 30, KONTRAK_OK = [7, 14, 30]; const hariK = v => { const h = +String(v || '').split(':')[0]; return KONTRAK_OK.includes(h) ? h : KONTRAK_HARI };
const GAJI_OK = [0, 1, 2, 3]; const gajiK = v => { const g = +String(v || '').split(':')[1]; return GAJI_OK.includes(g) ? g : 0 };
const PEKAN = h => h === 7 ? 1 : h === 14 ? 2 : 4; // gaji dibayar di awal tiap pekan kontrak (hari 0, 7, 14, 21)
// gaji karyawan swasta: disetor penuh oleh bos saat karyawan diterima, cair otomatis tiap pekan (dicek saat peta dibuka)
async function cairkanGaji() {
  if (!(await kv(['SET', 'gaji:lock', '1', 'NX', 'EX', 30]))) return;
  try {
    const raw = await kv(['HGETALL', 'stafplus']) || [], now = Date.now(), tulis = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const key = raw[i], L = jparse(raw[i + 1]); if (!Array.isArray(L)) continue; let ubah = false;
      for (const x of L) {
        if (!x || !(x.gaji > 0) || !x.at) continue;
        const due = Math.min(x.pekan || 1, Math.floor((now - x.at) / (7 * 864e5)) + 1), sudah = +x.dibayar || 0;
        if (due <= sudah) continue; const n = (due - sudah) * x.gaji;
        tulis.push(['HINCRBY', 'saldo', x.user, n], ['LPUSH', 'saldo:log:' + x.user, JSON.stringify({ at: now, n, ket: 'gaji: dari @' + (x.bos || '') + ' (' + (x.tempat || 'tempat kerja') + ')' })], ['LTRIM', 'saldo:log:' + x.user, 0, 49]);
        x.dibayar = due; ubah = true;
      }
      if (ubah) tulis.push(['HSET', 'stafplus', key, JSON.stringify(L)]);
    }
    if (tulis.length) await kvMany(tulis);
  } finally { await kv(['DEL', 'gaji:lock']) }
} // kontrak karyawan 30 hari; tidak bisa diberhentikan (biar tidak ada konflik), lepas otomatis saat kontrak habis
const tglWIB = (plus = 0) => new Date(Date.now() + 7 * 3600e3 + plus * 864e5).toISOString().slice(0, 10);
const stafAktif = L => (Array.isArray(L) ? L : []).filter(x => x && x.user && (!x.until || x.until >= tglWIB()));
const ROLE_B = { penginapan: ['Resepsionis', 'Satpam', 'Pelayan', 'Tukang Kebun'], sekolah: ['Guru', 'Satpam', 'Penjaga Kantin', 'Tukang Kebun'],
  puskesmas: ['Perawat', 'Satpam', 'Petugas Apotek', 'Petugas Kebersihan'], tk: ['Guru TK', 'Satpam', 'Penjaga Kantin'] };
const ROLE_DEF = ['Karyawan', 'Satpam', 'Petugas Kebersihan'];
const bKey = b => b.type + '@' + b.x + ',' + b.y;
const milikWarga = (D, u) => (D.buildings || []).filter(b => b && b.by && String(b.by).toLowerCase() === u && u !== OWNER);
const VWARNA = ['merah', 'biru', 'hijau', 'kuning', 'hitam', 'putih', 'pink', 'ungu', 'oranye']; // warna motor & sepeda
const ULANG = ['papan', 'motor', 'sepeda']; // boleh dibeli lagi untuk ganti tulisan/warna
const okTeks = t => /^[\p{L}\p{N} .,'!&\-]{1,20}$/u.test(t);
// pesanan yang menunggu disimpan tanpa batas waktu (boleh dicicil kapan saja); selesai/batal tetap dibersihkan
const EXP = j => [];
async function simpanStatus(jenis, kode, status) {
  const v = jparse(await kv(['GET', jenis + ':req:' + kode]));
  if (v && v.status === 'menunggu') await kv(['SET', jenis + ':req:' + kode, JSON.stringify({ ...v, status, ubah: Date.now() }), ...EXP(jenis)]);
}
// Robot Raksasa: cuma 1 di seluruh kampung. Dipesan → dikunci 14 hari untuk pemesannya; lunas → milik permanen.
const ROBOT = 'robot:pemilik';
async function lepasRobot(u) { for (const ek of ['robot', 'patromax', 'sorot']) { if ((await kv(['GET', ek + ':pemilik'])) !== u) continue; const k = await koleksi(u); if (!k.own.some(o => o.id === ek)) await kv(['DEL', ek + ':pemilik']) } }
async function koleksi(u) { const v = jparse(await kv(['HGET', 'itemplus', u])); return v && Array.isArray(v.own) ? v : { own: [], pajang: [] } }
const hariIni = () => { const w = new Date(Date.now() + 7 * 3600e3); return Math.round((Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - Date.UTC(2026, 9, 18)) / 864e5) };

// SAMA dengan histOf() di index.html: versi tampilan rumah (warna & bentuk) dari hari ke hari
const LOOK = ['roof', 'wall', 'style'];
const sameLook = (a, b) => LOOK.every(k => (a[k] == null ? null : a[k]) === (b[k] == null ? null : b[k]));
function histOf(r) {
  const d0 = +r.day || 1, ev = [], B = r.base || {};
  if (r.style && !(r.history || []).some(h => h && 'style' in h)) ev.push({ day: +r.styleDay || 3, set: { style: r.style, roof: r.roof, wall: r.wall } });
  if (r.custom && r.custom.title) ev.push({ day: +r.custom.day || d0, set: { roof: r.roof, wall: r.wall } });
  (Array.isArray(r.history) ? r.history : []).forEach(h => { if (!h || h.x) return; const set = {}; LOOK.forEach(k => { if (k in h) set[k] = h[k] }); ev.push({ day: +h.day || d0, set, h: 1 }) });
  ev.forEach((e, k) => e.k = k); ev.sort((a, b) => a.day - b.day || a.k - b.k);
  let look = { roof: 'roof' in B ? B.roof : r.roof, wall: 'wall' in B ? B.wall : r.wall, style: 'style' in B ? B.style : null };
  const V = [{ day: d0, look: { ...look } }];
  ev.forEach(e => {
    look = Object.assign({}, look, e.set); const day = Math.max(e.day, d0), last = V[V.length - 1];
    if (sameLook(look, last.look)) return;
    if (V.length > 1 && last.day === day && !e.h && !last.h) last.look = { ...look }; else V.push({ day, look: { ...look }, h: e.h });
  });
  const cur = {}; LOOK.forEach(k => cur[k] = r[k]); V[V.length - 1].look = cur;
  // warna hasil traktir (x:1) selalu jadi versi paling baru
  (r.history || []).filter(h => h && h.x).forEach(h => { const look = Object.assign({}, V[V.length - 1].look); LOOK.forEach(k => { if (k in h) look[k] = h[k] });
    if (!sameLook(look, V[V.length - 1].look)) V.push({ day: Math.max(+h.day || d0, d0), look, h: 1 }) });
  for (let k = V.length - 1; k > 0; k--) if (sameLook(V[k].look, V[k - 1].look)) V.splice(k, 1);
  return V;
}

// awal minggu (Senin 00.00 WIB) dalam ms
function awalMinggu(now = Date.now()) {
  const w = new Date(now + 7 * 3600e3); const dow = (w.getUTCDay() + 6) % 7;
  return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - dow) - 7 * 3600e3;
}
async function sesi(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const u = await kv(['GET', 'sesi:' + t]);
  return u ? { t, u } : null;
}
async function buatSesi(u) {
  const t = crypto.randomBytes(24).toString('base64url');
  await kvMany([['SET', 'sesi:' + t, u, 'EX', SESI_DETIK], ['SADD', 'sesiu:' + u, t], ['EXPIRE', 'sesiu:' + u, SESI_DETIK]]);
  return t;
}
async function infoKartu(D, u) {
  const J = Object.keys(JENIS);
  const got = await kvMany([['HGET', 'pilihan', u], ['GET', 'ganti:' + u], ['HGET', 'warnaplus', u], ['HGET', 'emasplus', u], ['HGET', 'itemplus', u], ['HGET', 'rukoplus', u], ['HGET', 'tingkatplus', u], ...J.map(j => ['GET', j + ':user:' + u])]);
  const [p, g, ex, em, it, rk, tk] = got, kodes = got.slice(7);
  const w0 = awalMinggu(), dipakai = (jparse(g) || []).filter(t => t >= w0).length;
  const r = await wargaPlus(D, u, jparse(ex) || []), V = r ? histOf(r) : [];
  const reqs = await kvMany(J.map((j, k) => kodes[k] ? ['GET', j + ':req:' + kodes[k]] : ['GET', 'kosong:']));
  const pesan = {}; J.forEach((j, k) => { const v = jparse(reqs[k]); pesan[j] = kodes[k] && v && v.status === 'menunggu' ? { kode: kodes[k], ...v } : null });
  let pil = jparse(p); if (pil && pil.nv !== V.length) pil = null; // kades bikin versi baru → versi baru yang tampil
  const kol = jparse(it); const m = pesan.warna;
  let [saldo, dompet, slog, seen, sewaMs, klam, kseen] = await kvMany([['HGET', 'saldo', u], ['GET', 'dompet:u:' + u], ['LRANGE', 'saldo:log:' + u, 0, 9], ['GET', 'saldo:seen:' + u], ['PTTL', 'sewa:konsol:' + u], ['LRANGE', 'kabarlamar:' + u, 0, 4], ['GET', 'kabarlamar:seen:' + u]]);
  const masuk = (slog || []).map(jparse).filter(x => x && x.n > 0 && x.at > (+seen || 0));
  if (!dompet && r) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (let t = 0; t < 5 && !dompet; t++) { let c = 'DOMPET-'; for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
      if (await kv(['SET', 'dompet:k:' + c, u, 'NX'])) { await kv(['SET', 'dompet:u:' + u, c]); dompet = c } } }
  const milik = milikWarga(D, u), stv = milik.length ? await kv(['HMGET', 'stafplus', ...milik.map(bKey)]) || [] : [];
  const pl = milik.length ? await kvMany([...milik.map(b => ['HGETALL', 'pelamar:' + bKey(b)]), ['HMGET', 'lowongan', ...milik.map(bKey)], ['GET', 'pelamar:seen:' + u]]) : [];
  const lw = pl.length ? pl[pl.length - 2] || [] : [], plSeen = pl.length ? +pl[pl.length - 1] || 0 : 0;
  const pelamarOf = k => { const a = pl[k] || [], o = []; for (let i = 0; i + 1 < a.length; i += 2) { const v = jparse(a[i + 1]); if (v) o.push({ user: a[i], ...v }) } return o.sort((x, y) => x.at - y.at) };
  const bangunan = milik.map((b, k) => ({ buka: !!lw[k], pelamar: pelamarOf(k), seen: plSeen, key: bKey(b), name: b.name || 'Bangunan', type: b.type, roles: ROLE_B[b.type] || ROLE_DEF, maks: MAKS_STAF, staf: stafAktif(jparse(stv[k])), kontrak: hariK(lw[k]), gaji: gajiK(lw[k]), pilihanKontrak: KONTRAK_OK }));
  return { u, bangunan, nick: r && r.nick || null, nomor: r ? D.residents.indexOf(warga(D, u)) + 2 : null, hari: r ? (+r.day || 1) : null,
    versi: V.length, dipakai: pil ? pil.n : V.length - 1, jatah: { total: JATAH, terpakai: dipakai, sisa: Math.max(0, JATAH - dipakai) },
    reset: new Date(w0 + 7 * 864e5).toISOString(), admin: u === OWNER,
    emas: !!(r && r.sup) || !!em, ruko: jparse(rk), tingkat: Math.max(+(r && r.tingkat) || 1, +((jparse(tk) || {}).lantai) || 1), atas: (jparse(tk) || {}).atas || (r && r.atas) || null, items: kol && Array.isArray(kol.own) ? kol : { own: [], pajang: [] }, pesan,
    tiket: await tiketKu(u), pindahJeda: Math.max(0, +(await kv(['PTTL', 'pindah:cd:' + u])) || 0), pindahKu: jparse(await kv(['HGET', 'pindah', u])),
    minta: m ? { kode: m.kode, wall: m.wall, roof: m.roof, style: m.style, at: m.at } : null, saldo: +saldo || 0, sewaKonsol: +sewaMs > 0 ? Date.now() + +sewaMs : null, dompet: dompet || null, kabarLamar: (klam || []).map(jparse).filter(x => x && x.at > (+kseen || 0)), saldoBaru: masuk.length ? { n: masuk.reduce((t, x) => t + x.n, 0), ket: masuk.map(x => x.ket), at: masuk[0].at } : null };
}

const adaPenanda = c => String(c || '').toLowerCase().includes('#' + PENANDA);
// fitur menyala otomatis setelah postingan #kartukomen diunggah (cek tiap 5 menit)
let AKTIF = null, AKTIF_AT = 0;
async function kartuAktif() {
  if (AKTIF === true || (AKTIF !== null && Date.now() - AKTIF_AT < 300000)) return AKTIF;
  try {
    const r = await fetch('https://graph.instagram.com/v21.0/me/media?fields=caption&limit=15&access_token=' + encodeURIComponent(IG_TOKEN));
    const j = await r.json(); AKTIF = (j.data || []).some(m => adaPenanda(m.caption)); AKTIF_AT = Date.now();
  } catch (e) { if (AKTIF === null) return false }
  return AKTIF;
}
// cari komentar kunci di postingan Kartu Komen (#kartukomen) + video terbaru.
// Supaya kuat saat ramai: daftar komentar dibaca dari Instagram paling sering tiap ±20 detik untuk SEMUA warga
// (salinan disimpan di database), lalu setiap pengecekan cukup mencari di salinan itu.
const IGC_MAKS = 5000;
const igGet = async url => { const r = await fetch(url); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error('ig: ' + ((j.error && j.error.message) || r.status)); return j };
const igUrl = (id, after, rep = true) => 'https://graph.instagram.com/v21.0/' + id + '/comments?fields=text,from{username}' + (rep ? ',replies.limit(50){id,text,from{username}}' : '') + '&limit=50' + (after ? '&after=' + encodeURIComponent(after) : '') + '&access_token=' + encodeURIComponent(IG_TOKEN);
// ambil komentar + balasan; kalau Instagram menolak field balasan, ulang tanpa balasan (biar pengecekan tetap jalan)
const getC = async (id, after) => { try { return await igGet(igUrl(id, after, true)) } catch (e) { return await igGet(igUrl(id, after, false)) } };
async function segarkanKomen() {
  if (!(await kv(['SET', 'igc:lock', '1', 'NX', 'EX', 20]))) return false;
  let media = jparse(await kv(['GET', 'igc:media']));
  if (!media) {
    const all = (await igGet('https://graph.instagram.com/v21.0/me/media?fields=id,caption&limit=15&access_token=' + encodeURIComponent(IG_TOKEN))).data || [];
    media = all.filter((m, i) => i === 0 || adaPenanda(m.caption)).slice(0, 3).map(m => m.id);
    await kv(['SET', 'igc:media', JSON.stringify(media), 'EX', 60]);
  }
  const list = jparse(await kv(['GET', 'igc:list'])) || [], ada = new Set(list.map(c => c.id));
  // komentar utama + BALASAN-nya (banyak warga membalas komentar petunjuk yang di-pin, bukan komen baru)
  const satu = c => { if (!c || !c.id || ada.has(c.id)) return; ada.add(c.id);
    const tx = norm(c.text); if (/\d/.test(tx)) list.push({ id: c.id, by: cleanU(c.from && c.from.username), tx }) };
  const induk = new Set(jparse(await kv(['GET', 'igc:induk'])) || []);
  const tambah = j => (j.data || []).forEach(c => { satu(c); ((c.replies && c.replies.data) || []).forEach(satu);
    if (c && c.id && cleanU(c.from && c.from.username) === OWNER) induk.add(c.id) });
  const cur = jparse(await kv(['GET', 'igc:cur'])) || {};
  for (const id of media) {
    // 2 halaman pertama (kalau Instagram mengurutkan terbaru dulu) …
    let j = await getC(id); tambah(j);
    if (j.paging && j.paging.next && j.paging.cursors) { j = await getC(id, j.paging.cursors.after); tambah(j) }
    // … lalu lanjut dari posisi terakhir (kalau urutannya terlama dulu), maks 6 halaman per penyegaran
    let after = cur[id] || null;
    for (let p = 0; after && p < 6; p++) {
      const k = await getC(id, after); tambah(k);
      const nx = k.paging && k.paging.next && k.paging.cursors && k.paging.cursors.after;
      if (!nx) break; after = nx;
    }
    cur[id] = after || (j.paging && j.paging.cursors && j.paging.cursors.after) || null;
  }
  // sekali di awal: cari komentar petunjuk @negerikomen di semua halaman (maks 20) supaya balasannya ikut terbaca
  if (!induk.size && !(await kv(['GET', 'igc:indukcari']))) {
    await kv(['SET', 'igc:indukcari', '1', 'EX', 600]);
    for (const id of media) { let k = await getC(id); tambah(k);
      for (let p = 0; p < 20 && k.paging && k.paging.next && k.paging.cursors; p++) { k = await getC(id, k.paging.cursors.after); tambah(k) } }
  }
  // komentar petunjuk milik @negerikomen (biasanya di-pin): balasannya dibaca ulang tiap penyegaran,
  // karena komentar induknya sudah lewat dari halaman yang dipindai
  const indukL = [...induk].slice(-6);
  for (const cid of indukL) { try {
    let r = await igGet('https://graph.instagram.com/v21.0/' + cid + '/replies?fields=id,text,from{username}&limit=50&access_token=' + encodeURIComponent(IG_TOKEN));
    (r.data || []).forEach(satu);
    for (let p = 0; p < 4 && r.paging && r.paging.next; p++) { r = await igGet(r.paging.next); (r.data || []).forEach(satu) }
  } catch (e) { } }
  const simpan = list.slice(-IGC_MAKS);
  await kvMany([['SET', 'igc:list', JSON.stringify(simpan), 'EX', 3 * 864e2], ['SET', 'igc:cur', JSON.stringify(cur), 'EX', 3 * 864e2], ['SET', 'igc:at', String(Date.now()), 'EX', 3 * 864e2], ['SET', 'igc:induk', JSON.stringify(indukL), 'EX', 7 * 864e2]]);
  return true;
}
async function cariKomen(u, frasa) {
  const f2 = norm(frasa).replace(/^kunci /, '');
  const cari = async () => { const list = jparse(await kv(['GET', 'igc:list'])) || [];
    for (let i = list.length - 1; i >= 0; i--) { const c = list[i]; if ((' ' + c.tx + ' ').includes(' ' + f2 + ' ')) return { by: c.by, cocok: c.by === u } } return null };
  let h = await cari(); if (h) return h;
  const at = +(await kv(['GET', 'igc:at'])) || 0;
  if (Date.now() - at > 5000 && await segarkanKomen()) h = await cari();
  return h;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'Database belum tersambung' });
  const aksi = String((req.query && req.query.aksi) || '');
  const body = (req.body && typeof req.body === 'object') ? req.body : jparse(req.body) || {};
  try {
    // ranking konsol playadalahmain (publik): 10 besar tiap game. ?qa=1 = papan uji (terpisah dari papan asli)
    if (aksi === 'konsol-rank' && req.method === 'GET') {
      const pre = (req.query && req.query.qa) ? 'konsolqa:' : 'konsol:';
      const r = await kvMany(KONSOL_G.map(g => ['ZREVRANGE', pre + g, 0, 9, 'WITHSCORES']));
      const out = {}; KONSOL_G.forEach((g, i) => { const a = r[i] || [], l = []; for (let k = 0; k + 1 < a.length; k += 2) l.push({ u: a[k], v: +a[k + 1] }); out[g] = l });
      return res.status(200).json({ rank: out });
    }
    if (aksi === 'pilihan' && req.method === 'GET') {
      try { await cairkanGaji() } catch (e) { }
      const raw = await kv(['HGETALL', 'pilihan']) || [], out = {};
      for (let i = 0; i + 1 < raw.length; i += 2) { const p = jparse(raw[i + 1]); if (p) out[raw[i]] = { n: p.n, nv: p.nv } }
      const rx = await kv(['HGETALL', 'warnaplus']) || [], extra = {};
      for (let i = 0; i + 1 < rx.length; i += 2) { const e = jparse(rx[i + 1]); if (e && e.length) extra[rx[i]] = e }
      const [re, rr, ri, rd, rj, gg, rt, rb, bl, sp, lwg, pmx, srt, gmd, pdh, plog] = await kvMany([['HKEYS', 'emasplus'], ['HGETALL', 'rukoplus'], ['HGETALL', 'itemplus'], ['HGETALL', 'donasi'], ['HGETALL', 'jalan'], ['GET', 'goal:genteng'], ['HGETALL', 'tingkatplus'], ['GET', 'robot:pemilik'], ['LRANGE', 'belanja:log', 0, 59], ['HGETALL', 'stafplus'], ['HGETALL', 'lowongan'], ['GET', 'patromax:pemilik'], ['GET', 'sorot:pemilik'], ['GET', 'robot:mode'], ['HGETALL', 'pindah'], ['LRANGE', 'pindah:log', 0, 11]]);
      const tingkat = {}, atas = {}; for (let i = 0; rt && i + 1 < rt.length; i += 2) { const v = jparse(rt[i + 1]); if (v && v.lantai > 1) tingkat[rt[i]] = v.lantai; if (v && Array.isArray(v.atas)) atas[rt[i]] = v.atas }
      const jalan = {}; for (let i = 0; rj && i + 1 < rj.length; i += 2) { const v = jparse(rj[i + 1]); if (v && Date.now() - v.at < 120000) jalan[rj[i]] = v }
      const staf = {}; for (let i = 0; sp && i + 1 < sp.length; i += 2) { const v = stafAktif(jparse(sp[i + 1])); if (v.length) staf[sp[i]] = v.map(x => ({ user: x.user, role: x.role, sejak: x.sejak, until: x.until })) }
      const lwKeys = []; for (let i = 0; lwg && i + 1 < lwg.length; i += 2) lwKeys.push(lwg[i]);
      const lwN = lwKeys.length ? await kvMany(lwKeys.map(k => ['HLEN', 'pelamar:' + k])) : [];
      const lowongan = {}; for (let i = 0; lwg && i + 1 < lwg.length; i += 2) { const key = lwg[i]; const n = (staf[key] || []).length;
        const tp = key.split('@')[0]; if (n >= MAKS_STAF) continue; lowongan[key] = { roles: ROLE_B[tp] || ROLE_DEF, hari: hariK(lwg[i + 1]), gaji: gajiK(lwg[i + 1]), sisa: Math.max(0, MAKS_STAF - n), pelamar: +lwN[i / 2] || 0 } }
      const donasi = {}; for (let i = 0; rd && i + 1 < rd.length; i += 2) donasi[rd[i]] = +rd[i + 1] || 0;
      const ruko = {}, item = {};
      for (let i = 0; rr && i + 1 < rr.length; i += 2) { const v = jparse(rr[i + 1]); if (v) ruko[rr[i]] = { wall: v.wall, roof: v.roof } }
      for (let i = 0; ri && i + 1 < ri.length; i += 2) { const v = jparse(ri[i + 1]); if (!v || !Array.isArray(v.pajang) || !v.pajang.length) continue;
        item[ri[i]] = v.pajang.map(id => { const o = (v.own || []).find(x => x.id === id); return o ? { id, ...(o.teks ? { teks: o.teks } : {}), ...(o.warna ? { warna: o.warna } : {}) } : null }).filter(Boolean) }
      res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
      return res.status(200).json({ pilihan: out, extra, emas: re || [], ruko, item, tingkat, atas, robot: rb || null, gento: jparse(gmd) || null, pindah: (() => { const o = {}; for (let i = 0; pdh && i + 1 < pdh.length; i += 2) { const v = jparse(pdh[i + 1]); if (v) o[pdh[i]] = v } return o })(), pindahLog: (plog || []).map(jparse).filter(Boolean), idaman: await papanIdaman(awalMinggu()), idamanLalu: await papanIdaman(awalMinggu() - 7 * 864e5), patromax: pmx || null, sorot: srt || null, belanja: (bl || []).map(jparse).filter(Boolean), staf, lowongan, donasi, jalan, goal: +gg || 0, aktif: await kartuAktif() });
    }
    if (aksi === 'reaksi-info' && req.method === 'GET') { // reaksi rumah, tamu hari ini, buku tamu
      const t = cleanU(req.query.u); if (!okU(t)) return res.status(400).json({ error: 'Warga tidak dikenal' });
      const [n, hr, log] = await kvMany([['HGETALL', 'rx:n:' + t], ['HGET', 'rx:hari:' + hariWIB(), t], ['LRANGE', 'rx:log:' + t, 0, 29]]); const N = { mantap: 0, genteng: 0, tetangga: 0 };
      for (let i = 0; n && i + 1 < n.length; i += 2) N[n[i]] = +n[i + 1] || 0;
      let sudah = null; const ss = await sesi(req).catch(() => null); if (ss) sudah = await kv(['GET', 'rx:d:' + hariWIB() + ':' + ss.u + ':' + t]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ n: N, tamu: +hr || 0, buku: (log || []).map(jparse).filter(Boolean), sudah: sudah || null });
    }
    if (req.method !== 'POST' && aksi !== 'saya') return res.status(405).json({ error: 'Metode tidak didukung' });
    const D = await dataKampung(req);

    if (aksi === 'kunci') {
      const u = cleanU(body.u);
      if (!okU(u) || (u !== OWNER && !warga(D, u))) return res.status(404).json({ error: 'Rumah @' + u + ' belum ada di kampung. Komen dulu namamu di video terbaru ya!' });
      const lama = jparse(await kv(['GET', 'kunci:' + u]));
      if (lama && Date.now() - lama.at < 20000) return res.status(200).json({ frasa: lama.frasa, sampai: lama.sampai });
      const pick = a => a[crypto.randomInt(a.length)];
      const frasa = `kunci ${pick(BENDA)} ${pick(WARNA)} ${crypto.randomInt(1, 100)}`;
      const k = { frasa, at: Date.now(), sampai: Date.now() + KUNCI_DETIK * 1000 };
      await kv(['SET', 'kunci:' + u, JSON.stringify(k), 'EX', KUNCI_DETIK]);
      return res.status(200).json({ frasa, sampai: k.sampai });
    }

    if (aksi === 'cek') {
      const u = cleanU(body.u); if (!okU(u)) return res.status(400).json({ error: 'Username tidak valid' });
      const k = jparse(await kv(['GET', 'kunci:' + u]));
      if (!k) return res.status(410).json({ error: 'Kuncinya sudah kedaluwarsa. Ambil kunci baru ya.' });
      const boleh = await kv(['SET', 'cekjeda:' + u, '1', 'NX', 'EX', 8]);
      if (!boleh) return res.status(429).json({ error: 'Tunggu beberapa detik, lalu coba lagi.' });
      const hasil = await cariKomen(u, k.frasa);
      if (!hasil) return res.status(404).json({ error: 'Komennya belum kelihatan. Kadang Instagram telat ±1 menit, coba lagi sebentar.' });
      if (!hasil.cocok) return res.status(403).json({ error: `Kunci ini harus dikomen dari akun @${u}, bukan @${hasil.by}.` });
      await kv(['DEL', 'kunci:' + u]);
      const token = await buatSesi(u);
      return res.status(200).json({ token, kartu: await infoKartu(D, u) });
    }

    const s = await sesi(req);
    if (!s) return res.status(401).json({ error: 'Kartu tidak dikenal. Ambil kartu lagi ya.' });

    if (aksi === 'saya') return res.status(200).json({ kartu: await infoKartu(D, s.u) });
    if (aksi === 'sewa-konsol') { // sewa playadalahmain 1 Receh / 24 jam (skor ikut ranking)
      const info = await infoKartu(D, s.u);
      if (info.items.own.some(o => o.id === 'konsol')) return res.status(400).json({ error: 'Kamu sudah punya playadalahmain, tinggal main!' });
      if (info.sewaKonsol) return res.status(400).json({ error: 'Sewamu masih aktif.' });
      const after = await kv(['HINCRBY', 'saldo', s.u, -1]);
      if (after < 0) { await kv(['HINCRBY', 'saldo', s.u, 1]); return res.status(400).json({ error: 'Recehan belum cukup. Sewa butuh 1 Receh.' }) }
      if (!(await kv(['SET', 'sewa:konsol:' + s.u, String(Date.now()), 'NX', 'EX', 864e2]))) { await kv(['HINCRBY', 'saldo', s.u, 1]); return res.status(400).json({ error: 'Sewamu masih aktif.' }) }
      await kvMany([['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: -1, ket: 'sewa playadalahmain 1 hari' })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
      return res.status(200).json({ ok: true, kartu: await infoKartu(D, s.u) });
    }
    // Loker Negeri (milik kades) lewat web: warga kirim lamaran, kades lihat daftar & bisa tambah pelamar dari DM
    if (aksi === 'lamar-negeri') {
      const job = String(body.job || ''), L = LOKER_NEGERI[job];
      if (!L) return res.status(404).json({ error: 'Lowongan tidak ditemukan.' });
      if (body.cek) { const v = jparse(await kv(['HGET', 'pelamarN:' + job, s.u])); return res.status(200).json({ ok: true, sudah: !!v, lamaran: v }) }
      if (Date.now() >= L.tutup) return res.status(400).json({ error: 'Lowongan ini sudah ditutup.' });
      if (!warga(D, s.u)) return res.status(403).json({ error: 'Kamu harus jadi warga dulu (punya rumah di Negeri Komen).' });
      const pesan = String(body.pesan || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (pesan.length < 5) return res.status(400).json({ error: 'Tulis alasanmu dulu ya.' });
      if (!body.follow) return res.status(400).json({ error: 'Centang dulu kalau sudah follow IG & subscribe YouTube @lembarpeta.' });
      const ada = await kv(['HEXISTS', 'pelamarN:' + job, s.u]);
      if (!ada && (+(await kv(['HLEN', 'pelamarN:' + job])) || 0) >= 500) return res.status(400).json({ error: 'Pelamarnya sudah banyak banget. Tunggu pengumuman ya!' });
      await kv(['HSET', 'pelamarN:' + job, s.u, JSON.stringify({ pesan, follow: true, at: Date.now(), via: 'web' })]);
      return res.status(200).json({ ok: true, ulang: !!ada });
    }
    if (aksi === 'pelamar-negeri') { // kades: lihat pelamar / tambah manual dari DM / hapus
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const job = String(body.job || ''); if (!LOKER_NEGERI[job]) return res.status(404).json({ error: 'Lowongan tidak ditemukan.' });
      if (body.tambah) { const t = cleanU(body.tambah); if (!okU(t)) return res.status(400).json({ error: 'Username tidak valid' });
        const pesan = String(body.pesan || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) || '(lamar lewat DM)';
        await kv(['HSET', 'pelamarN:' + job, t, JSON.stringify({ pesan, follow: !!body.follow, at: Date.now(), via: 'dm' })]) }
      if (body.hapus) await kv(['HDEL', 'pelamarN:' + job, cleanU(body.hapus)]);
      const H = await kv(['HGETALL', 'pelamarN:' + job]) || [], daftar = [];
      for (let i = 0; i < H.length; i += 2) { const v = jparse(H[i + 1]) || {}; daftar.push({ u: H[i], ...v, warga: !!warga(D, H[i]) }) }
      daftar.sort((a, b) => (a.at || 0) - (b.at || 0));
      return res.status(200).json({ ok: true, daftar });
    }
    if (aksi === 'lamar') { // warga melamar kerja ke bangunan milik warga lain yang lowongannya dibuka
      const key = String(body.key || ''), b = (D.buildings || []).find(x => x && bKey(x) === key && x.by && String(x.by).toLowerCase() !== OWNER);
      if (!b) return res.status(404).json({ error: 'Bangunan tidak ditemukan.' });
      if (!(await kv(['HGET', 'lowongan', key]))) return res.status(400).json({ error: 'Lowongan di ' + (b.name || 'sini') + ' sedang tutup.' });
      if (!warga(D, s.u)) return res.status(403).json({ error: 'Kamu harus jadi warga dulu.' });
      if (String(b.by).toLowerCase() === s.u) return res.status(400).json({ error: 'Kamu bosnya, nggak bisa melamar ke bangunan sendiri 😄' });
      const L = stafAktif(jparse(await kv(['HGET', 'stafplus', key])));
      if (L.some(x => x.user === s.u)) return res.status(400).json({ error: 'Kamu sudah jadi karyawan di sini.' });
      if (L.length >= MAKS_STAF) return res.status(400).json({ error: 'Lowongan sudah penuh. Coba lagi nanti saat ada kontrak yang selesai.' });
      const role = String(body.role || ''); if (!(ROLE_B[b.type] || ROLE_DEF).includes(role)) return res.status(400).json({ error: 'Pilih posisi yang mau dilamar.' });
      const pesan = String(body.pesan || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const ada = await kv(['HEXISTS', 'pelamar:' + key, s.u]);
      if (!ada && (+(await kv(['HLEN', 'pelamar:' + key])) || 0) >= 100) return res.status(400).json({ error: 'Pelamarnya sudah banyak banget (100). Tunggu bosnya milih dulu ya!' });
      await kv(['HSET', 'pelamar:' + key, s.u, JSON.stringify({ role, pesan, at: Date.now() })]);
      return res.status(200).json({ ok: true, ulang: !!ada });
    }
    if (aksi === 'staf' || aksi === 'bonus' || aksi === 'lowongan') { // pemilik bangunan: tambah/hapus karyawan, kirim bonus Receh
      const b = milikWarga(D, s.u).find(x => bKey(x) === String(body.key || ''));
      if (!b) return res.status(403).json({ error: 'Bangunan ini bukan milikmu.' });
      const key = bKey(b), L = stafAktif(jparse(await kv(['HGET', 'stafplus', key]))), t = cleanU(body.target);
      if (aksi === 'bonus') {
        const n = Math.floor(+body.n);
        const kr = L.find(x => x.user === t);
        if (!kr) return res.status(404).json({ error: '@' + t + ' bukan karyawan ' + (b.name || 'bangunanmu') + '.' });
        if (kr.gaji > 0) return res.status(400).json({ error: '@' + t + ' sudah digaji tetap. Bonus cuma buat karyawan sukarela.' });
        if (!(n >= 1 && n <= 3)) return res.status(400).json({ error: 'Bonus 1–3 Receh.' });
        const after = await kv(['HINCRBY', 'saldo', s.u, -n]);
        if (after < 0) { await kv(['HINCRBY', 'saldo', s.u, n]); return res.status(400).json({ error: 'Recehan-mu belum cukup buat bonus ' + n + ' Receh.' }) }
        const at = Date.now();
        await kvMany([['HINCRBY', 'saldo', t, n], ['LPUSH', 'saldo:log:' + t, JSON.stringify({ at, n, ket: 'bonus: dari @' + s.u + ' (' + (b.name || 'bangunan') + ')' })], ['LTRIM', 'saldo:log:' + t, 0, 49],
          ['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at, n: -n, ket: 'bonus karyawan @' + t })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
        return res.status(200).json({ ok: true, kartu: await infoKartu(D, s.u) });
      }
      if (aksi === 'lowongan') { if (body.buka && L.length >= MAKS_STAF) return res.status(400).json({ error: 'Karyawanmu sudah ' + MAKS_STAF + ' (penuh). Lowongan bisa dibuka lagi saat ada kontrak yang selesai.' }); await kv(body.buka ? ['HSET', 'lowongan', key, hariK(body.hari) + ':' + (GAJI_OK.includes(+body.gaji) ? +body.gaji : 0)] : ['HDEL', 'lowongan', key]); return res.status(200).json({ ok: true, kartu: await infoKartu(D, s.u) }) }
      if (body.op === 'tolak') { const lam = jparse(await kv(['HGET', 'pelamar:' + key, t])); if (!lam) return res.status(404).json({ error: 'Lamaran @' + t + ' tidak ada.' });
        const alasan = L.length >= MAKS_STAF ? 'Lowongan sudah penuh (maksimal ' + MAKS_STAF + ' karyawan)' : 'Belum terpilih kali ini';
        await kvMany([['HDEL', 'pelamar:' + key, t], ['LPUSH', 'kabarlamar:' + t, JSON.stringify({ ok: false, b: b.name || 'Bangunan', bos: s.u, role: lam.role, alasan, at: Date.now() })], ['LTRIM', 'kabarlamar:' + t, 0, 9]]); return res.status(200).json({ ok: true, kartu: await infoKartu(D, s.u) }) }
      if (body.op !== 'tambah') return res.status(400).json({ error: 'Karyawan tidak bisa diberhentikan. Kontraknya selesai sendiri sesuai lama kontrak.' });
      const roles = ROLE_B[b.type] || ROLE_DEF, role = String(body.role || '');
      if (!okU(t) || !warga(D, t)) return res.status(404).json({ error: '@' + t + ' belum jadi warga Negeri Komen. Ajak komen dulu ya!' });
      if (t === s.u) return res.status(400).json({ error: 'Kamu bosnya, nggak bisa jadi karyawan sendiri 😄' });
      if (!roles.includes(role)) return res.status(400).json({ error: 'Pilih jabatannya dulu.' });
      if (L.some(x => x.user === t)) return res.status(400).json({ error: '@' + t + ' sudah jadi karyawanmu.' });
      if (L.length >= MAKS_STAF) return res.status(400).json({ error: 'Maksimal ' + MAKS_STAF + ' karyawan per bangunan.' });
      const lwv = await kv(['HGET', 'lowongan', key]), langsung = KONTRAK_OK.includes(+body.hari);
      const hari = langsung ? +body.hari : hariK(lwv), gaji = langsung ? (GAJI_OK.includes(+body.gaji) ? +body.gaji : 0) : gajiK(lwv), pekan = PEKAN(hari), setor = gaji * pekan;
      if (setor > 0) { // setor gaji penuh di awal
        const after = await kv(['HINCRBY', 'saldo', s.u, -setor]);
        if (after < 0) { await kv(['HINCRBY', 'saldo', s.u, setor]); return res.status(400).json({ error: `Recehan-mu kurang. Gaji ${gaji} Receh × ${pekan} pekan = ${setor} Receh harus disetor di awal.` }) }
        await kvMany([['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: -setor, ket: 'setor gaji @' + t + ' (' + pekan + ' pekan)' })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
      }
      L.push({ user: t, role, hari, sejak: tglWIB(), until: tglWIB(hari - 1), at: Date.now(), ...(gaji ? { gaji, pekan, dibayar: 0, bos: s.u, tempat: b.name || 'Bangunan' } : {}) });
      const penuh = L.length >= MAKS_STAF; // karyawan sudah 3 → lowongan otomatis ditutup
      await kvMany([['LPUSH', 'kabarlamar:' + t, JSON.stringify({ ok: true, b: b.name || 'Bangunan', bos: s.u, role, hari, gaji, at: Date.now() })], ['LTRIM', 'kabarlamar:' + t, 0, 9]]);
      await kvMany([['HSET', 'stafplus', key, JSON.stringify(L)], ['HDEL', 'pelamar:' + key, t], ...(penuh ? [['HDEL', 'lowongan', key]] : [])]);
      if (gaji) await cairkanGaji(); // gaji pekan pertama langsung cair
      return res.status(200).json({ ok: true, penuh, setor, kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'konsol-skor') { // simpan skor pemilik konsol (skor tertinggi saja); QA hanya kades, ke papan uji
      const g = String(body.g || ''), v = Math.floor(+body.v), qa = !!body.qa;
      if (!KONSOL_G.includes(g) || !(v >= 0 && v <= KONSOL_MAX[g])) return res.status(400).json({ error: 'Skor tidak valid' });
      if (qa) { if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' }) }
      else { const info = await infoKartu(D, s.u); if (!info.items.own.some(o => o.id === 'konsol')) { if (!info.sewaKonsol) return res.status(403).json({ error: 'Khusus pemilik / penyewa playadalahmain' }) } }
      const key = (qa ? 'konsolqa:' : 'konsol:') + g;
      await kv(['ZADD', key, 'GT', String(v), s.u]); const rk = await kv(['ZREVRANK', key, s.u]);
      return res.status(200).json({ ok: true, rank: rk == null ? null : +rk + 1 });
    }

    if (aksi === 'pilih') {
      const r = await wargaPlus(D, s.u); if (!r) return res.status(404).json({ error: 'Rumahmu tidak ditemukan' });
      const V = histOf(r), n = Math.floor(+body.n);
      if (!(n >= 0 && n < V.length)) return res.status(400).json({ error: 'Versi rumah tidak ada' });
      const info = await infoKartu(D, s.u);
      if (n === info.dipakai) return res.status(200).json({ kartu: info });
      if (info.jatah.sisa <= 0) { const d = new Date(Date.parse(info.reset) + 7 * 3600e3), BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return res.status(429).json({ error: `Jatah ganti rumah minggu ini sudah habis. Jatahnya kembali ${d.getUTCDate()} ${BL[d.getUTCMonth()]} ${d.getUTCFullYear()}.`, kartu: info }); }
      const g = (jparse(await kv(['GET', 'ganti:' + s.u])) || []).filter(t => t >= awalMinggu() - 7 * 864e5);
      g.push(Date.now());
      await kvMany([
        n === V.length - 1 ? ['HDEL', 'pilihan', s.u] : ['HSET', 'pilihan', s.u, JSON.stringify({ n, nv: V.length, at: Date.now() })],
        ['SET', 'ganti:' + s.u, JSON.stringify(g), 'EX', 30 * 864e2],
      ]);
      return res.status(200).json({ kartu: await infoKartu(D, s.u) });
    }

    if (aksi === 'keluar-lain' || aksi === 'keluar') {
      const all = await kv(['SMEMBERS', 'sesiu:' + s.u]) || [];
      const buang = aksi === 'keluar' ? [s.t] : all.filter(t => t !== s.t);
      if (buang.length) await kvMany([...buang.map(t => ['DEL', 'sesi:' + t]), ['SREM', 'sesiu:' + s.u, ...buang]]);
      return res.status(200).json({ ok: true, dikeluarkan: buang.length });
    }

    if (aksi === 'aktifkan') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const t = cleanU(body.target);
      if (!okU(t) || !warga(D, t)) return res.status(404).json({ error: 'Warga @' + t + ' tidak ditemukan' });
      return res.status(200).json({ token: await buatSesi(t), u: t });
    }
    if (aksi === 'minta-warna' || aksi === 'minta-ubah') {
      const jenis = aksi === 'minta-warna' ? 'warna' : String(body.jenis || '');
      if (!JENIS[jenis]) return res.status(400).json({ error: 'Pilihan tidak dikenal' });
      const r = await wargaPlus(D, s.u); if (!r) return res.status(404).json({ error: 'Rumahmu tidak ditemukan' });
      const info = await infoKartu(D, s.u);
      let isi;
      if (jenis === 'warna') {
        const wall = String(body.wall || ''), roof = String(body.roof || '');
        if (!okWarna(wall) || !okWarna(roof)) return res.status(400).json({ error: 'Pilih warna dinding dan atap dulu.' });
        const V = histOf(r), n = body.n == null ? V.length - 1 : Math.floor(+body.n);
        if (!(n >= 0 && n < V.length)) return res.status(400).json({ error: 'Versi rumah tidak ada' });
        const style = V[n].look.style || null, now = V[n].look;
        const kini = r.style ? 1 : (info.tingkat || 1); let atas = null; // rumah tingkat: warna dinding tiap lantai atas
        if (kini > 1 && Array.isArray(body.atas)) { atas = body.atas.slice(0, kini - 1).map(String); if (atas.length !== kini - 1 || !atas.every(okWarna)) return res.status(400).json({ error: 'Pilih warna tiap lantai dulu.' }) }
        const atasBeda = atas && JSON.stringify(atas) !== JSON.stringify((info.atas || []).slice(0, kini - 1));
        if ((now.wall || null) === wall && (now.roof || null) === roof && !atasBeda) return res.status(400).json({ error: 'Warnanya sama dengan rumah versi itu.' });
        isi = { wall, roof, style, ...(atas ? { atas } : {}), harga: 1 };
      } else if (jenis === 'emas') {
        if (info.emas) return res.status(400).json({ error: 'Rumahmu sudah punya bendera emas.' });
        isi = { harga: 2 };
      } else if (jenis === 'ruko') {
        return res.status(400).json({ error: 'Ruko sedang ditutup sementara. Mau kerja sama usaha? DM @negerikomen ya.' }); // ruko nonaktif
        const wall = String(body.wall || ''), roof = String(body.roof || '');
        if (!okWarna(wall) || !okWarna(roof)) return res.status(400).json({ error: 'Pilih warna ruko dulu.' });
        isi = { wall, roof, harga: 20 };
      } else if (jenis === 'tingkat') {
        const lantai = Math.floor(+body.lantai), kini = info.tingkat || 1;
        if (r.style) return res.status(400).json({ error: 'Rumahmu rumah spesial hadiah kontes, bentuknya eksklusif dan tidak bisa ditingkat.' });
        if (![2, 3].includes(lantai)) return res.status(400).json({ error: 'Pilih rumah tingkat 2 atau 3.' });
        if (lantai <= kini) return res.status(400).json({ error: 'Rumahmu sudah tingkat ' + kini + '.' });
        isi = { lantai, harga: HARGA_TINGKAT(lantai, kini) };
      } else {
        const ids = [...new Set((Array.isArray(body.items) ? body.items : []).map(String))].filter(id => KATALOG[id]);
        if (!ids.length) return res.status(400).json({ error: 'Pilih minimal satu item.' });
        const punya = info.items.own.map(o => o.id), dobel = ids.filter(id => !ULANG.includes(id) && punya.includes(id));
        if (dobel.length) return res.status(400).json({ error: 'Kamu sudah punya: ' + dobel.join(', ') });
        let teks = null;
        if (ids.includes('papan')) { teks = String(body.teks || '').replace(/\s+/g, ' ').trim(); if (!okTeks(teks)) return res.status(400).json({ error: 'Tulisan papan nama 1–20 huruf/angka.' }) }
        const warna = {}; for (const id of ['motor', 'sepeda']) if (ids.includes(id)) { const w = String((body.warna || {})[id] || 'merah'); if (!VWARNA.includes(w)) return res.status(400).json({ error: 'Warna ' + id + ' tidak tersedia.' }); warna[id] = w }
        isi = { items: ids, teks, warna, harga: ids.reduce((t, id) => t + KATALOG[id], 0) };
        if (ids.includes('robot') && !D.gento && s.u !== OWNER) return res.status(400).json({ error: 'Barang ini belum dijual.' });
        if (ids.includes('konsol')) { // playadalahmain: hanya pakai Recehan, langsung jadi
          if (ids.length > 1) return res.status(400).json({ error: 'Beli playadalahmain terpisah dari item lain ya.' });
          if ((info.saldo || 0) < isi.harga) return res.status(400).json({ error: `playadalahmain cuma bisa dibeli pakai Recehan. Recehan-mu ${info.saldo || 0} Receh, butuh ${isi.harga} Receh. Isi Recehan dulu ya!` });
          const after = await kv(['HINCRBY', 'saldo', s.u, -isi.harga]);
          if (after < 0) { await kv(['HINCRBY', 'saldo', s.u, isi.harga]); return res.status(400).json({ error: 'Recehan belum cukup.' }) }
          const A2 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let kode = 'ITEM-'; for (let i = 0; i < 4; i++) kode += A2[crypto.randomInt(A2.length)];
          const v = { u: s.u, jenis: 'item', ...isi, bayar: isi.harga, trk: [{ nama: 'saldo', qty: isi.harga, at: Date.now() }], at: Date.now(), status: 'menunggu' };
          await kvMany([['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: -isi.harga, ket: kode })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
          await terapkan(kv, kvMany, 'item', kode, v, true, 'otomatis');
          return res.status(200).json({ ok: true, langsung: true, kode, jenis: 'item', harga: isi.harga, kartu: await infoKartu(D, s.u) });
        }
        const EKS = ['robot', 'patromax', 'sorot'], ek = EKS.find(id => ids.includes(id));
        if (ek && ids.filter(id => EKS.includes(id)).length > 1) return res.status(400).json({ error: 'Beli barang eksklusif satu per satu ya.' });
        if (ek) { // barang eksklusif (GENTO / Patromax): beli langsung pakai Recehan, sekaligus. Tidak ada pesanan menggantung → tidak ada yang bayar dobel.
          const KEY = ek + ':pemilik', NM = { robot: 'GENTO', patromax: 'Patromax', sorot: 'Lampu Sorot Langit' }[ek];
          const p = await kv(['GET', KEY]); if (p) return res.status(400).json({ error: NM + ' cuma ada 1 di kampung, dan sudah dimiliki @' + p + '.' });
          if ((info.saldo || 0) < isi.harga) return res.status(400).json({ error: `${NM} cuma bisa dibeli pakai Recehan. Recehan-mu ${info.saldo || 0} Receh, butuh ${isi.harga} Receh. Isi Recehan dulu ya!` });
          if (!(await kv(['SET', KEY, s.u, 'NX']))) return res.status(400).json({ error: 'Yah, ' + NM + ' baru saja dibeli warga lain.' });
          const after = await kv(['HINCRBY', 'saldo', s.u, -isi.harga]);
          if (after < 0) { await kvMany([['HINCRBY', 'saldo', s.u, isi.harga], ['DEL', KEY]]); return res.status(400).json({ error: 'Recehan belum cukup.' }) }
          const A2 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let kode = 'ITEM-'; for (let i = 0; i < 4; i++) kode += A2[crypto.randomInt(A2.length)];
          const v = { u: s.u, jenis: 'item', ...isi, bayar: isi.harga, trk: [{ nama: 'saldo', qty: isi.harga, at: Date.now() }], at: Date.now(), status: 'menunggu' };
          await kvMany([['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: -isi.harga, ket: kode })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
          await terapkan(kv, kvMany, 'item', kode, v, true, 'otomatis');
          return res.status(200).json({ ok: true, langsung: true, kode, jenis: 'item', harga: isi.harga, kartu: await infoKartu(D, s.u) });
        }
      }
      const lama = await kv(['GET', jenis + ':user:' + s.u]); if (lama) { await simpanStatus(jenis, lama, 'diganti'); await kv(['SREM', jenis + ':antre', lama]) }
      if (jenis === 'item' && !['robot', 'patromax', 'sorot'].some(id => isi.items.includes(id))) await lepasRobot(s.u);
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let kode = JENIS[jenis].awal + '-'; for (let i = 0; i < 4; i++) kode += A[crypto.randomInt(A.length)];
      await kvMany([['SET', jenis + ':req:' + kode, JSON.stringify({ u: s.u, jenis, ...isi, at: Date.now(), status: 'menunggu' }), ...EXP(jenis)],
        ['SET', jenis + ':user:' + s.u, kode, ...EXP(jenis)], ['SADD', jenis + ':antre', kode]]);
      return res.status(200).json({ kode, jenis, harga: isi.harga, kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'batal-warna' || aksi === 'batal-ubah') {
      const jenis = aksi === 'batal-warna' ? 'warna' : String(body.jenis || '');
      if (!JENIS[jenis]) return res.status(400).json({ error: 'Pilihan tidak dikenal' });
      const kode = await kv(['GET', jenis + ':user:' + s.u]);
      if (kode) { await simpanStatus(jenis, kode, 'dibatalkan'); await kvMany([['DEL', jenis + ':user:' + s.u], ['SREM', jenis + ':antre', kode]]) }
      if (jenis === 'item') await lepasRobot(s.u);
      return res.status(200).json({ kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'bayar-saldo') {
      const kode = String(body.kode || '').toUpperCase(), jenis = Object.keys(JENIS).find(j => kode.startsWith(JENIS[j].awal + '-'));
      const v = jenis && jparse(await kv(['GET', jenis + ':req:' + kode]));
      if (!v || v.u !== s.u || v.status !== 'menunggu') return res.status(404).json({ error: 'Pesanan tidak ditemukan atau sudah diproses' });
      const sisa = Math.max(0, (v.harga || 1) - (+v.bayar || 0));
      if (sisa > 0) {
        const after = await kv(['HINCRBY', 'saldo', s.u, -sisa]);
        if (after < 0) { await kv(['HINCRBY', 'saldo', s.u, sisa]); return res.status(400).json({ error: 'Recehan belum cukup.' }) }
        v.bayar = (+v.bayar || 0) + sisa; v.trk = [...(v.trk || []), { nama: 'saldo', qty: sisa, at: Date.now() }].slice(-10);
        await kvMany([['SET', jenis + ':req:' + kode, JSON.stringify(v), 'KEEPTTL'], ['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: -sisa, ket: kode })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
      }
      let otomatis = false; if (bolehOtomatis(jenis, v)) { await terapkan(kv, kvMany, jenis, kode, v, true, 'saldo'); otomatis = true }
      return res.status(200).json({ ok: true, otomatis, kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'saldo-awal') { // sekali saja: pendukung lama (donor di data kampung) dapat Saldo Genteng sebesar traktirannya
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const L = (D.residents || []).filter(r => +r.donor > 0).map(r => ({ u: String(r.name).toLowerCase(), n: Math.floor(+r.donor) }));
      if (!body.kirim) return res.status(200).json({ daftar: L, total: L.reduce((t, x) => t + x.n, 0), sudah: await kv(['HLEN', 'saldo:awal']) || 0 });
      const out = [];
      for (const x of L) { if (await kv(['HSETNX', 'saldo:awal', x.u, String(x.n)])) { await kvMany([['HINCRBY', 'saldo', x.u, x.n], ['LPUSH', 'saldo:log:' + x.u, JSON.stringify({ at: Date.now(), n: x.n, ket: 'hadiah pendukung lama' })]]); out.push(x) } }
      return res.status(200).json({ ok: true, dikirim: out, total: out.reduce((t, x) => t + x.n, 0) });
    }
    if (aksi === 'ufo' || aksi === 'ufo-daftar') { // quest UFO: klaim penemu (urutan siapa cepat) — hanya saat UFO muncul
      const q = D.quest || {}, w = new Date(Date.now() + 7 * 3600e3), tgl = w.toISOString().slice(0, 10), mnt = w.getUTCHours() * 60 + w.getUTCMinutes();
      const mm = s => { const [a, b] = String(s || '').replace('.', ':').split(':').map(Number); return a * 60 + b };
      const key = 'ufo:' + (q.tanggal || tgl);
      if (aksi === 'ufo-daftar') { if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' }); return res.status(200).json({ daftar: (await kv(['LRANGE', key, 0, -1]) || []).map(jparse) }) }
      if (!q.start || !q.end || (q.tanggal && q.tanggal !== tgl) || !(mnt >= mm(q.start) && mnt < mm(q.end))) return res.status(400).json({ error: 'UFO-nya sudah pergi… tunggu quest berikutnya ya!' });
      if (!(await kv(['SET', key + ':' + s.u, '1', 'NX', 'EX', 30 * 864e2]))) { const L = (await kv(['LRANGE', key, 0, -1]) || []).map(jparse); const i = L.findIndex(x => x && x.u === s.u); return res.status(200).json({ ok: true, ke: i + 1, sudah: true }) }
      const ke = await kv(['RPUSH', key, JSON.stringify({ u: s.u, at: Date.now() })]); await kv(['EXPIRE', key, 30 * 864e2]);
      // hadiah Saldo Genteng untuk 20 penemu pertama: #1 = 10, #2–3 = 5, #4–10 = 3, #11–20 = 1
      const hadiah = ke === 1 ? 10 : ke <= 3 ? 5 : ke <= 10 ? 3 : ke <= 20 ? 1 : 0;
      if (hadiah) await kvMany([['HINCRBY', 'saldo', s.u, hadiah], ['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: hadiah, ket: 'hadiah UFO #' + ke })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
      return res.status(200).json({ ok: true, ke, hadiah });
    }
    if (aksi === 'kabarlamar-lihat') { await kv(['SET', 'kabarlamar:seen:' + s.u, String(Date.now()), 'EX', 400 * 864e2]); return res.status(200).json({ ok: true }) }
    if (aksi === 'pelamar-lihat') { await kv(['SET', 'pelamar:seen:' + s.u, String(Date.now()), 'EX', 400 * 864e2]); return res.status(200).json({ ok: true }) }
    if (aksi === 'saldo-lihat') { await kv(['SET', 'saldo:seen:' + s.u, String(Date.now()), 'EX', 400 * 864e2]); return res.status(200).json({ ok: true }) }
    if (aksi === 'gaji') { // kades: gaji mingguan karyawan fasilitas (sekali per pekan)
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const minggu = awalMinggu(), hariIniStr = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      // gaji per pekerjaan bisa beda: data.js "gaji": { default, warung, satpam, bakso, padang, marbot, proyek }, atau "gaji" di entri staff
      const G = D.gaji || {}, JOB = { warung: 'warung', posronda: 'satpam', bakso: 'bakso', padang: 'padang', masjid: 'marbot' };
      const besar = (job, x) => Math.max(0, Math.min(50, Math.floor(+((x && x.gaji) ?? G[job] ?? G.default ?? GAJI)) || 0));
      const bayar = new Map(), tambah = (u, n) => { u = cleanU(u); if (okU(u) && warga(D, u) && n > 0) bayar.set(u, (bayar.get(u) || 0) + n) };
      (D.buildings || []).forEach(b => (Array.isArray(b.staff) ? b.staff : []).forEach(x => x && (!x.until || String(x.until) >= hariIniStr) && tambah(x.user, besar(JOB[b.type] || b.type, x)))); // kontrak karyawan 30 hari (until)
      (D.residents || []).filter(r => r.job && (!r.job.until || String(r.job.until) >= hariIniStr)).forEach(r => tambah(r.name, besar('proyek', r.job)));
      const staf = [...bayar.keys()], totalGaji = [...bayar.values()].reduce((a, b) => a + b, 0);
      const sudah = await kv(['GET', 'gaji:' + minggu]);
      if (!body.kirim) return res.status(200).json({ staf, rincian: Object.fromEntries(bayar), total: totalGaji, sudah: !!sudah });
      if (!staf.length) return res.status(400).json({ error: 'Belum ada karyawan di data kampung.' });
      if (!(await kv(['SET', 'gaji:' + minggu, String(Date.now()), 'NX', 'EX', 40 * 864e2]))) return res.status(400).json({ error: 'Gaji pekan ini sudah dikirim.' });
      const at = Date.now();
      await kvMany(staf.flatMap(u => [['HINCRBY', 'saldo', u, bayar.get(u)], ['LPUSH', 'saldo:log:' + u, JSON.stringify({ at, n: bayar.get(u), ket: 'gaji' })], ['LTRIM', 'saldo:log:' + u, 0, 49]]));
      return res.status(200).json({ ok: true, staf, rincian: Object.fromEntries(bayar), total: totalGaji });
    }
    if (aksi === 'hadiah-log') { // riwayat hadiah kades (cek sudah masuk atau belum) + saldo terkini penerima
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const L = (await kv(['LRANGE', 'hadiah:log', 0, 9]) || []).map(jparse).filter(Boolean);
      const us = [...new Set(L.map(x => x.u))], sv = us.length ? await kv(['HMGET', 'saldo', ...us]) || [] : [];
      const sm = Object.fromEntries(us.map((u, i) => [u, +sv[i] || 0]));
      return res.status(200).json({ daftar: L.map(x => ({ ...x, saldo: sm[x.u] })) });
    }
    if (aksi === 'hadiah') { // hadiah Receh dari kades (bukan traktiran: tidak masuk daftar Pendukung)
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const t = cleanU(body.target), n = Math.floor(+body.n), why = String(body.alasan || '').replace(/[<>]/g, '').trim().slice(0, 60) || 'hadiah dari kepala desa';
      if (!okU(t) || !warga(D, t)) return res.status(404).json({ error: 'Warga @' + t + ' tidak ditemukan' });
      if (!(n >= 1 && n <= 50)) return res.status(400).json({ error: 'Jumlah Receh 1–50' });
      const saldo = await kv(['HINCRBY', 'saldo', t, n]);
      await kvMany([['LPUSH', 'saldo:log:' + t, JSON.stringify({ at: Date.now(), n, ket: 'hadiah: ' + why })], ['LTRIM', 'saldo:log:' + t, 0, 49], ['LPUSH', 'hadiah:log', JSON.stringify({ u: t, n, why, at: Date.now() })], ['LTRIM', 'hadiah:log', 0, 99]]);
      return res.status(200).json({ ok: true, u: t, saldo: +saldo || n });
    }
    if (aksi === 'tambah-saldo') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const t = cleanU(body.target), n = Math.floor(+body.n);
      if (!okU(t) || !warga(D, t)) return res.status(404).json({ error: 'Warga @' + t + ' tidak ditemukan' });
      if (!(n >= 1 && n <= 500)) return res.status(400).json({ error: 'Jumlah Receh 1–500' });
      const saldo = await kv(['HINCRBY', 'saldo', t, n]);
      await kvMany([['HINCRBY', 'donasi', t, n], ['LPUSH', 'saldo:log:' + t, JSON.stringify({ at: Date.now(), n, ket: 'kades' })], ['LTRIM', 'saldo:log:' + t, 0, 49]]);
      if (body.hapus) await kv(['LREM', 'trk:tanpakode', 1, String(body.hapus)]);
      return res.status(200).json({ ok: true, u: t, saldo });
    }
    if (aksi === 'reaksi') { // {target, r: mantap|genteng|tetangga, pesan?} · 1x per rumah per hari, tidak ke rumah sendiri
      const t = cleanU(body.target), r = String(body.r || ''); if (!RX[r]) return res.status(400).json({ error: 'Reaksi tidak dikenal' });
      if (!warga(D, t)) return res.status(404).json({ error: 'Rumah tidak ditemukan' }); if (t === s.u) return res.status(400).json({ error: 'Nggak bisa kasih reaksi ke rumah sendiri 😄' });
      if (!warga(D, s.u) && s.u !== OWNER) return res.status(403).json({ error: 'Cuma warga yang bisa kasih reaksi.' });
      let pesan = String(body.pesan || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (pesan && /(https?:|www\.|\.(com|id|net|org|ly|co)\b|@\w)/i.test(pesan)) return res.status(400).json({ error: 'Pesan nggak boleh berisi link atau mention.', kode: 'pesan' });
      if (pesan && pesanKasar(pesan)) return res.status(400).json({ error: 'Pesanmu ada kata yang kurang sopan. Ganti kata-katanya, atau kirim reaksi tanpa pesan ya 🙏', kode: 'kasar' });
      const day = hariWIB(); if (!(await kv(['SET', 'rx:d:' + day + ':' + s.u + ':' + t, r, 'NX', 'EX', 2 * 864e2]))) return res.status(429).json({ error: 'Kamu sudah kasih reaksi ke rumah ini hari ini. Besok lagi ya!' });
      const w0 = awalMinggu(), now = Date.now();
      await kvMany([['HINCRBY', 'rx:n:' + t, r, 1], ['HINCRBY', 'rx:hari:' + day, t, 1], ['EXPIRE', 'rx:hari:' + day, 3 * 864e2], ['HINCRBY', 'rx:w:' + w0 + ':p', t, RX[r]], ['HSET', 'rx:w:' + w0 + ':t', t, String(now)], ['EXPIRE', 'rx:w:' + w0 + ':p', 40 * 864e2], ['EXPIRE', 'rx:w:' + w0 + ':t', 40 * 864e2],
        ['LPUSH', 'rx:log:' + t, JSON.stringify({ u: s.u, r, pesan: pesan || null, at: now })], ['LTRIM', 'rx:log:' + t, 0, 99]]);
      return res.status(200).json({ ok: true });
    }
    if (aksi === 'pindah-beli') { // beli tiket Jasa Pindahan pakai Receh
      const j = String(body.jenis || ''); const P = PINDAH[j]; if (!P) return res.status(400).json({ error: 'Jenis tiket tidak dikenal' });
      if (!warga(D, s.u)) return res.status(403).json({ error: 'Cuma warga yang punya rumah yang bisa pindah.' });
      if ((await tiketKu(s.u))[j] >= 1) return res.status(400).json({ error: 'Kamu masih punya tiket ' + (j === 'heli' ? 'Helikoper' : 'Truk Titut') + '. Pakai dulu buat pindah ya!' });
      if (j === 'heli') { const all = await pindahSemua(), terisi = new Set(Object.values(all).filter(v => v.lok).map(v => v.x + ',' + v.y)), sisa = EKS.filter(e => !terisi.has(e.x + ',' + e.y)).length;
        if (await heliTerjual() >= sisa) return res.status(400).json({ error: 'Tiket Helikoper lagi habis: semua kavling eksklusif sudah ada yang pesan.' }) }
      const after = await kv(['HINCRBY', 'saldo', s.u, -P.harga]);
      if (after < 0) { await kv(['HINCRBY', 'saldo', s.u, P.harga]); return res.status(400).json({ error: 'Recehan belum cukup. Butuh ' + P.harga + ' Receh.', kurang: P.harga - (after + P.harga) }) }
      await kvMany([['HINCRBY', 'tiket', s.u + ':' + j, 1], ['LPUSH', 'saldo:log:' + s.u, JSON.stringify({ at: Date.now(), n: -P.harga, ket: j === 'heli' ? 'Tiket Helikoper' : 'Tiket Truk Titut' })], ['LTRIM', 'saldo:log:' + s.u, 0, 49]]);
      return res.status(200).json({ ok: true, kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'pindah') { // pakai 1 tiket: rumah diangkut ke kavling tujuan {jenis,x,y}
      const j = String(body.jenis || ''), P = PINDAH[j], x = Math.round(+body.x), y = Math.round(+body.y); if (!P || !isFinite(x) || !isFinite(y)) return res.status(400).json({ error: 'Data pindahan tidak lengkap' });
      const r = warga(D, s.u); if (!r) return res.status(403).json({ error: 'Cuma warga yang punya rumah yang bisa pindah.' });
      const tk = await tiketKu(s.u); if (tk[j] < 1) return res.status(400).json({ error: 'Kamu belum punya tiket ' + (j === 'heli' ? 'Helikoper' : 'Truk Titut') + '.' });
      const cd = +(await kv(['PTTL', 'pindah:cd:' + s.u])) || 0; if (cd > 0) return res.status(400).json({ error: 'Kamu baru pindah. Bisa pindah lagi ' + Math.ceil(cd / 864e5) + ' hari lagi.' });
      const ek = eksDi(x, y); if (!(diJalurK(x, y) || (j === 'heli' && ek))) return res.status(400).json({ error: j === 'truk' && ek ? 'Kavling eksklusif cuma bisa didatangi Helikoper.' : 'Kavling itu tidak bisa dipilih.' });
      const all = await pindahSemua(), kini = all[s.u] || null, dari = kini ? { x: kini.x, y: kini.y } : { x: r.x, y: r.y };
      const tempati = (D.residents || []).some(o => { const u2 = String(o.name).toLowerCase(), p = all[u2]; return p ? false : o.x === x && o.y === y });
      if (tempati) return res.status(409).json({ error: 'Kavling itu sudah ada rumahnya.' });
      if (!(await kv(['HSETNX', 'kavlock', x + ',' + y, s.u]))) return res.status(409).json({ error: 'Yah, kavling itu baru saja dipesan warga lain. Pilih yang lain ya.' });
      const after = await kv(['HINCRBY', 'tiket', s.u + ':' + j, -1]); if (after < 0) { await kvMany([['HINCRBY', 'tiket', s.u + ':' + j, 1], ['HDEL', 'kavlock', x + ',' + y]]); return res.status(400).json({ error: 'Tiket tidak cukup.' }) }
      const v = { x, y, lok: ek ? ek.lok : null, via: j, at: Date.now(), dur: P.dur, dari, lokDari: kini ? kini.lok || null : null };
      const cmds = [['HSET', 'pindah', s.u, JSON.stringify(v)], ['SET', 'pindah:cd:' + s.u, '1', 'PX', JEDA_PINDAH * 1000], ['LPUSH', 'pindah:log', JSON.stringify({ u: s.u, via: j, lok: v.lok, dari, x, y, at: v.at })], ['LTRIM', 'pindah:log', 0, 49]];
      if (kini) cmds.push(['HDEL', 'kavlock', kini.x + ',' + kini.y]);
      await kvMany(cmds);
      return res.status(200).json({ ok: true, pindah: v, kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'tiket-hadiah') { // kades: kasih tiket gratis {target: "a,b,c", jenis, n}
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const j = String(body.jenis || ''); if (!PINDAH[j]) return res.status(400).json({ error: 'Jenis tiket tidak dikenal' });
      const n = Math.max(-5, Math.min(5, Math.round(+body.n || 1))), L = String(body.target || '').split(/[\s,]+/).map(cleanU).filter(okU);
      if (!L.length) return res.status(400).json({ error: 'Tulis username warga' });
      const bukan = L.filter(u => !warga(D, u)); const ok = L.filter(u => warga(D, u));
      if (ok.length) await kvMany(ok.flatMap(u => [['HINCRBY', 'tiket', u + ':' + j, n], ['LPUSH', 'saldo:log:' + u, JSON.stringify({ at: Date.now(), n: 0, ket: (n > 0 ? '🎁 Hadiah ' : 'Koreksi ') + n + ' tiket ' + (j === 'heli' ? 'Helikoper' : 'Truk Titut') })]]));
      return res.status(200).json({ ok: true, dapat: ok, bukan });
    }
    if (aksi === 'gento') { // pemilik GENTO: suruh main (terbang keliling ±30 mnt) / suruh pulang (istirahat di rumah 1 jam). Posisi dihitung di perangkat dari jam.
      const m = String(body.m || ''); if (m !== 'main' && m !== 'pulang') return res.status(400).json({ error: 'Perintah tidak dikenal' });
      const pem = await kv(['GET', 'robot:pemilik']); if (String(pem || '').toLowerCase() !== s.u) return res.status(403).json({ error: 'Ini bukan GENTO-mu.' });
      const kol = await koleksi(s.u); if (!kol.pajang.includes('robot')) return res.status(400).json({ error: 'Pajang dulu GENTO-mu di pekarangan.' });
      if (!(await kv(['SET', 'gento:cd', '1', 'NX', 'EX', 8]))) return res.status(429).json({ error: 'Sebentar ya, GENTO baru aja dapat perintah.' });
      const lama = jparse(await kv(['GET', 'robot:mode'])); const mode = { m, at: Date.now(), ...(lama ? { dari: { m: lama.m, at: lama.at } } : {}) };
      await kv(['SET', 'robot:mode', JSON.stringify(mode), 'EX', 3 * 864e2]);
      return res.status(200).json({ ok: true, mode });
    }
    if (aksi === 'jalan') { // pemilik motor/sepeda menyuruh kendaraannya keliling kampung sekarang (jeda 60 detik)
      const id = String(body.id || ''); if (id !== 'motor' && id !== 'sepeda') return res.status(400).json({ error: 'Kendaraan tidak dikenal' });
      const kol = await koleksi(s.u); if (!kol.pajang.includes(id)) return res.status(400).json({ error: 'Pajang dulu ' + id + '-mu di pekarangan.' });
      if (!(await kv(['SET', 'jalan:cd:' + s.u, '1', 'NX', 'EX', 60]))) return res.status(429).json({ error: 'Kendaraanmu masih jalan. Tunggu sebentar ya.' });
      const at = Date.now(); await kv(['HSET', 'jalan', s.u, JSON.stringify({ id, at })]);
      return res.status(200).json({ ok: true, id, at });
    }
    if (aksi === 'pajang') {
      const kol = await koleksi(s.u), punya = kol.own.map(o => o.id);
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter(id => punya.includes(id));
      if (ids.length > MAKS_PAJANG) return res.status(400).json({ error: `Maksimal ${MAKS_PAJANG} item dipajang.` });
      kol.pajang = ids; await kv(['HSET', 'itemplus', s.u, JSON.stringify(kol)]);
      return res.status(200).json({ kartu: await infoKartu(D, s.u) });
    }
    if (aksi === 'antre-warna' || aksi === 'antre-ubah') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const out = [];
      for (const j of Object.keys(JENIS)) {
        const kodes = await kv(['SMEMBERS', j + ':antre']) || [];
        if (!kodes.length) continue;
        const vals = await kvMany(kodes.map(k => ['GET', j + ':req:' + k]));
        kodes.forEach((k, i) => { const v = jparse(vals[i]); if (v && v.status === 'menunggu') out.push({ kode: k, jenis: j, ...v }); });
        const tetap = out.filter(o => o.jenis === j); if (tetap.length) await kvMany(tetap.flatMap(o => [['PERSIST', j + ':req:' + o.kode], ['PERSIST', j + ':user:' + o.u]]));
        const basi = kodes.filter((k, i) => !jparse(vals[i])); if (basi.length) await kv(['SREM', j + ':antre', ...basi]);
      }
      out.sort((a, b) => a.at - b.at);
      return res.status(200).json({ antre: out });
    }
    if (aksi === 'cicil') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const kode = String(body.kode || '').trim().toUpperCase(), jenis = Object.keys(JENIS).find(j => kode.startsWith(JENIS[j].awal + '-'));
      const v = jenis && jparse(await kv(['GET', jenis + ':req:' + kode]));
      if (!v || !['menunggu', 'dibatalkan', 'diganti'].includes(v.status)) return res.status(404).json({ error: 'Pesanan ' + kode + ' tidak ditemukan atau sudah diproses' });
      const n = Math.max(1, Math.min(50, Math.floor(+body.n || 1))); v.bayar = (+v.bayar || 0) + n;
      await kv(['SET', jenis + ':req:' + kode, JSON.stringify(v), ...EXP(jenis)]);
      return res.status(200).json({ ok: true, bayar: v.bayar, harga: v.harga || 1, lunas: v.bayar >= (v.harga || 1) });
    }
    if (aksi === 'status') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      let ig = { ok: false };
      try { const j = await igGet('https://graph.instagram.com/v21.0/me?fields=username,followers_count&access_token=' + encodeURIComponent(IG_TOKEN)); ig = { ok: true, username: j.username, followers: j.followers_count } }
      catch (e) { ig = { ok: false, error: String(e.message || e).slice(0, 140) } }
      const [at, n, log] = await kvMany([['GET', 'igc:at'], ['GET', 'igc:list'], ['LRANGE', 'trk:log', 0, 0]]);
      const terakhir = jparse((log || [])[0]);
      return res.status(200).json({ ig, komen: { at: +at || null, jumlah: (jparse(n) || []).length }, trakteer: terakhir ? { at: terakhir.at, nama: terakhir.nama, qty: terakhir.qty } : null, aktif: await kartuAktif() });
    }
    if (aksi === 'tanpa-kode') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      if (body.hapus) await kv(['LREM', 'trk:tanpakode', 1, String(body.hapus)]);
      const [L, last] = await kvMany([['LRANGE', 'trk:tanpakode', 0, 49], ['GET', 'trk:terakhir']]);
      return res.status(200).json({ list: (L || []).map(x => ({ raw: x, ...(jparse(x) || {}) })), terakhir: jparse(last) });
    }
    if (aksi === 'cari-kode') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const kode = String(body.kode || '').trim().toUpperCase(), jenis = Object.keys(JENIS).find(j => kode.startsWith(JENIS[j].awal + '-'));
      const v = jenis && jparse(await kv(['GET', jenis + ':req:' + kode]));
      if (!v) return res.status(404).json({ error: 'Kode ' + kode + ' tidak ditemukan (salah ketik, atau pesanan sudah lama dibatalkan).' });
      return res.status(200).json({ pesanan: { kode, jenis, ...v } });
    }
    if (aksi === 'konfirmasi-warna' || aksi === 'konfirmasi-ubah') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const kode = String(body.kode || '').toUpperCase(), jenis = Object.keys(JENIS).find(j => kode.startsWith(JENIS[j].awal + '-'));
      const v = jenis && jparse(await kv(['GET', jenis + ':req:' + kode]));
      if (!v || !['menunggu', 'dibatalkan', 'diganti'].includes(v.status)) return res.status(404).json({ error: 'Pesanan ' + kode + ' tidak ditemukan atau sudah diproses' });
      await terapkan(kv, kvMany, jenis, kode, v, !!body.ok, 'kades');
      return res.status(200).json({ ok: true, u: v.u, jenis, status: body.ok ? 'disetujui' : 'ditolak' });
    }
    if (aksi === 'reset-jatah') {
      if (s.u !== OWNER) return res.status(403).json({ error: 'Khusus kepala desa' });
      const t = cleanU(body.target);
      if (!okU(t) || !warga(D, t)) return res.status(404).json({ error: 'Warga @' + t + ' tidak ditemukan' });
      await kv(['DEL', 'ganti:' + t]);
      return res.status(200).json({ ok: true, u: t });
    }
    return res.status(400).json({ error: 'Aksi tidak dikenal' });
  } catch (e) {
    return res.status(502).json({ error: 'Server lagi sibuk, coba lagi sebentar.', detail: String(e && e.message || e).slice(0, 120) });
  }
}
