# DoluMu iOS uygulaması: plan (v3)

> Durum: uygulamada · 2 Ekim 2026 · v3: uygulama API'si Vercel'de, sunucu "motor" olarak kalıyor.
> Tahmin modeline dokunulmaz (tez çalışması); uygulama yalnızca modelin çıktısını gösterir.

## 0. Kararlar (özet)

| Konu | Karar |
|---|---|
| Ad | **DoluMu** · paket kimliği `app.dolumu` |
| Platform | Önce **iOS** (Apple ekibi `G88QSG6V2M` · Faruk KAMÇICI). Android aynı kodla sonra. |
| Ücret | Ücretsiz. Reklam yok, uygulama içi satın alma yok. |
| Hesap | **Yok.** Favoriler cihazda saklanır. Bildirimler için cihaz anonim bir kimlikle kaydolur. |
| Siteyle ilişki | **Tamamen bağımsız.** Site sarmalanmaz, sitenin kodu ya da `/api/live/*` katmanı kullanılmaz. |
| API | **Uygulamanın tek adresi: uygulama API'si (Vercel, ücretsiz).** Canlı İBB verisi, varış süresi, araç sınıflandırması ve ekran başına toplu yanıtlar burada. **Sunucu (Hetzner, FastAPI) motor olarak kalır:** tahmin modeli, veritabanı, arşivler, bildirim job'ları. Uygulama sunucuyu hiç görmez; tahminler ve bildirim kaydı uygulama API'si üzerinden geçer. |
| Kod | Ayrı repo **`farukkamcici/dolumu-mobile`** (gizli): `apps/mobile` (Expo), `apps/api` (Vercel), `packages/core` (ortak tipler ve saf mantık). Motor tarafındaki değişiklikler bu repoda (`ibb-transport`). |
| Görsel dil | Mevcut **kâğıt & mürekkep** kimliği (Barlow, sinyal kırmızısı, hat renkleri), iOS desenleriyle yeniden kurulur. |
| Stack | Expo SDK 57 · Expo Router · React Native 0.87 (New Architecture) · TypeScript strict · MapLibre RN 11 · Reanimated + Gesture Handler · @gorhom/bottom-sheet 5 · TanStack Query 5 · Zustand + MMKV · use-intl · expo-notifications · expo-haptics · expo-location · Sentry |
| Derleme | EAS Build (bulut). Bu Mac'te yalnızca Xcode 27 beta var; Apple beta Xcode ile yapılan derlemeleri mağazaya kabul etmiyor. |

## 1. Ürün

### 1.1 v1 kapsamı
1. **Harita ana ekran.** Tam ekran ağ haritası, üstünde sürüklenebilir alt panel. Panelde arama,
   hizmet durumu, favoriler, yakınındakiler ve "Şu an" panosu. Haritada isteğe bağlı canlı otobüs katmanı.
2. **Hat.**
   - Tüm hatlarda: şu anki yoğunluk, "biraz bekleyebilirsen" önerisi, saatlik grafik (bugün/yarın).
   - Otobüste: canlı otobüsler, durak listesi ve her durak için varış süresi, planlı kalkışlar, güvenilirlik (14 gün).
   - Raylıda: istasyon şeridi (arızalar, yoğunluk çubukları), hat künyesi, aksama bandı.
3. **Durak.** Geçen hatlar, en yakın varışa göre sıralı; olanaklar (kapalı durak, akıllı ekran, engelli
   erişimi); **"Otobüs yaklaşınca haber ver"** düğmesi.
4. **İstasyon** (alt panelde). Sıradaki trenler, geçen hatlar ve yoğunlukları, asansör/yürüyen merdiven
   durumu, yakındaki İSPARK otoparkları.
5. **Arama.** Hat, istasyon, durak; son aramalar.
6. **Favoriler.** Hat ve istasyon; bildirim abonelikleri buradan yönetilir.
7. **Ayarlar.** Dil (TR/EN), tema, bildirimler, sorun bildir, hakkında ve veri kaynakları, gizlilik.

### 1.2 Bildirimler (ürün kararı)

| Bildirim | v1 | Varsayılan | Neden |
|---|---|---|---|
| **Otobüsüm yaklaşınca** (durakta "haber ver": seçilen hat ~N dk uzaklığa gelince tek bildirim) | ✅ | Kullanıcı başlatır | En değerli an: durağa ne zaman çıkacağını bilmek. 60 dk sonra kendiliğinden kapanır. |
| **Favori raylı hatta aksama** (Metro İstanbul aksama bildirdiğinde, bitince ikinci bildirim) | ✅ | Favori eklenince açık | Az ve önemli; yol planını değiştirir. |
| **Favori istasyonda asansör/yürüyen merdiven arızası** | ✅ | Kapalı, istasyon kartından açılır | Engelli ve bebek arabalı yolcu için kritik, diğerleri için gürültü. |
| İETT duyuruları (iptal edilen sefer vb.) | ❌ | — | Günde 250+ duyuru, sefer bazında; bildirim olarak çok gürültülü. Hat sayfasında gösterilir. |

Kurallar:
- Aynı konu için 1 saatte en fazla 1 bildirim.
- Bildirim metni ne olduğunu ve ne yapılacağını söyler ("M7'de aksama: Yıldız–Mecidiyeköy arası kapalı").
- Bildirime dokununca ilgili ekran açılır.
- İzin istenme anı: ilk "haber ver" veya favori ekleme. Açılışta izin istenmez.

### 1.3 UX ilkeleri (sitedekilerin mobil karşılığı)
- Tek elle kullanım: önemli eylemler ekranın alt yarısında. Alt panelin 3 durak noktası var:
  arama çubuğu / yarım / tam.
- Tek bakışta durum: her listede seviye kelime + figür ile gösterilir (renk tek başına anlam taşımaz).
- Gerçek zamanlı his: konumlar 30 sn'de bir yenilenir, değişiklik yumuşak animasyonla gelir;
  "şimdi"/"1 dk" gibi değerler saniyelik saatle güncellenir.
- Haptik geri bildirim: yön değiştirme, favori ekleme, alarm kurma.
- Boş ve hata durumları: canlı veri yoksa bölüm sessizce gizlenir ya da tek satırlık açıklama gösterilir; tam sayfa hata ekranı yok.
- Erişilebilirlik:
  - VoiceOver etiketleri ("500T, 4. Levent yönü, 6 dakika").
  - Dynamic Type, en az 44 pt dokunma alanı.
  - Hareket azaltma ayarına uyum.
- Açık/koyu tema sistemi izler; harita aynı stilin iki renk setiyle çizilir.

## 2. Mimari ve API

```
iPhone ──► Uygulama API'si (Vercel, apps/api, Hono)  ──►  İBB servisleri (Metro İstanbul, İETT, İSPARK)
               │  /v1/...  CDN önbellekli               ──►  Statik veri (GitHub: durak dizini, güzergahlar, topoloji)
               └──────────────────────────────────────►  Motor (Hetzner, FastAPI + Postgres): tahmin, geçmiş,
                                                           cihaz/abonelik/alarm kaydı, bildirim job'ları ──► Expo Push
```

- **Uygulama API'si** sitedeki canlı veri kodunun (TypeScript) taşınmış hâlidir; sitenin kendisine bağlı değildir.
  Vercel'in ücretsiz planında, CDN önbelleğiyle çalışır. Sunucunun RAM'ine yük bindirmez.
- **Motor** yalnızca kendisinin yapabildiğini yapar: model, veritabanı, zamanlanmış işler. Bildirim job'ları
  canlı durumu (aksama, varış) uygulama API'sinden okur; aynı mantık iki yerde yazılmaz.
- Vercel'in ücretsiz planı zamanlanmış işi günde bir kez çalıştırdığı için 30 sn'lik alarm kontrolü sunucuda kalır.

Uygulama yalnızca uygulama API'sinin uçlarını çağırır. Yanıtlar ekranlara göre tasarlanır: bir ekran = bir veya iki istek.
Hesaplanabilen her şey sunucuda hesaplanır.

| Uç | İçerik | Önbellek | Bugünkü karşılığı |
|---|---|---|---|
| `GET /v1/network` | Raylı hatlar (geometri, renk, saatler), birleşik istasyonlar (aktarma, olanaklar, yoğunluk), Marmaray, Metrobüs | 6 sa | sitede `useNetwork` + `/api/live/metro/network` |
| `GET /v1/status` | Aksamalar, arıza özetleri, duyurular | 2 dk | `/api/live/metro/status` |
| `GET /v1/board?hour=` | Ağdaki her hattın şimdiki ve bir sonraki saat seviyesi | 10 dk | sitede 21 ayrı tahmin isteği |
| `GET /v1/search?q=` | Hatlar (güncel İETT listesi + raylı), istasyonlar, duraklar | 1 sa | `/lines/search` + istemcide filtre |
| `GET /v1/lines/{code}` | Başlık, tür, yönler ve sıralı duraklar, künye, ücret, planlı kalkışlar, güvenilirlik | 1 sa | 6–7 ayrı istek |
| `GET /v1/lines/{code}/forecast?date=&dir=` | Saatlik tahmin + profil (seviyeler sunucuda) | 30 dk | `/forecast/{code}` |
| `GET /v1/lines/{code}/live?dir=` | Sınıflandırılmış araçlar (seferde / güzergah dışı), her durak için sıradaki varış, güzergah çizgisi | 30 sn | araçlar + istemcide `classifyVehicles`, `nextArrivals`, `routeThroughStops` |
| `GET /v1/stops/{code}` | Durak, olanaklar, hatlar ve her biri için varış + şimdiki seviye | 30 sn | durak başına N×4 istek |
| `GET /v1/nearby?lat=&lng=` | En yakın istasyonlar (sıradaki trenle) ve duraklar | 1 dk | istemcide hesap |
| `GET /v1/stations/{id}` | Sıradaki trenler, arızalar, olanaklar, İSPARK, yoğunluk | 1 dk | 4–5 istek |
| `GET /v1/fleet` | Hareket hâlindeki otobüsler | 30 sn | `/api/live/fleet` |
| `GET /v1/fares` | Ücret tablosu | 1 gün | `/api/live/fares` |
| `POST /v1/devices` | Anonim cihaz kaydı: Expo push token, dil → `device_id` | — | yeni |
| `PUT /v1/devices/{id}/subscriptions` | Favori hatlar (aksama), istasyonlar (arıza) | — | yeni |
| `POST /v1/alarms` / `DELETE /v1/alarms/{id}` | "Otobüs yaklaşınca": durak, hat, yön, eşik (dk) | — | yeni |

**Uygulama ilkeleri**
- Sitedeki TypeScript mantığı (`metro.ts`, `iett.ts`, `city.ts`, `routes.ts`, `eta.ts`, `network.ts`, `crowd.ts`)
  `packages/core` ve `apps/api`'ye taşınır; Python'a çevrilmez. Site kendi katmanıyla çalışmaya devam eder.
- Tahmin, güvenilirlik ve cihaz uçları motora (`/api/...`) sunucudan sunucuya yönlendirilir; motorun adresi
  uygulamaya gömülmez.
- Önbellek:
  - Bellek içi TTL önbellek (`cachetools`) + İBB hata verirse son başarılı yanıtı sunma.
  - Yanıtlarda `Cache-Control` ve ETag; gzip.
- Statik veri (durak dizini, güzergahlar, topoloji, istasyon yoğunluğu) aylık GitHub Action ile `ibb-transport`
  reposunda üretilmeye devam eder; uygulama API'si bunları GitHub'dan okuyup önbelleğe alır.
- Sözleşme: yanıt tipleri `packages/core`'da; API ve uygulama aynı tipleri kullanır, tip kontrolü uyumsuzluğu yakalar.
- Uyumluluk: mağazadaki eski sürümler aylarca yaşar. `/v1` geriye uyumlu değişir; uyumu bozan
  değişiklik `/v2` olur. İstemci her istekte `X-App-Version` gönderir.
- Adres: bugünkü dinamik DNS adresi kullanılır. Değişmesi gerekirse yeni adres uygulamaya EAS Update
  ile (mağaza incelemesi olmadan) gönderilebilsin diye adres derleme sırasında değil, JS yapılandırmasında tutulur.

**Bildirim altyapısı (motor)**
- Tablolar: `devices` (anonim kimlik, push token, dil, son görülme), `subscriptions`,
  `alarms` (durak, hat, yön, eşik, son geçerlilik), `notification_log` (tekrarları önlemek için).
- Job'lar (APScheduler):
  - 2 dk'da bir: uygulama API'sinden `/v1/status` oku, öncekiyle karşılaştır, abonelere değişikliği bildir.
  - 30 sn'de bir: aktif alarmlar için uygulama API'sinden `/v1/stops/{kod}` oku; eşik aşılınca bildir ve alarmı kapat.
- Gönderim: Expo Push API (gönderim makbuzları kontrol edilir, geçersiz token'lar silinir).
- Gizlilik: konum ya da kişisel veri saklanmaz. Cihaz kaydı 90 gün kullanılmazsa silinir.

## 3. Uygulama (repo: `dolumu-mobile`)

```
dolumu-mobile/
├─ packages/core/             ← ortak tipler + saf mantık (seviyeler, varış, güzergah, saat)
├─ apps/api/                  ← uygulama API'si (Hono, Vercel)
└─ apps/mobile/
   ├─ app/                    ← Expo Router
│  ├─ _layout.tsx             ← sağlayıcılar (Query + MMKV kalıcılığı, tema, çeviri, bildirim yönlendirme)
│  ├─ index.tsx               ← harita + alt panel
│  ├─ line/[code].tsx
│  ├─ stop/[code].tsx
│  ├─ settings/index.tsx · settings/notifications.tsx · settings/about.tsx
│  └─ +not-found.tsx
├─ src/
│  ├─ api/                    ← OpenAPI'den üretilen tipler + istemci + Query hook'ları
│  ├─ features/               ← home, line, stop, station, search, favorites, alarms, notifications
│  ├─ map/                    ← MapLibre stili (kâğıt/mürekkep renkleri), katmanlar, ikonlar
│  ├─ ui/                     ← temel bileşenler: Text, Button, Sheet, LevelPill, CrowdGlyph, LineBadge, HourlyBars
│  ├─ theme/                  ← token'lar (renk, tipografi, boşluk, yarıçap), açık/koyu
│  ├─ i18n/                   ← tr.json, en.json (sitedekinden başlanır, sonra ayrı yaşar)
│  └─ lib/                    ← saat (Europe/Istanbul), biçimlendirme, haptik, depolama
├─ assets/                    ← fontlar (Barlow), ikon, açılış ekranı, otobüs işaretleri
├─ app.config.ts · eas.json
└─ .github/workflows/ci.yml   ← tip kontrolü, lint, test, OpenAPI şeması uyum kontrolü
```

- **Yeniden kullanım:** sitedeki bileşenler kopyalanmaz. Tasarım token'ları, metinler, kalabalık seviye
  mantığı ve görsel dil referans alınır. Hesaplar backend'e taşındığı için uygulamada iş mantığı çok az kalır.
- **Harita:**
  - MapLibre RN + OpenFreeMap positron, sitedeki yeniden renklendirme kuralları.
  - Katmanlar: ağ, aksama, istasyonlar, odaktaki hat, canlı otobüsler (ikon), filo noktaları, kullanıcı konumu.
  - Expo Go'da çalışmaz; development build kullanılır.
- **Çevrimdışı:** TanStack Query önbelleği MMKV'de. Uygulama ağ olmadan son görülen veriyle açılır ve bunu belirtir.
- **Derin bağlantılar:** `dolumu://line/500T`. Universal Links site bağımsız olduğu için v1'de yok;
  istenirse sonra eklenir.
- **Minimum iOS:** 17.

## 4. Kalite

- **Test:**
  - Backend: taşınan mantık için pytest (varış süresi, sınıflandırma, güzergah, bildirim kuralları).
  - Uygulama: bileşen ve hook testleri (Jest + RNTL); kritik akışlar için Maestro (aç → ara → hat → durak → haber ver).
- **CI:**
  - Her iki repoda PR başına tip kontrolü, lint ve test.
  - Uygulama CI'ı backend'in OpenAPI şemasını çekip üretilen tiplerle karşılaştırır.
- **EAS profilleri:**
  - `development`: simülatör ve cihaz.
  - `preview`: TestFlight.
  - `production`: App Store.
  - JS düzeltmeleri EAS Update ile.
- **İzleme:** Sentry (çökme + performans, kişisel veri kapalı).
- **Hedefler:**
  - Soğuk açılış < 1,5 sn (iPhone 12).
  - Harita 60 fps.
  - Panel sürüklemesi takılmadan.
  - Uygulama boyutu < 30 MB.

## 5. Mağaza

- App Store Connect kaydı: DoluMu, kategori Navigasyon, ücretsiz, Türkiye + tüm ülkeler, TR/EN açıklama.
- Gizlilik:
  - Etiket: "Veri toplanmıyor", yalnızca anonim çökme verisi.
  - Privacy Manifest.
  - Gizlilik politikası sayfası (GitHub Pages; siteden bağımsız).
- İzin metinleri:
  - Konum: yalnızca uygulama açıkken, yakındaki istasyon ve durakları göstermek için.
  - Bildirim: ilk kullanımda, gerekçesiyle.
- Atıflar: İBB Açık Veri Lisansı, OpenStreetMap (ODbL), OpenFreeMap. "İBB ile resmi bağı yoktur" notu.
- Apple 4.2 (yetersiz işlev) riski düşük: yerel harita, alt panel, bildirimler ve alarm var.

## 6. Yol haritası

| Faz | İçerik | Bitti sayılması için |
|---|---|---|
| **0 · Uygulama API'si** | `packages/core` + `apps/api` (Vercel), `/v1` uçları, testler | Tüm `/v1` uçları canlıda; site ve motor etkilenmemiş |
| **1 · İskelet** | Repo, Expo, development build, tema, fontlar, çeviri, API istemcisi, harita | iOS simülatörde ağ haritası ve tema çalışıyor |
| **2 · Ekranlar** | Ana ekran paneli, arama, hat, durak, istasyon, favoriler, ayarlar, konum | Sitedeki her işlevin mobil karşılığı var |
| **3 · Bildirimler** | Cihaz kaydı, abonelikler, alarm, backend job'ları, izin akışı | Gerçek cihazda aksama ve "haber ver" bildirimi geliyor |
| **4 · Cila → TestFlight** | Animasyonlar, haptik, erişilebilirlik, çevrimdışı, Sentry, ikon ve açılış ekranı | TestFlight'ta kapalı beta |
| **5 · App Store** | Mağaza metinleri, ekran görüntüleri, gizlilik, inceleme | Yayında |
| **6 · Sonra** | Android (Play), widget, Live Activity, sitenin de `/v1`'e geçmesi | — |

Faz 0 ile 1 paralel yürüyebilir. Benim tarafımda iş hızlı ilerler; takvimi senin denemelerin ve Apple
incelemesi belirler.

## 7. Senin yapman gerekenler

Bunlar Apple hesabına giriş ve iki aşamalı doğrulama gerektirdiği için benim yerine yapamayacağım adımlar:

1. **İlk derlemede** `eas build -p ios` sırasında Apple ID ile giriş. EAS dağıtım sertifikasını ve push
   anahtarını (APNs) kendisi oluşturur.
2. **App Store Connect API anahtarı** (Users and Access → Integrations → App Store Connect API, rol: App
   Manager). Bundan sonra TestFlight'a gönderimleri ben otomatik yaparım.
3. **TestFlight'ta deneme** ve geri bildirim.
4. **Mağaza metinleri ve ekran görüntülerinin onayı.** Hazırlarım, sen onaylarsın.

## 8. Riskler

| Risk | Önlem |
|---|---|
| Uygulama API'si ile sitedeki canlı veri kodunun zamanla ayrışması | Mantık `packages/core`'da; site ileride aynı API'ye geçebilir |
| Küçük VPS'te (2 çekirdek, 3,7 GB) yük | Canlı trafik Vercel'de; sunucu yalnızca tahmin ve bildirim işleri yapar |
| Vercel ücretsiz plan limitleri | CDN önbelleği; aşılırsa Pro plan ya da API'nin sunucuya taşınması (aynı TS kodu) |
| MapLibre RN ile yeni RN sürümü uyumu | Faz 1'in ilk işi harita prototipi |
| Bildirim gürültüsü | Yalnızca 3 tür, saatlik sınır, istasyon arıza bildirimleri varsayılan kapalı |
| Modelin yanlışlıkla değişmesi | `/v1` yalnızca mevcut tahminleri okur; model ve eğitim kodu kapsam dışı |
