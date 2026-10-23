// SEMENTARA: cek apakah IG_TOKEN bisa membaca komentar (untuk Kartu Komen).
// Hanya mengembalikan ringkasan (jumlah & field yang tersedia), tanpa token, tanpa isi komentar.
export default async function handler(req, res) {
  const token = String(process.env.IG_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  res.setHeader('Cache-Control', 'no-store');
  if (!token) return res.status(500).json({ ok: false, step: 'token', error: 'IG_TOKEN belum diatur' });
  const g = async (path) => {
    const r = await fetch('https://graph.instagram.com/v21.0/' + path + (path.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token));
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && !j.error, j };
  };
  try {
    const me = await g('me?fields=user_id,username,account_type');
    if (!me.ok) return res.status(200).json({ ok: false, step: 'me', error: me.j.error && me.j.error.message });
    const media = await g('me/media?fields=id,timestamp,comments_count,media_type&limit=5');
    if (!media.ok) return res.status(200).json({ ok: false, step: 'media', error: media.j.error && media.j.error.message });
    const list = media.j.data || [];
    const out = [];
    for (const m of list.slice(0, 3)) {
      const c = await g(m.id + '/comments?fields=id,text,timestamp,hidden,from{id,username}&limit=50');
      out.push({
        media_type: m.media_type, timestamp: m.timestamp, comments_count: m.comments_count,
        bisa_baca: c.ok, error: c.ok ? undefined : (c.j.error && c.j.error.message),
        dibaca: c.ok ? (c.j.data || []).length : 0,
        ada_username: c.ok ? (c.j.data || []).some(x => x.from && x.from.username) : null,
        ada_field_hidden: c.ok ? (c.j.data || []).some(x => 'hidden' in x) : null,
        tersembunyi: c.ok ? (c.j.data || []).filter(x => x.hidden).length : null,
        ada_halaman_lanjut: c.ok ? !!(c.j.paging && c.j.paging.next) : null,
      });
    }
    return res.status(200).json({ ok: true, akun: me.j.username, tipe: me.j.account_type, media: out });
  } catch (e) {
    return res.status(200).json({ ok: false, step: 'fetch', error: String(e && e.message || e) });
  }
}
