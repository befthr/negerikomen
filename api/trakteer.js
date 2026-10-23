// Webhook Trakteer: setiap traktiran masuk, Trakteer mengirim datanya ke sini.
// - Kode pesanan di pesan traktiran (WARNA-/EMAS-/RUKO-/ITEM-XXXX) dibaca otomatis → Genteng dicatat ke pesanan itu (cicilan ikut terhitung).
// - Traktiran tanpa kode masuk daftar "tanpa kode" supaya kepala desa bisa mencocokkan manual.
// Keamanan: header X-Webhook-Token harus sama dengan env TRAKTEER_WEBHOOK_TOKEN (token dari dashboard Trakteer → Integrations → Webhook).
const KV_URL = String(process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const KV_TOKEN = String(process.env.KV_REST_API_TOKEN || '');
const TOKEN = String(process.env.TRAKTEER_WEBHOOK_TOKEN || '').trim();
const AWAL = { WARNA: 'warna', EMAS: 'emas', RUKO: 'ruko', ITEM: 'item' };

async function kvMany(cmds) {
  const r = await fetch(KV_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await r.json().catch(() => []);
  if (!r.ok) throw new Error('db: ' + r.status);
  return j.map(x => x && x.result);
}
const kv = async c => (await kvMany([c]))[0];
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
    const kodes = [...new Set((teksSemua(b).toUpperCase().match(/\b(WARNA|EMAS|RUKO|ITEM)-[A-Z0-9]{4}\b/g) || []))];
    const hasil = [];
    for (const kode of kodes.slice(0, 3)) {
      const jenis = AWAL[kode.split('-')[0]], key = jenis + ':req:' + kode, v = jparse(await kv(['GET', key]));
      if (!v || !['menunggu', 'dibatalkan', 'diganti'].includes(v.status)) { hasil.push({ kode, ada: false }); continue }
      if (v.status !== 'menunggu') v.status = 'menunggu'; // sudah dibayar → kembali ke antrean walau sempat dibatalkan/diganti
      v.bayar = (+v.bayar || 0) + qty; v.trk = [...(v.trk || []), { nama, qty, at: masuk.at }].slice(-10);
      await kvMany([['SET', key, JSON.stringify(v), 'KEEPTTL'], ['SADD', jenis + ':antre', kode]]);
      hasil.push({ kode, ada: true, bayar: v.bayar, harga: v.harga || 1 });
    }
    const cocok = hasil.some(h => h.ada);
    await kvMany([
      ['LPUSH', 'trk:log', JSON.stringify({ ...masuk, kodes, cocok })], ['LTRIM', 'trk:log', 0, 199],
      ...(cocok ? [] : [['LPUSH', 'trk:tanpakode', JSON.stringify({ ...masuk, kodes })], ['LTRIM', 'trk:tanpakode', 0, 99]]),
      ['SET', 'trk:terakhir', JSON.stringify(b).slice(0, 4000), 'EX', 30 * 864e2],
    ]);
    return res.status(200).json({ ok: true, hasil });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal mencatat', detail: String(e && e.message || e).slice(0, 120) });
  }
}
