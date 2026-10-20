// Jumlah follower @negerikomen langsung dari Instagram API.
// Token disimpan aman di Vercel (Environment Variable IG_TOKEN), tidak pernah dikirim ke browser.
export default async function handler(req, res) {
  const token = String(process.env.IG_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!token) return res.status(500).json({ error: 'IG_TOKEN belum diatur' });
  try {
    const r = await fetch('https://graph.instagram.com/me?fields=username,followers_count&access_token=' + encodeURIComponent(token));
    const j = await r.json();
    if (!r.ok || j.error) return res.status(502).json({ error: (j.error && j.error.message) || 'Gagal' });
    // cache di CDN Vercel 10 menit supaya tidak membebani API
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ followers: j.followers_count, username: j.username, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: 'Instagram tidak bisa dihubungi' });
  }
}
