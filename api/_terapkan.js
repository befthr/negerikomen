// Menerapkan / menolak pesanan ubah rumah & item. Dipakai api/kartu.js (konfirmasi kades) dan api/trakteer.js (konfirmasi otomatis).
const jparse = s => { try { return s ? JSON.parse(s) : null } catch (e) { return null } };
const hariIni = () => { const w = new Date(Date.now() + 7 * 3600e3); return Math.round((Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - Date.UTC(2026, 9, 18)) / 864e5) };
const MAKS_PAJANG = 3;
// boleh otomatis begitu lunas: semua kecuali ruko (cek formulir) dan papan nama (tulisan bebas, disaring kades)
export const bolehOtomatis = (jenis, v) => jenis !== 'ruko' && !(jenis === 'item' && (v.items || []).includes('papan'));
export async function terapkan(kv, kvMany, jenis, kode, v, ok, oleh) {
  if (ok) {
    const day = hariIni();
    if (jenis === 'warna') {
      const ex = jparse(await kv(['HGET', 'warnaplus', v.u])) || [];
      ex.push({ day, note: '🎨 Ganti warna (traktir 1 Genteng)', wall: v.wall, roof: v.roof, style: v.style === undefined ? undefined : v.style });
      await kvMany([['HSET', 'warnaplus', v.u, JSON.stringify(ex)], ['HDEL', 'pilihan', v.u]]);
    } else if (jenis === 'emas') {
      await kv(['HSET', 'emasplus', v.u, JSON.stringify({ day, kode })]);
    } else if (jenis === 'tingkat') {
      await kv(['HSET', 'tingkatplus', v.u, JSON.stringify({ lantai: v.lantai, day, kode })]);
    } else if (jenis === 'ruko') {
      await kv(['HSET', 'rukoplus', v.u, JSON.stringify({ wall: v.wall, roof: v.roof, day, kode })]);
    } else {
      const raw = jparse(await kv(['HGET', 'itemplus', v.u])), kol = raw && Array.isArray(raw.own) ? raw : { own: [], pajang: [] };
      v.items.forEach(id => {
        const o = { id, day, ...(id === 'papan' ? { teks: v.teks } : {}), ...(v.warna && v.warna[id] ? { warna: v.warna[id] } : {}) }, i = kol.own.findIndex(x => x.id === id);
        if (i >= 0) kol.own[i] = o; else kol.own.push(o);
        if (!kol.pajang.includes(id) && kol.pajang.length < MAKS_PAJANG) kol.pajang.push(id);
      });
      await kv(['HSET', 'itemplus', v.u, JSON.stringify(kol)]);
    }
  }
  await kvMany([['SET', jenis + ':req:' + kode, JSON.stringify({ ...v, status: ok ? 'disetujui' : 'ditolak', oleh: oleh || 'kades' }), 'EX', 7 * 864e2],
    ['SREM', jenis + ':antre', kode]]);
  if (await kv(['GET', jenis + ':user:' + v.u]) === kode) await kv(['DEL', jenis + ':user:' + v.u]);
}
