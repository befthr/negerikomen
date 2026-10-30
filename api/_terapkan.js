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
      ex.push({ day, note: v.gratis ? '🎨 Ganti warna (gratis warga baru)' : '🎨 Ganti warna (1 Receh)', wall: v.wall, roof: v.roof, style: v.style === undefined ? undefined : v.style });
      await kvMany([['HSET', 'warnaplus', v.u, JSON.stringify(ex)], ['HDEL', 'pilihan', v.u]]);
      { const md = jparse(await kv(['HGET', 'modifplus', v.u])); if (md) await kv(['HSET', 'modifplus', v.u, JSON.stringify({ ...md, wall: v.wall, roof: v.roof })]) } // rumah yang sudah dimodif: warna barunya ikut
      if (Array.isArray(v.atas) && v.atas.length) { const tk = jparse(await kv(['HGET', 'tingkatplus', v.u])) || {}; await kv(['HSET', 'tingkatplus', v.u, JSON.stringify({ ...tk, lantai: tk.lantai || v.atas.length + 1, atas: v.atas })]) }
    } else if (jenis === 'emas') {
      await kv(['HSET', 'emasplus', v.u, JSON.stringify({ day, kode })]);
    } else if (jenis === 'tingkat') {
      const tk = jparse(await kv(['HGET', 'tingkatplus', v.u])) || {};
      await kv(['HSET', 'tingkatplus', v.u, JSON.stringify({ ...tk, lantai: v.lantai, day, kode })]);
    } else if (jenis === 'ruko') {
      await kv(['HSET', 'rukoplus', v.u, JSON.stringify({ wall: v.wall, roof: v.roof, day, kode })]);
    } else {
      const raw = jparse(await kv(['HGET', 'itemplus', v.u])), kol = raw && Array.isArray(raw.own) ? raw : { own: [], pajang: [] };
      for (const ek of ['robot', 'patromax', 'sorot', 'naga', 'mbulan', 'karpet']) if (v.items.includes(ek)) { // barang eksklusif cuma 1: kunci permanen untuk pemiliknya
        const p = await kv(['GET', ek + ':pemilik']);
        if (p && p !== v.u) v.items = v.items.filter(id => id !== ek); else await kv(['SET', ek + ':pemilik', v.u]);
      }
      v.items.forEach(id => {
        const o = { id, day, ...(id === 'papan' ? { teks: v.teks } : {}), ...(v.warna && v.warna[id] ? { warna: v.warna[id] } : {}) }, i = kol.own.findIndex(x => x.id === id);
        if (i >= 0) kol.own[i] = o; else kol.own.push(o);
        if (id !== 'naga' && !kol.pajang.includes(id) && kol.pajang.length < MAKS_PAJANG) kol.pajang.push(id); // naga terbang di langit, tidak makan slot pekarangan
      });
      await kv(['HSET', 'itemplus', v.u, JSON.stringify(kol)]);
    }
    // riwayat belanja terbaru (ditampilkan di panel toko/dealer/TB)
    await kvMany([['LPUSH', 'belanja:log', JSON.stringify({ u: v.u, j: jenis, it: v.items || [], l: v.lantai || 0, at: Date.now() })], ['LTRIM', 'belanja:log', 0, 59]]);
  }
  await kvMany([['SET', jenis + ':req:' + kode, JSON.stringify({ ...v, status: ok ? 'disetujui' : 'ditolak', oleh: oleh || 'kades' }), 'EX', 7 * 864e2],
    ['SREM', jenis + ':antre', kode]]);
  if (await kv(['GET', jenis + ':user:' + v.u]) === kode) await kv(['DEL', jenis + ':user:' + v.u]);
}
