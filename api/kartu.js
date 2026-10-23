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
//   POST pajang {ids} (Bearer) → pilih maks 3 item koleksi yang tampil di pekarangan
//   POST cicil {kode,n} (Bearer kartu @negerikomen) → catat Genteng cicilan yang sudah masuk untuk pesanan itu
//   POST tanpa-kode {hapus?} (Bearer kartu @negerikomen) → traktiran dari webhook Trakteer yang tidak memuat kode pesanan
//   POST cari-kode {kode} (Bearer kartu @negerikomen) → cari pesanan lewat kode, termasuk yang dibatalkan/diganti warga
//   POST antre-ubah / konfirmasi-ubah {kode,ok} (Bearer kartu @negerikomen) → cek & setujui pesanan
//   POST reset-jatah {target} (Bearer kartu @negerikomen) → kembalikan jatah ganti rumah warga minggu ini
import crypto from 'crypto';
import { terapkan } from './_terapkan.js';

const KV_URL = String(process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const KV_TOKEN = String(process.env.KV_REST_API_TOKEN || '');
const IG_TOKEN = String(process.env.IG_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const OWNER = 'negerikomen';
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
const JENIS = { warna: { awal: 'WARNA', harga: 1 }, emas: { awal: 'EMAS', harga: 2 }, ruko: { awal: 'RUKO', harga: 20 }, item: { awal: 'ITEM', harga: 0 } };
const KATALOG = { sepeda: 1, motor: 2, ayam: 1, kucing: 2, kambing: 2, lampu: 1, mangga: 1, kolam: 2, ayunan: 2, papan: 2 };
const MAKS_PAJANG = 3;
const okTeks = t => /^[\p{L}\p{N} .,'!&\-]{1,20}$/u.test(t);
// masa simpan pesanan (termasuk cicilan bendera emas): 14 hari
const EXP = j => ['EX', 14 * 864e2];
async function simpanStatus(jenis, kode, status) {
  const v = jparse(await kv(['GET', jenis + ':req:' + kode]));
  if (v && v.status === 'menunggu') await kv(['SET', jenis + ':req:' + kode, JSON.stringify({ ...v, status, ubah: Date.now() }), ...EXP(jenis)]);
}
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
  const got = await kvMany([['HGET', 'pilihan', u], ['GET', 'ganti:' + u], ['HGET', 'warnaplus', u], ['HGET', 'emasplus', u], ['HGET', 'itemplus', u], ['HGET', 'rukoplus', u], ...J.map(j => ['GET', j + ':user:' + u])]);
  const [p, g, ex, em, it, rk] = got, kodes = got.slice(6);
  const w0 = awalMinggu(), dipakai = (jparse(g) || []).filter(t => t >= w0).length;
  const r = await wargaPlus(D, u, jparse(ex) || []), V = r ? histOf(r) : [];
  const reqs = await kvMany(J.map((j, k) => kodes[k] ? ['GET', j + ':req:' + kodes[k]] : ['GET', 'kosong:']));
  const pesan = {}; J.forEach((j, k) => { const v = jparse(reqs[k]); pesan[j] = kodes[k] && v && v.status === 'menunggu' ? { kode: kodes[k], ...v } : null });
  let pil = jparse(p); if (pil && pil.nv !== V.length) pil = null; // kades bikin versi baru → versi baru yang tampil
  const kol = jparse(it); const m = pesan.warna;
  return { u, nick: r && r.nick || null, nomor: r ? D.residents.indexOf(warga(D, u)) + 2 : null, hari: r ? (+r.day || 1) : null,
    versi: V.length, dipakai: pil ? pil.n : V.length - 1, jatah: { total: JATAH, terpakai: dipakai, sisa: Math.max(0, JATAH - dipakai) },
    reset: new Date(w0 + 7 * 864e5).toISOString(), admin: u === OWNER,
    emas: !!(r && r.sup) || !!em, ruko: jparse(rk), items: kol && Array.isArray(kol.own) ? kol : { own: [], pajang: [] }, pesan,
    minta: m ? { kode: m.kode, wall: m.wall, roof: m.roof, style: m.style, at: m.at } : null };
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
const igUrl = (id, after) => 'https://graph.instagram.com/v21.0/' + id + '/comments?fields=text,from{username}&limit=50' + (after ? '&after=' + encodeURIComponent(after) : '') + '&access_token=' + encodeURIComponent(IG_TOKEN);
async function segarkanKomen() {
  if (!(await kv(['SET', 'igc:lock', '1', 'NX', 'EX', 20]))) return false;
  let media = jparse(await kv(['GET', 'igc:media']));
  if (!media) {
    const all = (await igGet('https://graph.instagram.com/v21.0/me/media?fields=id,caption&limit=15&access_token=' + encodeURIComponent(IG_TOKEN))).data || [];
    media = all.filter((m, i) => i === 0 || adaPenanda(m.caption)).slice(0, 3).map(m => m.id);
    await kv(['SET', 'igc:media', JSON.stringify(media), 'EX', 60]);
  }
  const list = jparse(await kv(['GET', 'igc:list'])) || [], ada = new Set(list.map(c => c.id));
  const tambah = j => (j.data || []).forEach(c => { if (!c.id || ada.has(c.id)) return; ada.add(c.id);
    const tx = norm(c.text); if (/\d/.test(tx)) list.push({ id: c.id, by: cleanU(c.from && c.from.username), tx }) });
  const cur = jparse(await kv(['GET', 'igc:cur'])) || {};
  for (const id of media) {
    // 2 halaman pertama (kalau Instagram mengurutkan terbaru dulu) …
    let j = await igGet(igUrl(id)); tambah(j);
    if (j.paging && j.paging.next && j.paging.cursors) { j = await igGet(igUrl(id, j.paging.cursors.after)); tambah(j) }
    // … lalu lanjut dari posisi terakhir (kalau urutannya terlama dulu), maks 6 halaman per penyegaran
    let after = cur[id] || null;
    for (let p = 0; after && p < 6; p++) {
      const k = await igGet(igUrl(id, after)); tambah(k);
      const nx = k.paging && k.paging.next && k.paging.cursors && k.paging.cursors.after;
      if (!nx) break; after = nx;
    }
    cur[id] = after || (j.paging && j.paging.cursors && j.paging.cursors.after) || null;
  }
  const simpan = list.slice(-IGC_MAKS);
  await kvMany([['SET', 'igc:list', JSON.stringify(simpan), 'EX', 3 * 864e2], ['SET', 'igc:cur', JSON.stringify(cur), 'EX', 3 * 864e2], ['SET', 'igc:at', String(Date.now()), 'EX', 3 * 864e2]]);
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
    if (aksi === 'pilihan' && req.method === 'GET') {
      const raw = await kv(['HGETALL', 'pilihan']) || [], out = {};
      for (let i = 0; i + 1 < raw.length; i += 2) { const p = jparse(raw[i + 1]); if (p) out[raw[i]] = { n: p.n, nv: p.nv } }
      const rx = await kv(['HGETALL', 'warnaplus']) || [], extra = {};
      for (let i = 0; i + 1 < rx.length; i += 2) { const e = jparse(rx[i + 1]); if (e && e.length) extra[rx[i]] = e }
      const [re, rr, ri, rd] = await kvMany([['HKEYS', 'emasplus'], ['HGETALL', 'rukoplus'], ['HGETALL', 'itemplus'], ['HGETALL', 'donasi']]);
      const donasi = {}; for (let i = 0; rd && i + 1 < rd.length; i += 2) donasi[rd[i]] = +rd[i + 1] || 0;
      const ruko = {}, item = {};
      for (let i = 0; rr && i + 1 < rr.length; i += 2) { const v = jparse(rr[i + 1]); if (v) ruko[rr[i]] = { wall: v.wall, roof: v.roof } }
      for (let i = 0; ri && i + 1 < ri.length; i += 2) { const v = jparse(ri[i + 1]); if (!v || !Array.isArray(v.pajang) || !v.pajang.length) continue;
        item[ri[i]] = v.pajang.map(id => { const o = (v.own || []).find(x => x.id === id); return o ? (o.teks ? { id, teks: o.teks } : { id }) : null }).filter(Boolean) }
      res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
      return res.status(200).json({ pilihan: out, extra, emas: re || [], ruko, item, donasi, aktif: await kartuAktif() });
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
        if ((now.wall || null) === wall && (now.roof || null) === roof) return res.status(400).json({ error: 'Warnanya sama dengan rumah versi itu.' });
        isi = { wall, roof, style, harga: 1 };
      } else if (jenis === 'emas') {
        if (info.emas) return res.status(400).json({ error: 'Rumahmu sudah punya bendera emas.' });
        isi = { harga: 2 };
      } else if (jenis === 'ruko') {
        const wall = String(body.wall || ''), roof = String(body.roof || '');
        if (!okWarna(wall) || !okWarna(roof)) return res.status(400).json({ error: 'Pilih warna ruko dulu.' });
        isi = { wall, roof, harga: 20 };
      } else {
        const ids = [...new Set((Array.isArray(body.items) ? body.items : []).map(String))].filter(id => KATALOG[id]);
        if (!ids.length) return res.status(400).json({ error: 'Pilih minimal satu item.' });
        const punya = info.items.own.map(o => o.id), dobel = ids.filter(id => id !== 'papan' && punya.includes(id));
        if (dobel.length) return res.status(400).json({ error: 'Kamu sudah punya: ' + dobel.join(', ') });
        let teks = null;
        if (ids.includes('papan')) { teks = String(body.teks || '').replace(/\s+/g, ' ').trim(); if (!okTeks(teks)) return res.status(400).json({ error: 'Tulisan papan nama 1–20 huruf/angka.' }) }
        isi = { items: ids, teks, harga: ids.reduce((t, id) => t + KATALOG[id], 0) };
      }
      const lama = await kv(['GET', jenis + ':user:' + s.u]); if (lama) { await simpanStatus(jenis, lama, 'diganti'); await kv(['SREM', jenis + ':antre', lama]) }
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
      return res.status(200).json({ kartu: await infoKartu(D, s.u) });
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
      if (!v) return res.status(404).json({ error: 'Kode ' + kode + ' tidak ditemukan (salah ketik, atau sudah lebih dari 14 hari).' });
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
