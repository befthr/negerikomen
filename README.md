# Negeri Komen · situs publik

Situs statis untuk link bio @negerikomen (negerikomen.vercel.app).

| File | Isi |
|---|---|
| `index.html` | Halaman situs (peta kampung, cari rumah, statistik, Trakteer, voucher). Jarang diubah. |
| `data.js` | Data kampung. **Ganti tiap hari** dengan hasil Negeri Komen Studio. |
| `logo.png`, `genteng.png` | Gambar logo dan ikon Genteng. |

## Update harian (±1 menit)
1. Di Negeri Komen Studio: muat `data.js` kemarin → tempel komentar → tambah bangunan hasil voting → **Salin isi data.js**.
2. Di GitHub: buka `data.js` → ikon pensil (Edit) → pilih semua → tempel → **Commit changes**.
3. Vercel otomatis memperbarui situs.

Tombol voucher hanya muncul kalau `voucher.url` diisi. Tombol Trakteer memakai `trakteer.url`.
Jangan ubah `x`/`y` warga secara manual supaya rumah tidak berpindah.
