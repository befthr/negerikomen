// Webhook Trakteer: setiap traktiran masuk, Trakteer mengirim datanya ke sini.
// - Kode pesanan di pesan traktiran (WARNA-/EMAS-/RUKO-/ITEM-XXXX) dibaca otomatis → Genteng dicatat ke pesanan itu (cicilan ikut terhitung).
// - Tanpa kode pesanan: kalau ada kode DOMPET-XXXX atau @username warga → masuk Saldo Genteng warga itu; kalau tidak ada → daftar "tanpa kode" untuk kades.
// - Kelebihan bayar pesanan juga masuk Saldo Genteng.
// - Lunas → langsung diterapkan otomatis (warna, bendera emas, item). Ruko & papan nama tetap menunggu konfirmasi kepala desa.
// Keamanan: header X-Webhook-Token harus sama dengan env TRAKTEER_WEBHOOK_TOKEN (token dari dashboard Trakteer → Integrations → Webhook).
import { terapkan, bolehOtomatis } from './_terapkan.js';
const KV_URL = String(process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const KV_TOKEN = String(process.env.KV_REST_API_TOKEN || '');
const TOKEN = String(process.env.TRAKTEER_WEBHOOK_TOKEN || '').trim();
const AWAL = { WARNA: 'warna', EMAS: 'emas', RUKO: 'ruko', ITEM: 'item', TINGKAT: 'tingkat' };

async function kvMany(cmds) {
  const r = await fetch(KV_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await r.json().catch(() => []);
  if (!r.ok) throw new Error('db: ' + r.status);
  return j.map(x => x && x.result);
}
const kv = async c => (await kvMany([c]))[0];
let DATA = null, DATA_AT = 0;
async function dataKampung(req) {
  if (DATA && Date.now() - DATA_AT < 60000) return DATA;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const t = await (await fetch('https://' + host + '/data.js?v=' + Math.floor(Date.now() / 60000))).text();
  DATA = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); DATA_AT = Date.now(); return DATA;
}
const jparse = s => { try { return s ? JSON.parse(s) : null } catch (e) { return null } };
// semua teks di payload (pesan bisa ada di supporter_message / message / dll.)
const teksSemua = o => { const out = []; const jalan = v => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(jalan) }; jalan(o); return out.join(' ') };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST saja' });
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'Database belum tersambung' });
  const tok = String(req.headers['x-webhook-token'] || '').trim();
  if (!TOKEN || tok !== TOKEN) return res.status(401).json({ error: 'Token webhook salah' });
  const b = (req.body && typeof req.body === 'object') ? req.body : jparse(req.body) || {};
  try {
    const id = String(b.transaction_id || b.id || b.order_id || '') || 'x' + Date.now();
    if (!(await kv(['SET', 'trk:id:' + id, '1', 'NX', 'EX', 90 * 864e2]))) return res.status(200).json({ ok: true, dobel: true });
    const qty = Math.max(1, Math.floor(+(b.quantity ?? b.qty ?? b.unit_quantity ?? 1)) || 1);
    const nama = String(b.supporter_name || b.name || b.supporter || '').slice(0, 60);
    const pesan = String(b.supporter_message || b.message || b.support_message || '').slice(0, 300);
    const masuk = { id, nama, qty, pesan, at: Date.now() };
    await kv(['INCRBY', 'goal:genteng', qty]); // progres goal kampung (semua traktiran)
    const kodes = [...new Set((teksSemua(b).toUpperCase().match(/\b(WARNA|EMAS|RUKO|ITEM|TINGKAT)-[A-Z0-9]{4}\b/g) || []))];
    const hasil = [];
    for (const kode of kodes.slice(0, 3)) {
      const jenis = AWAL[kode.split('-')[0]], key = jenis + ':req:' + kode, v = jparse(await kv(['GET', key]));
      if (!v || !['menunggu', 'dibatalkan', 'diganti'].includes(v.status)) { hasil.push({ kode, ada: false }); continue }
      if (v.status !== 'menunggu') v.status = 'menunggu'; // sudah dibayar → kembali ke antrean walau sempat dibatalkan/diganti
      await kv(['HINCRBY', 'donasi', v.u, qty]); // otomatis masuk daftar Pendukung kampung
      v.bayar = (+v.bayar || 0) + qty; v.trk = [...(v.trk || []), { nama, qty, at: masuk.at }].slice(-10);
      await kvMany([['SET', key, JSON.stringify(v), 'KEEPTTL'], ['SADD', jenis + ':antre', kode]]);
      let auto = false;
      if (v.bayar >= (v.harga || 1) && bolehOtomatis(jenis, v)) { await terapkan(kv, kvMany, jenis, kode, v, true, 'otomatis'); auto = true }
      hasil.push({ kode, ada: true, u: v.u, bayar: v.bayar, harga: v.harga || 1, otomatis: auto });
    }
    // kelebihan bayar pesanan → masuk Saldo Genteng
    for (const h of hasil) if (h.ada && h.bayar > h.harga) { const lebih = Math.min(qty, h.bayar - h.harga), u = h.u; if (u && lebih > 0) await kvMany([['HINCRBY', 'saldo', u, lebih], ['LPUSH', 'saldo:log:' + u, JSON.stringify({ at: masuk.at, n: lebih, ket: 'lebih ' + h.kode })]]) }
    let cocok = hasil.some(h => h.ada), saldoU = null;
    // tanpa kode pesanan → Saldo Genteng (lewat kode DOMPET-XXXX atau @username warga)
    if (!cocok) {
      const dk = (teksSemua(b).toUpperCase().match(/\bDOMPET-[A-Z0-9]{4}\b/) || [])[0];
      if (dk) saldoU = await kv(['GET', 'dompet:k:' + dk]);
      // Trakteer menolak tanda @ di pesan → terima username dengan ATAU tanpa @ (harus sama persis dengan username warga, min 4 huruf)
      if (!saldoU) { const ats = ((pesan + ' ' + (nama || '')).match(/@?[A-Za-z0-9._]{4,30}/g) || []).map(x => x.replace(/^@/, '').toLowerCase().replace(/\.+$/, '')).filter(x => x.length >= 4);
        if (ats.length) { const D = await dataKampung(req); const W = new Set((D.residents || []).map(r => String(r.name).toLowerCase())); saldoU = ats.find(a => W.has(a)) || null } }
      if (saldoU) { await kvMany([['HINCRBY', 'saldo', saldoU, qty], ['HINCRBY', 'donasi', saldoU, qty], ['LPUSH', 'saldo:log:' + saldoU, JSON.stringify({ at: masuk.at, n: qty, ket: 'traktir' })], ['LTRIM', 'saldo:log:' + saldoU, 0, 49]]); cocok = true }
    }
    await kvMany([
      ['LPUSH', 'trk:log', JSON.stringify({ ...masuk, kodes, cocok, saldo: saldoU })], ['LTRIM', 'trk:log', 0, 199],
      ...(cocok ? [] : [['LPUSH', 'trk:tanpakode', JSON.stringify({ ...masuk, kodes })], ['LTRIM', 'trk:tanpakode', 0, 99]]),
      ['SET', 'trk:terakhir', JSON.stringify(b).slice(0, 4000), 'EX', 30 * 864e2],
    ]);
    return res.status(200).json({ ok: true, hasil, saldo: saldoU });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal mencatat', detail: String(e && e.message || e).slice(0, 120) });
  }
}
