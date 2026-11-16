# Peta Toilet ITB (Kampus Ganesha)

Aplikasi web interaktif untuk memetakan lokasi toilet di lingkungan **ITB Kampus Ganesha, Bandung**, lengkap dengan koordinat presisi, foto kondisi terkini, pencarian toilet terdekat berbasis GPS beserta rute jalan kaki, serta portal admin tersembunyi berbasis login Google.

## Fitur Utama

### Publik (`/`)
- **Peta Interaktif ITB Kampus Ganesha**: Menampilkan seluruh titik lokasi toilet menggunakan peta vektor OpenFreeMap (`MapLibre GL JS`) tanpa membutuhkan API key maupun risiko blokir tile server OSM.
- **Detail Minimalis Toilet**: Klik pin untuk melihat **nama lokasi**, **koordinat** (dengan tombol salin), dan **foto kondisi terkini** (dapat diperbesar).
- **Cari Toilet Terdekat**: Jika pengguna mengizinkan akses lokasi (GPS), aplikasi menentukan toilet terdekat, menggambar **rute jalan kaki** di atas peta (`OSRM foot profile` dengan fallback garis lurus otomatis), serta menyediakan tautan **Buka di Google Maps**.
- **Daftar & Pencarian**: Cari cepat lokasi toilet berdasarkan nama gedung/lokasi.

### Admin Tersembunyi (`/<ADMIN_PORTAL_SLUG>`, default `/kelola-toilet`)
- **Login Google OAuth 2.0 + PKCE**: Hanya email Google yang terdaftar pada `ADMIN_EMAILS` (`.env`) atau tabel `Admin` di database yang diizinkan masuk.
- **Endpoint Tersembunyi**: Tidak ditautkan di antarmuka publik, menggunakan `noindex, nofollow`, dan mengembalikan `404` untuk slug lain (seperti `/admin` atau `/login`).
- **Tandai Titik & Unggah Foto**: Admin dapat klik/geser pin langsung di peta, menggunakan GPS perangkat, atau memasukkan koordinat manual serta mengunggah/mengganti foto kondisi (JPG/PNG/WebP, maks. 5 MB).
- **Kelola Admin**: Admin dapat menambahkan akun Google rekan lain langsung dari dashboard; admin biasa hanya dapat mencabut akses admin yang ia tambahkan sendiri, sedangkan super-admin (`ADMIN_EMAILS`) dapat mencabut akses admin mana pun.

## Instalasi & Menjalankan Secara Lokal

1. **Salin konfigurasi environment**:
   ```bash
   cp .env.example .env
   ```
   Sesuaikan nilai di `.env`:
   - `ADMIN_PORTAL_SLUG`: ubah ke slug rahasia pilihan Anda (default `kelola-toilet`).
   - `AUTH_SECRET`: isi string acak minimal 32 karakter.
   - `ADMIN_EMAILS`: isi alamat Gmail utama Anda (pisahkan dengan koma jika lebih dari satu).
   - `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: lihat langkah konfigurasi Google OAuth di bawah.

2. **Install dependensi & siapkan database SQLite**:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   ```

3. **Jalankan server development**:
   ```bash
   npm run dev
   ```
   Buka `http://localhost:3000` untuk peta publik dan `http://localhost:3000/<ADMIN_PORTAL_SLUG>` untuk login admin.

## Konfigurasi Google OAuth 2.0

1. Buka [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials).
2. Buat proyek baru (atau pilih yang sudah ada), lalu siapkan **OAuth consent screen** (External/Internal, tambahkan scope `openid`, `email`, `profile`).
3. Klik **Create Credentials → OAuth client ID → Web application**.
4. Pada **Authorized redirect URIs**, tambahkan:
   - Lokal: `http://localhost:3000/api/auth/google/callback`
   - Produksi: `https://domain-anda.com/api/auth/google/callback`
5. Salin **Client ID** dan **Client Secret** ke `.env`.

> **Opsional (Preview Lokal Tanpa Google OAuth):**
> Untuk mencoba portal admin secara cepat saat pengembangan lokal (`NODE_ENV=development`) sebelum mengisi Google OAuth, set `DEV_MOCK_LOGIN="true"` di `.env`. Opsi ini otomatis diabaikan saat mode `production`.

## Pengujian & Verifikasi

```bash
npm test          # Unit test (geo, auth, validasi upload)
npx tsc --noEmit  # Type-check TypeScript
npm run lint      # ESLint
npm run build     # Production build Next.js
```

## Penyimpanan Data & Produksi

- Database SQLite disimpan di `./data/peta-toilet.db` (relatif `file:../data/peta-toilet.db` terhadap folder `prisma/`).
- Foto yang diunggah disimpan di `./data/uploads/` dan disajikan melalui `/api/uploads/[filename]`, sehingga aman dijalankan dengan `npm run build && npm run start` maupun container Docker (cukup mount volume `./data:/app/data`).
