# DoluMu — Hetzner'e Sıfırdan Kurulum ve Taşıma Planı

> **Durum (Temmuz 2026):** DigitalOcean droplet (Postgres + FastAPI backend) tamamen silindi.
> Sistem Hetzner Cloud üzerinde sıfırdan kurulacak. Frontend zaten Vercel'de ve dokunulmayacak.
> Bu doküman: (1) sistemin envanterini, (2) senin platform panellerinden yapacaklarını,
> (3) AI agent'ın terminalden yapacağı tüm işleri, (4) doğrulama ve yedekleme adımlarını içerir.
> En sonda "tamamen ücretsiz (Vercel + Supabase) mümkün mü?" analizi var.

---

## ✅ AS-BUILT — Taşıma Tamamlandı (2026-07-08)

Sistem canlı: **https://ibb-transport.onthewifi.com** (Caddy otomatik TLS ile).

| Öğe | Gerçekleşen değer |
|---|---|
| Sunucu | Hetzner CX23, **IP 65.21.51.249**, Ubuntu 26.04 LTS (resolute), 2 vCPU / 4 GB + 2 GB swap |
| Docker | `docker.io` 29.1 + `docker-compose-v2` 2.40 (Ubuntu reposu; docker.com reposu 26.04 için gerekmedi) |
| Uygulama dizini | `/opt/dolumu/app` (git: `github.com/farukkamcici/doluMu`, HEAD 30d064f) |
| Servisler | `transport_db` (pg15), `transport_api` (uvicorn, iç ağda expose:8000), `caddy` (80/443) — hepsi `restart: unless-stopped` |
| DB durumu | transport_lines **1023**, daily_forecasts **49.104** (2026-07-08 & 07-09), metro_schedules **436** (dump'tan), admin_users **1** (`admin`) |
| Güvenlik | UFW 22/80/443, SSH key-only, fail2ban aktif, `.env` chmod 600 |
| Yedek | Gecelik `pg_dump` → `/opt/dolumu/backups/` (03:30, 14 gün saklama) + Hetzner disk backup |
| Reboot testi | ✅ Sunucu yeniden başlatıldı; tüm konteynerler + swap + ufw + forecast otomatik geri geldi |

**Doğrulanan canlı endpoint'ler:** `/` , `/api/forecast/{M2,34,500T}` (metro/otobüs/metrobüs — tahmin+kapasite+servis saatleri), `/api/traffic/istanbul` (canlı %), `/api/admin/metro/cache/status` (freeze=true, 436 kayıt), admin login.

**Vercel:** Prod `NEXT_PUBLIC_API_URL = https://ibb-transport.onthewifi.com/api` doğrulandı — domain değişmediği için Vercel'de değişiklik yapılmadı. No-IP A kaydı yeni IP'ye çevrildi.

**⚠️ Yönetimsel notlar:**
- **Admin şifresi** `.env` içinde (`ADMIN_PASSWORD`), kullanıcı adı `admin`. Sunucuda `cat /opt/dolumu/app/.env` ile görülebilir. İlk fırsatta `/api/admin/users/change-password` ile değiştir.
- **Kod açığı bulundu ve düzeltildi:** `create_admin_user_if_not_exists()` (src/api/auth.py) tanımlıydı ama startup'ta hiçbir yerden çağrılmıyordu; bu kurulumda admin elle oluşturuldu. `refactor/backend-cleanup` ile fonksiyon artık `main.py` lifespan'inde çağrılıyor, yani bundan sonra temiz deploy'larda admin otomatik gelir.
- **`line_shapes.json` eksikti:** Repo/lokalde yoktu (sadece eski droplet'te üretilmişti). `data/raw/ibb_hat_guzergahlari.json`'dan `process_route_shapes.py` ile yeniden üretildi (48 MB, 841 hat) ve sunucuya kondu. Bu dosya git'te değil — sunucu yeniden kurulursa tekrar üretilmeli.
- **No-IP** free hostname 30 günde bir onay ister. Kalıcı çözüm: `api.dolumu.app` A kaydı + Vercel env güncellemesi (bkz. Bölüm 3.2).

---

## 1. Sistem Envanteri (Ne Nerede Çalışıyor?)

| Bileşen | Teknoloji | Nerede | Durum |
|---|---|---|---|
| Frontend (dolumu.app) | Next.js PWA | Vercel | ✅ Ayakta, dokunulmayacak |
| Backend API | FastAPI + LightGBM + Polars (Docker) | ~~DO droplet~~ → **Hetzner** | ❌ Silindi, yeniden kurulacak |
| Veritabanı | Postgres 15 (Docker, `postgres_data` volume) | ~~DO droplet~~ → **Hetzner** | ❌ Silindi |
| Cron işleri | APScheduler (API process içinde) | API container | API ile birlikte gelir |
| API domain | `ibb-transport.onthewifi.com` (No-IP) | DNS → droplet IP | ⚠️ Yeni IP'ye yönlendirilecek |

**API'nin çalışmak için diskte ihtiyaç duyduğu dosyalar** (compose `.:/app` mount ettiği için sunucuya kopyalanmalı):

- `models/lgbm_transport_v7.txt` (6 MB) — LightGBM modeli
- `data/processed/features_pl.parquet` (213 MB) — FeatureStore, startup'ta RAM'e yüklenir
- `data/processed/calendar_dim.parquet`, `weather_dim.parquet`, `transport_meta.parquet` (DB seed bunu okur)
- `data/processed/line_shapes.json` — rota geometrileri
- `data/processed/bus_capacity_snapshots/` (~28 MB) — kapasite parquet'leri
- `config/` — rail capacity, data filters

> `data/raw` (1.4 GB), `data/interim`, `mlruns`, `frontend/` sunucuya **gerekmez**.

**Runtime cron işleri (APScheduler, Europe/Istanbul):** günlük forecast (T ve T+1 → `daily_forecasts` tablosuna yazar), eski forecast temizliği, metro/bus schedule prefetch. Public `/api/forecast` endpoint'i tahminleri **DB'den okur**; model inference sadece batch job + admin endpoint'lerinde çalışır.

---

## 2. Veri Kaybı Envanteri — Neler Geri Gelir?

| Tablo | Geri gelir mi? | Nasıl |
|---|---|---|
| `transport_lines` | ✅ Otomatik | `init_db` startup'ta `transport_meta.parquet`'ten seed eder |
| `daily_forecasts` | ✅ Otomatik | Günlük cron job yeniden üretir (ilk gün manuel tetiklenebilir) |
| `admin_users` | ✅ Otomatik | Startup'ta `ADMIN_USERNAME`/`ADMIN_PASSWORD` env'den oluşur |
| `metro_schedules` | ✅ **Dump'tan restore** | Repo içindeki `seeds/metro_schedules_2026-01-17.sql.gz` (artık git ile versiyonlanıyor) — **kritik**, çünkü İBB Metro API'si bozuk ve sistem `METRO_CACHE_FREEZE=1` ile son bilinen veriyi servis ediyor. Bu dump olmadan metro tarifeleri çalışmaz. |
| `bus_schedules` | ⚠️ Muhtemelen | Prefetch job İETT API'sinden yeniden çeker (İETT API çalışıyorsa). İlk gece dolması beklenir. |
| `user_reports` | ❌ Kayıp | Kullanıcı bildirimleri droplet ile silindi, yedeği yok. Kabullenilecek. |
| `job_executions` | ➖ Önemsiz | Sıfırdan başlar. |

> **Ders:** Bölüm 6'daki yedekleme kurulumu bu yüzden zorunlu adım — bir daha hiçbir tablo sunucuyla birlikte ölmeyecek.

---

## 3. AŞAMA 1 — Platform İşleri (SEN yapacaksın, panel üzerinden)

### 3.1 Hetzner Cloud

1. https://console.hetzner.cloud → hesap aç (kimlik doğrulaması isteyebilir, kredi kartı/PayPal ekle).
2. Yeni proje oluştur: `dolumu`.
3. **Security → SSH Keys → Add SSH key**: lokal makinendeki `~/.ssh/id_ed25519.pub` içeriğini yapıştır. (Yoksa agent Aşama 2.0'da üretecek, önce onu yaptır.)
4. **Add Server**:
   - Location: **Nuremberg veya Falkenstein** (Almanya; İstanbul'a latency ~50-60ms, sorun değil — API zaten DB'den okuyor)
   - Image: **Ubuntu 24.04**
   - Type: **Shared vCPU x86 → CX23** (2 vCPU / 4 GB RAM / 40 GB disk, **€5.49/ay**). FeatureStore ~1-1.5 GB RAM yiyor, 4 GB güvenli. Yetmezse panelden CX33'e (8 GB, €8.49) tek tıkla rescale edilir.
   - Networking: **Public IPv4 ✔** (küçük ek ücret, ~€0.50/ay) + IPv6 ✔
   - SSH key: az önce eklediğini seç
   - **Backups: ✔ aç** (fiyatın +%20'si ≈ €1.10/ay — droplet dersinden sonra şart)
   - Firewall (oluştur ve ata): inbound **22, 80, 443 TCP** izinli, gerisi kapalı
5. Sunucu açılınca **public IPv4 adresini not et** → agent'a ver.

**Toplam maliyet: ~€7/ay (~sunucu 5.49 + IPv4 0.50 + backup 1.10). Vercel frontend ücretsiz kalıyor.**

### 3.2 DNS (No-IP — onthewifi.com)

1. https://my.noip.com → `ibb-transport.onthewifi.com` hostname'inin **A kaydını yeni Hetzner IP'sine** güncelle.
2. ⚠️ No-IP free hostname'ler **30 günde bir manuel onay** ister; e-postalarını kaçırma. Kalıcı çözüm istersen `dolumu.app` DNS'ine `api.dolumu.app → Hetzner IP` A kaydı ekleyip frontend env'ini ona geçirmek daha sağlıklı (CORS listesinde `dolumu.app` zaten var; `api.dolumu.app` origin olarak sorun çıkarmaz çünkü origin kontrolü frontend domain'ine göre yapılır).

### 3.3 Vercel

- Domain değişmiyorsa **hiçbir şey yapma** (`NEXT_PUBLIC_API_URL=https://ibb-transport.onthewifi.com/api` aynı kalır).
- `api.dolumu.app`'e geçersen: Vercel → Project → Settings → Environment Variables → `NEXT_PUBLIC_API_URL=https://api.dolumu.app/api` → Redeploy.

---

## 4. AŞAMA 2 — Terminal İşleri (AI AGENT yapacak)

> Bu bölüm agent için runbook'tur. Agent'a "Hetzner kurulumunu MIGRATION_HETZNER.md Aşama 2'ye göre yap, sunucu IP'si: X.X.X.X" demen yeterli.
> Placeholder'lar: `<SERVER_IP>`, `<API_DOMAIN>` (örn. ibb-transport.onthewifi.com).

### 2.0 Ön kontroller (lokalde)

```bash
# SSH key var mı? Yoksa üret
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
# Gerekli dosyalar lokalde tam mı?
ls -lh models/lgbm_transport_v7.txt data/processed/features_pl.parquet \
      data/processed/line_shapes.json data/processed/transport_meta.parquet \
      seeds/metro_schedules_2026-01-17.sql.gz
```

### 2.1 Sunucu temel kurulum + sertleştirme

```bash
ssh root@<SERVER_IP> 'bash -s' <<'EOF'
set -e
apt-get update && apt-get -y upgrade
apt-get -y install ca-certificates curl git ufw fail2ban unattended-upgrades
# Docker (resmi repo)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# 2 GB swap (parquet yükleme anındaki tepe kullanım için)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# UFW (Hetzner firewall'a ek, ikinci katman)
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
# SSH: sadece key ile giriş
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
systemctl enable --now fail2ban
mkdir -p /opt/dolumu
EOF
```

### 2.2 Kod ve veriyi taşı

```bash
# Kod (git'ten, .git dahil — sonraki deploy'lar git pull ile)
ssh root@<SERVER_IP> 'git clone https://github.com/<GITHUB_USER>/ibb-transport.git /opt/dolumu/app || true'
# git repo private ise alternatif: lokalden rsync
# rsync -az --exclude .venv --exclude node_modules --exclude frontend --exclude mlruns \
#   --exclude 'data/raw' --exclude 'data/interim' --exclude .git ./ root@<SERVER_IP>:/opt/dolumu/app/

# Büyük veri dosyaları (git'te yok) — sadece runtime'ın ihtiyacı olanlar (~1 GB)
rsync -avz --progress \
  data/processed/features_pl.parquet \
  data/processed/calendar_dim.parquet \
  data/processed/weather_dim.parquet \
  data/processed/transport_meta.parquet \
  data/processed/transport_district_hourly_clean.parquet \
  data/processed/line_shapes.json \
  root@<SERVER_IP>:/opt/dolumu/app/data/processed/
rsync -avz data/processed/bus_capacity_snapshots/ root@<SERVER_IP>:/opt/dolumu/app/data/processed/bus_capacity_snapshots/
rsync -avz models/ root@<SERVER_IP>:/opt/dolumu/app/models/
rsync -avz config/ root@<SERVER_IP>:/opt/dolumu/app/config/
rsync -avz seeds/ root@<SERVER_IP>:/opt/dolumu/app/seeds/
```

### 2.3 `.env` oluştur (sunucuda)

Agent güçlü şifreler üretip `/opt/dolumu/app/.env` yazar (lokal `.env`'deki değerleri **kopyalama**, taze secret üret):

```bash
ssh root@<SERVER_IP> 'bash -s' <<'EOF'
cd /opt/dolumu/app
PG_PASS=$(openssl rand -hex 24); JWT=$(openssl rand -hex 32); ADMIN_PASS=$(openssl rand -base64 18)
cat > .env <<ENV
POSTGRES_USER=transport
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=transport
POSTGRES_HOST=db
POSTGRES_PORT=5432
WEATHER_API_URL=https://api.open-meteo.com/v1/forecast
JWT_SECRET_KEY=${JWT}
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASS}
# İBB Metro API bozuk olduğu sürece freeze açık kalsın
METRO_CACHE_FREEZE=1
METRO_CACHE_RETENTION_DAYS=3650
MODEL_PATH=models/lgbm_transport_v7.txt
ENV
chmod 600 .env
echo "ADMIN_PASSWORD=${ADMIN_PASS}"   # agent bunu kullanıcıya güvenli şekilde iletir
EOF
```

### 2.4 Reverse proxy (Caddy) + prod compose override

Caddy otomatik Let's Encrypt TLS alır — certbot/nginx uğraşı yok. Agent şu iki dosyayı sunucuda oluşturur:

**`/opt/dolumu/app/Caddyfile`**
```
<API_DOMAIN> {
    reverse_proxy api:8000
    encode gzip
}
```

**`/opt/dolumu/app/docker-compose.prod.yml`**
```yaml
services:
  db:
    restart: unless-stopped
  api:
    restart: unless-stopped
    ports: !override []          # dışarı port yok; Caddy iç ağdan erişir
    expose:
      - "8000"
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api

volumes:
  caddy_data:
  caddy_config:
```

### 2.5 Ayağa kaldır + metro dump restore

```bash
ssh root@<SERVER_IP> 'bash -s' <<'EOF'
set -e
cd /opt/dolumu/app
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# API'nin init_db + model yüklemesini bekle
sleep 30 && docker compose logs api | tail -20

# metro_schedules dump restore (tablolar init_db ile oluştu)
gunzip -k seeds/metro_schedules_2026-01-17.sql.gz
docker compose exec -T db psql -U transport -d transport < metro_schedules_2026-01-17.sql
rm metro_schedules_2026-01-17.sql
EOF
```

### 2.6 İlk forecast'i tetikle

Cron gece çalışır; site hemen veri göstersin diye admin endpoint'inden manuel tetikle:

```bash
TOKEN=$(curl -s -X POST https://<API_DOMAIN>/api/admin/login \
  -d 'username=admin&password=<ADMIN_PASS>' \
  -H 'Content-Type: application/x-www-form-urlencoded' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -X POST https://<API_DOMAIN>/api/admin/jobs/daily-forecast/trigger -H "Authorization: Bearer $TOKEN"
# (endpoint yolu farklıysa: docker compose exec api python -c "..." ile scheduler fonksiyonu doğrudan çağrılır)
```

---

## 5. AŞAMA 3 — Doğrulama Checklist

```bash
curl -s https://<API_DOMAIN>/                       # {"message":"Istanbul Transport Crowding API"}
curl -s https://<API_DOMAIN>/api/lines | head -c 300 # hat listesi dolu mu
curl -s "https://<API_DOMAIN>/api/forecast?..."      # forecast job sonrası veri var mı
```

- [ ] TLS sertifikası geçerli (Caddy otomatik aldı mı: `docker compose logs caddy`)
- [ ] `GET /api/admin/metro/cache/status` → `storage.freeze_enabled: true` ve satır sayısı > 0 (dump geldi mi)
- [ ] dolumu.app'i aç → forecast grafiği, harita, metro tarife widget'ı çalışıyor (timetable UI kapalıysa notice görünür — normal)
- [ ] CORS hatası yok (browser console)
- [ ] Ertesi sabah: `job_executions`'da gece cron'ları success; `bus_schedules` dolmaya başladı
- [ ] Sunucu reboot testi: `reboot` sonrası her şey `restart: unless-stopped` ile geri kalkıyor

---

## 6. AŞAMA 4 — Yedekleme (bir daha asla veri kaybı yok)

1. **Hetzner Backups** panelden açıldı (Aşama 1) — tüm disk, 7 kopya.
2. **Gecelik pg_dump** (agent kurar):

```bash
ssh root@<SERVER_IP> 'bash -s' <<'EOF'
mkdir -p /opt/dolumu/backups
cat > /etc/cron.d/dolumu-pgdump <<'CRON'
30 3 * * * root cd /opt/dolumu/app && docker compose exec -T db pg_dump -U transport transport | gzip > /opt/dolumu/backups/transport_$(date +\%F).sql.gz && find /opt/dolumu/backups -name '*.sql.gz' -mtime +14 -delete
CRON
EOF
```

3. **Sunucu-dışı kopya (önerilir):** haftada bir lokal makineden `rsync root@<SERVER_IP>:/opt/dolumu/backups/ ~/Backups/dolumu/` — ya da agent'a Cloudflare R2 (10 GB free) + rclone kurdurabilirsin. Özellikle `user_reports` ve `metro_schedules` artık sadece bu yedeklerde güvende olur.

---

## 7. ARAŞTIRMA — Tamamen Ücretsiz (Vercel API + Supabase DB) Mümkün mü?

**Kısa cevap: Bugünkü kod ile HAYIR; ciddi bir refactor ile teknik olarak evet ama önerilmez.**

### Neden mevcut haliyle olmaz

1. **Boyut:** Vercel serverless function limiti 250 MB (sıkıştırılmamış). Tek başına `features_pl.parquet` 213 MB + lightgbm/polars/pandas/scikit bağımlılıkları ≈ 500 MB+. Sığmaz.
2. **Mimari:** API kalıcı bir process — startup'ta ~1 GB+ veri RAM'e yükler ve **APScheduler cron'ları process içinde** çalışır. Serverless'ta kalıcı process yok; her cold start'ta 213 MB parquet okumak hem yavaş hem Hobby planındaki **4 saat/ay aktif CPU** kotasını hızla eritir.
3. **Süre limiti:** Hobby'de function timeout ~60 sn; günlük batch forecast (tüm hatlar × 48 saat) dakikalar sürer.
4. **Vercel Cron (Hobby):** günde 1 kez / 2 job ile sınırlı ve yine function timeout'a tabi.
5. **Kural:** Vercel Hobby planı ticari kullanım için yasak (dolumu.app gelir getirmiyorsa sorun değil, ama bilinmeli).

### Supabase tarafı aslında uyar

DB içeriği küçük (forecast + cache tabloları ≪ 500 MB free limit) ve günlük cron yazdığı için 7 günlük inaktivite pause'una takılmaz. **Yani darboğaz DB değil, API/compute.**

### "Gerçekten ücretsiz" istenirse mimari şöyle değişmeli (refactor planı)

- Public API'yi inceltip (sadece DB'den okuyan endpoint'ler, model/parquet yüklemeden) Vercel function'a al; FeatureStore/model bağımlılığını `predict` ve admin'den ayır.
- APScheduler'ı sil → **GitHub Actions** günlük cron: parquet'leri Cloudflare R2'den (10 GB free) indirir, LightGBM batch forecast'i Actions runner'ında çalıştırır, sonucu Supabase'e yazar. (Actions: public repo'da ücretsiz, private'ta 2000 dk/ay — günlük ~10 dk'lık job rahat sığar.)
- Metro freeze cache ve bus prefetch de Actions'a taşınır.
- **Maliyet: €0. Bedeli:** birkaç günlük ciddi refactor + üç ayrı ücretsiz platformun kota/kırılganlık riski + kotalardan biri değişirse yeniden taşınma.

### Alternatif: Oracle Cloud Always Free

Gerçek anlamda ücretsiz 7/24 sunucu isteyen tek seçenek: Oracle Always Free (4 ARM OCPU / 24 GB RAM). Mevcut Docker kurulumu **kod değişikliği olmadan** çalışır. Riskler: kayıt/kapasite çileleri, idle hesapların geri alınabilmesi, ARM (lightgbm aarch64 wheel var, sorun beklenmez). "Sıfır TL, biraz kumar" seçeneği.

### Karar önerisi

| Seçenek | Maliyet | Efor | Risk |
|---|---|---|---|
| **Hetzner CX23 (önerilen)** | ~€7/ay | Yarım gün, kod değişikliği yok | Düşük |
| Vercel + Supabase + GH Actions | €0 | Birkaç gün refactor | Orta-yüksek (kota kırılganlığı) |
| Oracle Always Free | €0 | Yarım gün (Hetzner ile aynı runbook) | Hesap/kapasite belirsizliği |

Ayda ~€7, sıfır refactor ve tam kontrol ile **Hetzner en sağlıklı yol**. İleride maliyet sıfırlamak istersen bölümdeki refactor planı hazır.
