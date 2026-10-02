# DoluMu — Ürün ve Tasarım Rehberi (v3)

Backend'e dokunulmadı; her şey mevcut `/api` kontratı ve `public/data` altındaki statik dosyalar
üzerine kurulu.

## 1. v2'den ne öğrendik

v2 işlevseldi ama jenerik görünüyordu: her şey yuvarlak kartın içinde, turkuaz vurgu rengi,
yeşil-sarı-kırmızı "trafik ışığı" grafikleri, "Hangi hatla gidiyorsun?" gibi bir karşılama başlığı
ve küçük bir kutuya sıkışmış, işe yaramayan bir harita. Ana sayfa kullanıcı bir şey aramadan
hiçbir bilgi vermiyordu.

## 2. Referanslar ve aldıklarımız

| Referans | Aldığımız |
|---|---|
| **TfL Go** (Londra) | Harita uygulamanın başlangıç noktası; ağın tamamı canlı bir harita olarak görünür. |
| **SBB Mobile / JR East** | Doluluk kişi ikonlarıyla gösterilir (1–4 figür), en yoğun seviye kırmızı. Renk tek başına anlam taşımaz. |
| **Transit 6.0** | Hat kimliği büyük, kalın, resmi hat renkleriyle; bilgi hiyerarşisi tek bir ana sayıya odaklı. |
| **İstasyon kalkış tabloları** | Az sayıda yazı boyutu, sabit satır düzeni, yüksek kontrast, gereksiz hiçbir şey yok. |
| **Google Maps "Popüler saatler"** | Gün içi profil, hattın kendi en yoğun saatine göreli; "şimdi" işaretli. |
| **Tren kapısı üstündeki hat şeridi** | Raylı hat sayfasında istasyonlar, hattın renginde dikey bir şerit; aktarmalar işaretli. |

## 3. Tasarım yönü: "kağıt ve mürekkep"

- **Renk:** Kağıt rengi zemin (`#EFEDE7`), mürekkep metin. Uygulamada tek kendi rengi var: zirve
  saatleri için sinyal kırmızısı. Geri kalan bütün renkler hatların resmi renkleri (Metro İstanbul
  topolojisinden). Koyu temada siyah zemin, sıcak beyaz metin; aynı kurallar.
- **Yazı:** Barlow / Barlow Semi Condensed. DIN türevi, ulaşım tabelalarına yakın bir grotesk.
  Hat kodları, saatler ve başlıklar dar kesimle; rakamlar tablo hizalı.
- **Yüzeyler:** Yüzen kart yok. Bölümler tam genişlik, ince çizgilerle ayrılır (basılı tarife
  gibi). Köşeler 4–6 px.
- **Tek cesur karar:** Harita. Ana sayfada İstanbul'un raylı ağı ve Metrobüs çizilir; çizgi
  kalınlığı seçilen saatteki tahmini yolcu sayısını gösterir. Saat kaydırıcısı veya "günü oynat"
  ile şehrin gün içinde nasıl dolup boşaldığı izlenir.
- **Harita kartografisi:** Tek bir baz stil (OpenFreeMap Positron) kendi paletimizle yeniden
  boyanır; binalar, POI'ler ve baz haritanın kendi raylı hatları gizlenir. Marmaray demiryolu
  konvansiyonuyla (mürekkep üzerine kesik çizgi), Metrobüs düz mürekkep, metro hatları resmi
  renkleriyle.

## 4. Kalabalık seviyesi

API'deki `occupancy_pct` zayıf kapasite tahminlerine dayanıyor ve birçok hatta gün boyu %100'de
kalıyor. Bu yüzden seviye, hattın o günkü en yoğun saatine göre hesaplanır:

| Seviye | Günün zirvesine oranı | Gösterim |
|---|---|---|
| Sakin | < %40 | 1 figür |
| Orta | %40–65 | 2 figür |
| Kalabalık | %65–85 | 3 figür |
| Zirve | ≥ %85 | 4 figür, kırmızı |

Haritadaki çizgi kalınlığı ise mutlak yolcu sayısıdır (tüm ağ için tek ölçek), çünkü harita
"insanlar şu an nerede?" sorusunu cevaplar.

## 5. Bilgi mimarisi

```
/[locale]               Ağ haritası (+ isteğe bağlı canlı otobüs katmanı) · arama · hizmet durumu ·
                        favoriler · "Şu an" panosu (tüm raylı hatlar + Metrobüs) · yakındakiler
/[locale]/line/[code]   Hattı vurgulayan harita · şu an (+ biraz bekleyince ne olur) · saatlik grafik ·
                        otobüste: duraklar, canlı araçlar ve varış süreleri · planlı kalkışlar ·
                        raylıda: istasyon şeridi (yolcu yoğunluğu çubuklarıyla) · hat künyesi ·
                        otobüste: güvenilirlik (son 14 gün)
/[locale]/stop/[code]   Duraktan geçen hatlar · sıradaki otobüsün tahmini varış süresi · yoğunluk
/[locale]/settings      Dil, tema, ana ekrana ekleme, sorun bildir, hakkında, yerel veriler
```

- Telefonda harita sayfanın üstünde (tam ekrana açılabilir, iki parmakla kaydırılır). Masaüstünde
  sol kolon içerik, sağ kolon tam yükseklik harita.
- Haritada bir hatta dokunmak hat sayfasını, bir istasyona dokunmak istasyon sayfasını (geçen
  hatlar ve şu anki durumları, olanaklar) açar.
- Arama hem hat kodu/güzergah hem de istasyon adıyla çalışır.

## 6. Veri kaynakları (frontend)

| Dosya / uç | İçerik |
|---|---|
| `public/data/metro_topology.json` | Metro, tramvay, füniküler, teleferik: istasyonlar, koordinatlar, renkler, hizmet saatleri |
| `public/data/marmaray_stations.json` | Marmaray'ın 43 istasyonu ve koordinatları (OpenStreetMap, ODbL) |
| `public/data/bus_routes/*.json`, `bus_stops.json` | İETT güzergah geometrisi ve durak → hat dizini |
| `public/data/rail_ridership.json` | İstasyon başına hafta içi medyan günlük giriş (İBB açık veri, en yeni yıl) |
| `GET /api/bus/{code}/history` | Backend: son 14 günün sefer/iptal/dakiklik özeti ve saat bazlı gerçek sefer süreleri |
| `GET /api/forecast/{code}` | Saatlik tahmin (pano için ~21 hat paralel, önbellekli) |

## 7. Canlı veri (v3.2)

Tahmin modeli geçmiş veriye dayanır; onun yanına İBB'nin canlı servislerinden "şu an gerçekte ne oluyor"
bilgisi eklendi. Bu servislerin hiçbiri CORS desteklemediği için tarayıcı `/api/live/*` Next.js
route'larını çağırır; bunlar sunucuda İBB'ye gider ve sonucu CDN'de önbelleğe alır
(`s-maxage` + uzun `stale-while-revalidate`). Bir servis düşerse ilgili bölüm sessizce gizlenir.

| Route | Kaynak | Önbellek | Kullanıldığı yer |
|---|---|---|---|
| `/api/live/metro/network` | Metro İstanbul `GetLines`, `GetStations` | 6 sa | Harita ağı, istasyonlar (yeni istasyonlar dahil), hat künyesi, hizmet saatleri |
| `/api/live/metro/status` | `GetServiceStatuses`, `GetAnnouncements`, `GetFaultyEquipment*` | 2 dk | Aksama bandı, haritada kırmızı kesik çizgi, asansör/yürüyen merdiven arızaları |
| `/api/live/fares` | `GetTicketPrice` | 1 gün | Ücret bilgisi |
| `/api/live/bus/lines` | İETT `GetHat_json` | 6 sa | Güncel hat adları, artık çalışmayan hatların gizlenmesi, yeni hatların eklenmesi, "2 biletli" tarifesi |
| `/api/live/bus/[code]` | İETT `DurakDetay_GYY_wYonAdi` | 1 gün | Sıralı duraklar, gerçek yön adları |
| `/api/live/bus/[code]/vehicles` | İETT `GetHatOtoKonum_json` | 30 sn | Canlı otobüsler (harita + durak şeridi), varış süreleri |
| `/api/live/fleet` | İETT `GetFiloAracKonum_json` (tüm filo, ~6,9 bin araç) | 30 sn | Ana haritada "Otobüsler" katmanı: hareket halindeki otobüsler, 10 km/s altı kırmızı |
| `/api/live/bus/notices` | İETT `GetDuyurular_json` | 5 dk | Duyurular |
| `/api/live/parking` | İSPARK `Park` | 5 dk | İstasyon yakınındaki otoparkların boş yeri |

`public/data/bus_routes/<HAT>.json`, `scripts/build-bus-routes.mjs` ile İETT'nin güzergah veri
setinden (7.401 güzergah, 257 MB) üretilir: her hattın tüm **depar**ları (güzergah varyantları; `D0` ana
güzergah, diğerleri kısa/alternatif seferler) gerçek yol geometrisi, uzunluk ve sefer süresiyle.
Bu veri seti canlı durumdan geride kalabildiği için (ör. 19 Kadıköy yerine artık Uzunçayır'a gidiyor)
güzergah çizgisi canlı durak listesine göre kurulur: iki durak arasında varyant yolu iki durağı da sırayla
kapsıyorsa yol izlenir, kapsamıyorsa durağa düz geçilir.

Canlı araçlar: `GetHatOtoKonum_json` hatta **atanmış** araçları verir, bunlar arasında garaja ya da
başlangıca boş giden araçlar da vardır (500T'de 33 aracın 7'si güzergahtan 1–6,5 km uzaktaydı). Bu
yüzden araç kendi deparının yoluna 300 m'den, ya da hattın herhangi bir durağına 350 m'den uzaksa
"güzergah dışında" sayılır: şeritte gösterilmez, haritada gri ve soluk çizilir. Kısa sefer yapan araçlarda
nereye kadar gittiği yazılır.

`public/data/bus_stops.json`, `scripts/build-bus-stops.mjs` ile üretilen durak → hat dizinidir
(13 bin durak; İETT'nin GTFS `stop_times` dosyası 1.048.576 satırda kesik olduğu için canlı servisten
türetildi). Statik dosyaların üçü de (`bus_stops`, `bus_routes`, `rail_ridership`)
`.github/workflows/refresh-transit-data.yml` ile her ayın 3'ünde yeniden üretilir; betikler bozuk bir
indirmeyle eski veriyi ezmez (alt sınır kontrolü), değişiklik varsa main'e commit atılır ve Vercel yayınlar.

**Sefer arşivi (backend).** `GetIettArsivGorev_json` bir günün tüm seferlerini verir (~55 bin satır, 20 MB:
hat, depar, araç, planlanan/gerçek kalkış ve bitiş; durum `T` tamamlandı, `I` iptal). Backend her gece
(03:40'tan itibaren saatlik, gün gelene kadar) dünü indirip hat başına özetler ve `bus_line_days`
tablosuna yazar; açılışta eksik son 14 günü doldurur. Hat sayfasındaki **Güvenilirlik** bloğu (ilk duraktan
±3 dk içinde kalkış oranı, iptaller, yolculuk) ve varış süreleri bu tablodan gelir.

**Günlük yolculuk arşivi.** İETT'nin ilk 50 hat için yayımladığı günlük yolculuk sayıları (2023-04-27'den beri)
backend'de `iett_daily_journeys` tablosunda tutulur (açılışta eksik günler doldurulur, her gece dün eklenir) ve
`GET /api/bus/journeys.csv` ile indirilebilir. Tahmin modeli bu veriyle güncellenmez; araştırma için saklanır.

**Durak olanakları.** `bus_stops.json` her durak için kapalı durak / akıllı ekran / engelli erişimi bitlerini de taşır
(`GetDurak_json`); durak sayfasında başlıkta gösterilir. Durak sayfasındaki hatlar en yakın varışa göre sıralanır.

**Sıradaki trenler.** İstasyon kartı ve "yakınındaki istasyonlar" listesi, Metro İstanbul'un `GetTimeTable` servisinden
o günün kalkışlarını alır (`/api/live/metro/departures/{istasyonId}`, 30 dk önbellek) ve her yön için sıradaki treni gösterir.

**Varış süresi.** Bir yönün uçtan uca süresi, geçen haftanın aynı günündeki gerçek sefer sürelerinin
o saatteki medyanıdır (yoksa İETT'nin planlı süresi). Araç en yakın durağına yerleştirilir; bir durağa
kalan süre, duraklar boyunca kalan mesafenin toplam mesafeye oranıyla ölçeklenir. İlk durakta bekleyen
araç planlı bir sonraki kalkışta çıkar varsayılır; kısa sefer yapan araç yalnızca deparının geçtiği
duraklar için sayılır.

Bulgular: İETT araç konumları yaklaşık dakikada bir güncellenir, servis kimlik doğrulama ve hız
sınırı uygulamaz (yine de CDN önbelleğiyle tek bir hat için en fazla 30 sn'de bir istek gider).
Metrobüs 34, 34AS, 34BZ… varyantlarıyla işlediği için Metrobüs sayfası tüm varyantların araçlarını
birleştirir; araçlar yön harfine göre değil bulundukları durağa göre yerleştirilir. İETT, metro
onarımlarında aynı kodla (ör. M7) aktarma otobüsü çalıştırabildiği için raylı kodlar önceliklidir.

## 8. Kurallar

- Renk tek başına anlam taşımaz; her seviye bir kelime ve figür sayısıyla birlikte gösterilir.
- Saat hesapları `Europe/Istanbul` diliminde yapılır.
- Dokunma hedefleri en az 44 px. Animasyonlar kısa tutulur ve `prefers-reduced-motion` ayarına uyar.
- Yeni bir renk eklemeden önce: bu bir hat rengi mi, değilse gerçekten gerekli mi?
