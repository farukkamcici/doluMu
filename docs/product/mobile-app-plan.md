# DoluMu mobil uygulama planı (Expo, iOS + Android)

> Durum: plan · Tarih: 2 Ekim 2026 · Kapsam: mevcut web ürününü temiz bir yapıyla mobile taşımak.
> Tahmin modeline dokunulmaz (tez çalışması); uygulama yalnızca modelin çıktısını gösterir.

## 0. Özet

- **Tek kod tabanı, iki uygulama.** Repo bir monorepo'ya dönüşür: `apps/web` (bugünkü Next.js sitesi,
  aynen kalır), `apps/mobile` (yeni Expo uygulaması) ve ikisinin ortak kullandığı `packages/*`.
- **Ortak mantık taşınır, arayüz yeniden yazılır.** Bugün `frontend/src/lib` ve `hooks` altında
  platformdan bağımsız ~1.700 satır iş mantığı var: kalabalık seviyeleri, varış süresi tahmini,
  güzergah ve araç sınıflandırması, ağ haritası kurulumu, tarifeler, veri tipleri, TanStack Query
  hook'ları. Bunlar ortak paketlere taşınır. Ekranlar React Native ile yeniden yazılır; DOM
  bileşenleri mobilde çalışmaz.
- **Backend değişmez, sadece adresleri sabitlenir.** Mobil uygulama da web'in kullandığı iki API'yi
  çağırır: FastAPI (tahminler, geçmiş) ve Next.js'teki `/api/live/*` ara katmanı (İBB servisleri).
  Uygulamanın içine gömülen adresler sonradan kolayca değiştirilemediği için önce kalıcı alan adları
  ve sürümlü yollar (`/v1`) belirlenir.
- **Stack:** Expo SDK 57 · Expo Router · React Native 0.87 · MapLibre React Native · NativeWind ·
  TanStack Query · Zustand + MMKV · use-intl · EAS Build / Submit / Update.
- **Süre:** web ile eşdeğer ilk sürüm ~6–7 hafta; bildirimler ve widget'lar ayrı bir faz.

## 1. Hedef ve kapsam

**v1 (mağazaya ilk çıkış): web ile aynı özellikler, mobilde daha iyi çalışan hâliyle**

- Ağ haritası: canlı aksamalar, istasyonlar, isteğe bağlı canlı otobüs katmanı.
- Arama: hat, istasyon, durak.
- "Şu an" panosu, favoriler, yakınındaki istasyon ve duraklar (sıradaki tren ve otobüsle).
- Hat sayfası:
  - Tüm hatlarda: şu anki yoğunluk ve saatlik grafik.
  - Otobüste: canlı otobüsler, duraklar ve varış süreleri, güvenilirlik.
  - Raylıda: istasyon şeridi, arızalar, istasyon yoğunluğu.
- Durak sayfası, istasyon kartı (sıradaki trenler, olanaklar, İSPARK).
- Ayarlar: dil (TR/EN), tema, sorun bildirme, hakkında ve veri kaynakları.

**v2 (yalnızca uygulamada yapılabilenler):** favori hattaki aksama için bildirim, ana ekran widget'ı,
iOS Live Activity ile otobüs varışı, Siri/App Intents kısayolları.

**Kapsam dışı:** hesap açma ve oturum, tahmin modelinde değişiklik, yönetici paneli (web'de kalır).

## 2. Mimari kararlar

| Konu | Karar | Neden | Elenen alternatif |
|---|---|---|---|
| Çerçeve | **Expo (managed) + development build** | Tek kod, iki platform. EAS ile derleme, mağazaya gönderme ve uygulama güncellemesi gerektirmeyen JS güncellemesi hazır. Yerel modüller (MapLibre, MMKV) config plugin ile eklenir. | Bare React Native (bakım yükü), Flutter (TS ile yazılmış mantık yeniden kullanılamaz) |
| Yönlendirme | **Expo Router** | Dosya tabanlı; Next'teki `/line/[code]`, `/stop/[code]` yapısının aynısı. Derin bağlantılar kendiliğinden çalışır. | React Navigation'ı elle kurmak |
| Web | **Next.js kalır** | SEO, sunucu tarafı render, `/api/live/*` ara katmanı ve oturmuş arayüz. Expo'nun web çıktısı bunların yerini tutmaz. | Expo Router ile web + mobil tek uygulama |
| Monorepo | **pnpm workspaces + Turborepo** | Paylaşılan paketler, önbellekli derleme ve test. | Ayrı repolar (mantık kopyalanır, zamanla ayrışır) |
| Harita | **@maplibre/maplibre-react-native 11** | Web ile aynı MapLibre stili (OpenFreeMap + kâğıt/mürekkep renkleri), aynı veri ve katman mantığı. Expo Go'da çalışmaz, development build gerekir. | react-native-maps (Apple/Google haritası, bizim renk dilimiz uygulanamaz) |
| Stil | **NativeWind 4 + ortak tasarım token'ları** | Web'deki Tailwind sınıfları ve CSS değişkenleri aynı token'lardan üretilir; açık/koyu tema aynı kalır. | StyleSheet ile elle (tutarlılık zor), Tamagui (yeni bir dil öğrenmek) |
| Veri çekme | **TanStack Query 5** (web ile aynı) | Hook'lar ve önbellek anahtarları ortak; kalıcı önbellek ile çevrimdışı açılış. | — |
| Yerel durum | **Zustand + MMKV** | Web'deki `prefs` store'u aynen kalır, sadece depolama katmanı değişir. | AsyncStorage (yavaş) |
| Çeviri | **use-intl** (next-intl'in çekirdeği) | `messages/tr.json` ve `en.json` ile ICU biçimi olduğu gibi kullanılır. | i18next (tüm mesajları dönüştürmek gerekir) |
| Alt panel | **@gorhom/bottom-sheet 5** | Harita üstünde sürüklenebilir panel: arama, yakındakiler, pano. Mobil haritalı uygulamaların standart deseni. | — |
| Hata takibi | **Sentry (Expo entegrasyonu)** | Mağaza sürümündeki çökmeleri görmek için. Kişisel veri toplanmaz. | — |

## 3. Hedef repo yapısı

```
ibb-transport/
├─ apps/
│  ├─ web/                  ← bugünkü frontend/ (Next.js, /api/live/* ara katmanı burada kalır)
│  └─ mobile/               ← yeni Expo uygulaması
│     ├─ app/               ← Expo Router ekranları
│     │  ├─ _layout.tsx     ← sağlayıcılar: Query, tema, çeviri, panel
│     │  ├─ index.tsx       ← harita + alt panel (ana ekran)
│     │  ├─ line/[code].tsx
│     │  ├─ stop/[code].tsx
│     │  └─ settings.tsx
│     ├─ components/        ← RN bileşenleri (map/, line/, stop/, station/, transit/)
│     ├─ app.config.ts      ← paket kimliği, izin metinleri, eklentiler, derin bağlantılar
│     └─ eas.json           ← derleme profilleri: development / preview / production
├─ packages/
│  ├─ core/                 ← saf TS, platformdan bağımsız iş mantığı (React içermez)
│  ├─ api/                  ← API istemcisi + TanStack Query hook'ları (adresler dışarıdan verilir)
│  ├─ i18n/                 ← messages/tr.json, en.json
│  └─ tokens/               ← renkler, tipografi, boşluklar → web için CSS değişkenleri, mobil için NativeWind teması
├─ src/api/                 ← FastAPI (değişmez)
├─ docs/
├─ turbo.json · pnpm-workspace.yaml
└─ .github/workflows/       ← CI (tip kontrolü, lint, test) + aylık veri yenileme
```

`frontend/public/data/*` (durak dizini, güzergahlar, topoloji…) web'de servis edilmeye devam eder; mobil
bunları aynı adresten indirir ve önbelleğe alır (bkz. §6.4).

### 3.1 Dosyaların nereye taşınacağı

| Bugün (`frontend/src`) | Yeni yer | Not |
|---|---|---|
| `lib/crowd.ts`, `lib/time.ts`, `lib/departures.ts`, `lib/lines.ts` | `packages/core` | Değişmeden taşınır |
| `lib/network.ts`, `lib/topology.ts` | `packages/core` | `fetchTopology` / `fetchMarmaray` çağrıları `packages/api`'ye geçer |
| `lib/live/types.ts`, `eta.ts`, `routes.ts` (hesaplama kısmı) | `packages/core` | `useBusRoutes` hook'u `packages/api`'ye |
| `lib/api.ts`, `lib/queries.ts`, `lib/live/client.ts`, `lib/live/nextTrains.ts` | `packages/api` | Kodda 16 yerde göreli adres (`'/api/live/…'`, `'/data/…'`) var; hepsi `createApi({ apiBase, liveBase, dataBase })` ile dışarıdan verilen adrese bağlanır |
| `hooks/useNetwork.ts`, `useLineName.ts` | `packages/api` | Platformdan bağımsız |
| `hooks/useNow.ts`, `useGeolocation.ts`, `useIsDesktop.ts`, `usePwaInstall.ts` | Her uygulamada ayrı | Tarayıcıya özgü; mobilde `expo-location` ve `AppState` ile yazılır |
| `store/prefs.ts` | `packages/core` (store) + uygulamaya göre depolama | Web: localStorage, mobil: MMKV |
| `lib/live/upstream.ts`, `metro.ts`, `iett.ts`, `city.ts`, `respond.ts` | `apps/web` (sunucu) | Ara katman sunucuda kalır; uygulama İBB'yi doğrudan çağırmaz |
| `components/**` | `apps/web` | Mobil karşılıkları `apps/mobile/components` altında yeniden yazılır |

Bu bölme ilk hafta yapılır ve web hiç bozulmadan yayına devam eder. Mobil işe ondan sonra başlanır.

## 4. API ve backend

1. **Kalıcı alan adları.** FastAPI bugün `ibb-transport.onthewifi.com` adresinde; bu bir dinamik DNS
   adresi. Uygulamanın içine gömülecek adres sonradan kolay değişmediği için önce `api.dolumu.app`
   (Caddy → FastAPI) açılır. Canlı veri ara katmanı `www.dolumu.app/api/live/*` olarak kalır.
2. **Sürümlü yollar.** Mobil için `/v1/...` takma adları eklenir: FastAPI'de `APIRouter(prefix="/v1")`,
   Next'te rewrite. Eski sürüm uygulamalar mağazada aylarca yaşayacağı için uyumu bozan
   değişiklikler `/v2` ile yapılır.
3. **Sözleşme.** Canlı uçların yanıt tipleri `packages/core/types` içinde zod şemalarıyla tanımlanır;
   web ara katmanı ve mobil istemci aynı şemayı kullanır. FastAPI'nin OpenAPI çıktısından
   `packages/api` için tipler üretilir (`openapi-typescript`).
4. **Uygulama neden İBB'yi doğrudan çağırmıyor?** Mobilde CORS sorunu yok, ama yine de ara katmandan
   geçilmesinin üç nedeni var:
   - Önbellek: binlerce kullanıcı yerine tek bir sunucu İBB'yi çağırır.
   - Bakım: SOAP ayrıştırma ve sınıflandırma mantığı tek yerde kalır.
   - Esneklik: İBB bir servisi değiştirdiğinde düzeltme uygulama güncellemesi beklemeden sunucuda yapılır.
5. **Maliyet ve kapasite.** Mobil trafik `/api/live/*` için Vercel fonksiyon çağrılarını artırır. CDN
   önbelleği (30 sn – 6 sa) yükün büyük kısmını alır. Kullanım Vercel Hobby limitlerine yaklaşırsa iki
   seçenek var: Pro plana geçmek ya da ara katmanı Hetzner'de küçük bir Node servisi olarak
   çalıştırmak (aynı `packages/core` kodunu kullanır).
6. **Hız sınırı.** Caddy'de IP başına makul bir sınır, API yanıtlarında `X-App-Version` takibi.

## 5. Ekranlar ve gezinme

Web'deki bilgi mimarisi korunur, mobil desenlere uyarlanır:

| Web | Mobil |
|---|---|
| Ana sayfa: üstte harita, altta kaydırılan liste | **Tam ekran harita + alt panel** (3 durak noktası: arama çubuğu / yarım / tam). Panelde arama, hizmet durumu, favoriler, yakındakiler, "Şu an" panosu. Konum düğmesi haritanın köşesinde. |
| Arama diyaloğu | Panel tam açılır, klavye odaklanır; son aramalar ve popüler hatlar |
| İstasyon kartı (sayfanın üstünde açılan panel) | Aynı alt panel üzerinde istasyon görünümü: sıradaki trenler, hatlar, olanaklar, İSPARK |
| `/line/[code]` | Yığına eklenen ekran: üstte harita (dokununca tam ekran), altta bloklar. Yön seçimi segment kontrolüyle. |
| `/stop/[code]` | Yığına eklenen ekran: hatlar en yakın varışa göre sıralı, aşağı çekince yenileme |
| `/settings` | Yığına eklenen ekran; "Ana ekrana ekle" yerine uygulama sürümü ve bildirim izinleri |

- **Sekme çubuğu yok.** Tek ana ekran ve harita odaklı akış, Citymapper ve Apple Maps'teki gibi.
  Favoriler panelin en üstünde durur.
- **Derin bağlantılar:** `https://www.dolumu.app/tr/line/500T` uygulamada açılır (iOS Universal Links,
  Android App Links). Web'e `/.well-known/apple-app-site-association` ve `assetlinks.json` eklenir.
- **Erişilebilirlik:** her seviye kelime + figür ile gösterilir (renk tek başına anlam taşımaz, web'deki
  kural), VoiceOver/TalkBack etiketleri, Dynamic Type desteği, en az 44 pt dokunma alanı.

## 6. Uygulama içi altyapı

### 6.1 Tasarım sistemi
`packages/tokens` tek kaynaktır: kâğıt/mürekkep renkleri, sinyal kırmızısı, hat renkleri, harita
renkleri, tipografi ölçeği. Web için CSS değişkenleri, mobil için NativeWind teması buradan üretilir.
Fontlar (Barlow, Barlow Semi Condensed) `expo-font` ile pakete gömülür. Açık/koyu tema sistem ayarını
izler, ayarlardan değiştirilebilir.

### 6.2 Harita
- MapLibre RN ile aynı OpenFreeMap positron stili, aynı yeniden renklendirme kuralları
  (`paintAll` mantığı tokens'tan beslenir).
- Katmanlar web'deki gibi: ağ, aksama, istasyonlar, otobüs ikonları, filo noktaları.
- Otobüs ikonları SVG yerine paketlenmiş PNG olarak eklenir.
- Mobilde iki parmak kuralı yok: harita tam ekran, panel sürüklenerek açılıyor.

### 6.3 Konum
`expo-location`, yalnızca uygulama açıkken ve kullanıcı konum düğmesine bastığında kullanılır. Arka
planda konum alınmaz (mağaza incelemesi ve gizlilik açısından da en temiz yol).

### 6.4 Çevrimdışı ve önbellek
- TanStack Query önbelleği MMKV'ye yazılır: uygulama ağ olmadan da son görülen veriyle açılır.
- Statik veri:
  - Durak dizini (1,2 MB), topoloji ve Marmaray istasyonları uygulamaya gömülü bir başlangıç kopyasıyla gelir.
  - Açılışta ETag ile güncellik kontrol edilir; yenisi varsa indirilir. Böylece aylık veri yenilemesi
    uygulama güncellemesi gerektirmez.
- Güzergah dosyaları (toplam 23 MB) gömülmez; hat açıldıkça indirilip önbelleğe alınır.

### 6.5 Çeviri ve bölge
`packages/i18n` mesajları, `use-intl` sağlayıcısı. Varsayılan dil cihaz diline göre seçilir
(`expo-localization`). Tüm saat hesapları web'deki gibi `Europe/Istanbul` diliminde yapılır.

## 7. Yalnızca uygulamada olacaklar (v2)

| Özellik | Gerekenler |
|---|---|
| **Aksama bildirimi** (favori hattında aksama, asansör arızası, iptal edilen sefer) | `expo-notifications` + Expo Push. Backend'de: cihaz token tablosu (hesap yok, anonim) ve 2 dakikada bir Metro durumu ile İETT duyurularındaki değişikliği bulup bildirim gönderen bir job. |
| **Ana ekran widget'ı** (favori hat: şu anki seviye + sıradaki tren/otobüs) | iOS WidgetKit / Android Glance, Expo config plugin ile (`expo-apple-targets` vb.). Veri, uygulama grubuyla paylaşılan önbellekten okunur. |
| **Live Activity** (seçilen otobüsün varışı kilit ekranında) | iOS ActivityKit; güncellemeler push ile. Varış tahmini mantığı zaten `packages/core`'da. |
| **Siri / App Intents kısayolları** ("500T nerede?") | iOS App Intents. |

## 8. Kalite, test, yayın hattı

- **Test:**
  - `packages/core`'daki saf mantık (varış süresi, güzergah sınıflandırma, seviyeler, tarife) için Vitest
    birim testleri. Bugün bu mantığın testi yok; taşırken eklenir.
  - Mobil uçtan uca akışlar için Maestro: aç → ara → hat → durak.
- **CI (GitHub Actions):** her PR'da tip kontrolü, lint ve test (Turborepo önbellekli). `main`'e push'ta
  web yine Vercel'e gider.
- **EAS:**
  - `development`: geliştirme sürümü.
  - `preview`: TestFlight ve Play internal test.
  - `production`: mağaza.
  - JS düzeltmeleri EAS Update ile mağaza incelemesi beklemeden dağıtılır. Yerel modül değişikliği
    gerektiren güncellemeler mağazadan gider.
- **Performans hedefleri:**
  - Soğuk açılış < 2 sn (orta seviye Android).
  - Harita 60 fps.
  - Filo katmanında 3 bin nokta takılmadan çizilir.
  - Uygulama boyutu < 40 MB.
- **İzleme:** Sentry (çökme + performans). Analitik, isteğe bağlı ve kişisel veri içermeyen bir araçla
  (karar §11'de).

## 9. Mağaza hazırlığı

- Apple Developer (99 $/yıl) ve Google Play Console (25 $ tek seferlik) hesapları.
- Paket kimliği önerisi: `app.dolumu`.
- İzin metinleri: konum ("Yakınındaki istasyon ve durakları göstermek için"). İlk sürümde bildirim izni yok.
- Gizlilik:
  - iOS gizlilik etiketi ve Android Veri Güvenliği formu: veri toplanmıyor; çökme verisi anonim.
  - iOS Privacy Manifest.
- **Apple 4.2 (yetersiz işlev) riski:** "web sitesini sarmalayan uygulama" diye reddedilmemek için ilk
  sürümde yerel harita, alt panel, çevrimdışı açılış ve derin bağlantılar bulunur. Bildirim/widget
  v2'de bu konumu daha da güçlendirir.
- Atıflar (Hakkında ekranı): İBB Açık Veri Lisansı, OpenStreetMap (ODbL), OpenFreeMap. Uygulamanın İBB
  ile resmi bir bağı olmadığı açıkça yazılır.
- Mağaza görselleri: 6,7" ve 6,1" iPhone, Android telefon ekran görüntüleri; TR ve EN açıklamalar.

## 10. Yol haritası

| Faz | Süre | Teslim | Bitti sayılması için |
|---|---|---|---|
| **0 · Temel** | 1 hafta | Monorepo (pnpm + Turborepo), `packages/core` · `api` · `i18n` · `tokens`, `frontend/` → `apps/web`, `api.dolumu.app`, `/v1` yolları, core birim testleri | Web canlıda hiçbir şey değişmeden çalışıyor; CI yeşil |
| **1 · İskelet** | 1 hafta | Expo uygulaması, development build (iOS + Android), Expo Router, sağlayıcılar, tema, fontlar, çeviri, MapLibre ile ağ haritası | Simülatörde ve gerçek cihazda harita ve tema çalışıyor |
| **2 · Ana akışlar** | 2–3 hafta | Ana ekran paneli, arama, hat (otobüs + raylı), durak, istasyon paneli, favoriler, ayarlar, konum | Web'deki her ekranın mobil karşılığı var; temel akışların Maestro testleri geçiyor |
| **3 · Cila ve beta** | 1–2 hafta | Çevrimdışı önbellek, derin bağlantılar, erişilebilirlik, performans, Sentry, mağaza görselleri, TestFlight + Play internal | 10–20 kişilik kapalı beta; çökmesiz oturum oranı > %99,5 |
| **4 · Mağaza** | ~1 hafta (inceleme dahil) | App Store + Google Play v1.0 | İki mağazada yayında |
| **5 · v2** | 3–4 hafta | Aksama bildirimleri, widget, Live Activity | — |

## 11. Senin karar vermen gerekenler

1. Uygulama adı ve paket kimliği (`DoluMu`, `app.dolumu`?).
2. Apple ve Google geliştirici hesapları hangi isim/şirket adına açılacak.
3. `api.dolumu.app` için DNS (alan adı Vercel'de mi, başka bir kayıt firmasında mı?).
4. Analitik: hiç olmasın mı, yoksa anonim kullanım ölçümü mü?
5. v2'deki bildirimler ilk sürüme yetişsin mi? Apple 4.2 riskini azaltır ama süreyi ~2 hafta uzatır.

## 12. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| MapLibre RN ve yeni React Native sürümü arasında uyumsuzluk | Harita çalışmaz | Faz 1'in ilk işi harita prototipi; sorun çıkarsa `react-native-maps` ile geçici çözüm |
| Monorepo'da web (Next 16) ve Expo'nun farklı React/RN sürümleri istemesi | Derleme hataları | Her uygulama kendi React sürümünü tanımlar; Expo'nun monorepo kılavuzu izlenir (gerekirse pnpm `node-linker=hoisted`) |
| İBB servislerinin kesilmesi veya değişmesi | Canlı bölümler boş kalır | Ara katman zaten sessizce geri çekiliyor; mobilde de bölümler gizlenir. Düzeltme sunucuda yapılır, uygulama güncellemesi gerekmez. |
| Dinamik DNS'teki backend adresi | Uygulama sonradan backend'e erişemez | Faz 0'da `api.dolumu.app` |
| Apple 4.2 reddi | Yayın gecikir | Yerel harita ve panel, çevrimdışı çalışma, derin bağlantı; gerekirse bildirimleri öne çekmek |
| Tahmin modeline yanlışlıkla dokunulması | Tez | Uygulama yalnızca mevcut uçları okur; model ve eğitim kodu kapsam dışı |
