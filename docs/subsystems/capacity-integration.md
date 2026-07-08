# Kapasite Entegrasyon Planı (Backend + Frontend)

Bu doküman, `build_bus_capacity_snapshots` ile üretilen kapasite çıktılarının **remote backend + frontend** tarafına nasıl entegre edileceğini, hangi dosyaların nereye taşınacağını ve scheduler iş sırasının nasıl güncelleneceğini planlar.

Kısıtlar / kararlar:

- `data/` klasörü git’e alınmayacak.
- Remote server’da proje dizini içinde `ibb_transport/data/processed/...` yolu var; kapasite artefact’ları buraya **kopyalanacak**.
- DB’ye yeni tablo ekleme / import yapılmayacak. (Mevcut DB sadece schedule cache ve forecast için kullanılmaya devam edecek.)
- Trips-per-hour (saatlik sefer sayısı) **IETT schedule cache** üzerinden hesaplanacak.
- Yolcu tahmini “gidiş+dönüş toplam” olduğu için trips-per-hour da **G+D toplam** olmalı.

Bu entegrasyonun hedefi:

- Backend tarafında `DailyForecast.max_capacity` değerini “historical max” yerine **saatlik efektif kapasite** olarak üretmek.
- Frontend tarafında `LineDetailPanel` içinde gösterilen kapasite metnini gerçek saatlik kapasiteye bağlamak ve tıklanınca “araç varyasyonları / yoğunluk hassasiyeti” açıklamasını göstermek.

---

## 0) Sistem bileşenleri (bugün)

Backend:

- Scheduler: `src/api/scheduler.py`
- Forecast batch job: `src/api/services/batch_forecast.py`
- Bus schedule cache: `src/api/services/bus_schedule_cache.py` + DB tablo `bus_schedules`
- Forecast API: `src/api/routers/forecast.py`

Frontend:

- Hat detay paneli: `frontend/src/components/ui/LineDetailPanel.jsx`
  - Kapasite texti: `currentHourData.max_capacity`
  - Tooltip: `maxCapacityTooltip` çevirisi

Kapasite artefact’ları (dosya):

- `data/processed/bus_capacity_snapshots/*.parquet`

---

## 1) Hangi kapasite dosyaları kullanılacak?

Üretilen kapasite artefact’ları (minimum set):

1. `data/processed/bus_capacity_snapshots/line_capacity_representative_vehicle.parquet`
   - hat bazında tek satır kapasite özeti
   - primary alan: `expected_capacity_weighted_int`
   - UI tooltip için: `likely_models_topk_json`, `confidence`, `notes`

2. `data/processed/bus_capacity_snapshots/line_capacity_vehicle_mix.parquet`
   - hat bazında “muhtemel araç karışımı” + “occupancy sensitivity” alanları
   - modal/expander panel için kullanılacak

### Offline patch adımı (no_data imputation)

Build sonrası kapasiteyi “no_data” hatlar için doldurmak için:

```bash
python -m src.data_prep.impute_no_data_line_capacities \
  --processed-dir data/processed/bus_capacity_snapshots \
  --format parquet \
  --inplace
```

Bu adım:

- `confidence == "no_data"` + `NO_DATA_LINES` olan hatlarda `confidence="imputed_no_data"` yapar.
- Weighted/representative kapasite alanlarını doldurur.
- Evidence sayıları (`n_vehicles_with_capacity_total`, günlük counts) değişmez.

Not:

- Bu offline patch **SOAP çağırmaz**; sadece mevcut processed çıktı dosyalarını günceller.

---

## 2) Remote server’a taşıma (git değil, kopya)

Remote server’da proje dizini: `ibb_transport/`.

Hedef dizin:

- `ibb_transport/data/processed/bus_capacity_snapshots/`

Kopyalanacak dosyalar:

- `line_capacity_representative_vehicle.parquet`
- `line_capacity_vehicle_mix.parquet`
- (ops.) `line_capacity_daily.parquet`

Operasyonel not:

- Bu dosyalar küçük; deploy sırasında “artefact copy” adımı olarak taşınabilir.
- Aynı “local gibi” path kullanıldığı için backend kodu `data/processed/...` üzerinden okuyabilir.

Pratik taşıma önerisi:

- `ibb_transport/data/processed/bus_capacity_snapshots/` dizinini oluştur.
- Yukarıdaki Parquet dosyalarını bu dizine kopyala.
- Deploy sonrası “dosya var mı?” kontrolü: `line_capacity_representative_vehicle.parquet` ve `line_capacity_vehicle_mix.parquet`.

---

## 3) Backend entegrasyon planı

### 3.1 Kapasiteyi API’da nasıl kullanacağız?

Mevcut akış:

- Batch forecast job (`src/api/services/batch_forecast.py`) her satır için `DailyForecast.max_capacity` yazıyor.
- Forecast endpoint’i (`src/api/routers/forecast.py`) bu `max_capacity` değerini UI’a dönüyor.

Yeni akış hedefi:

1) Hat bazında per-vehicle kapasiteyi `line_capacity_representative_vehicle.parquet` içinden al.
   - primary: `expected_capacity_weighted_int`
2) Saatlik sefer sayısını schedule cache’den hesapla:
   - `trips_per_hour = trips_G_per_hour + trips_D_per_hour`
3) Saatlik efektif kapasite:

---

### 3.6 Metro / Raylı Sistem Kapasitesi (Static tablo + timetable tabanlı sefer sayısı)

Bu repo’da bus kapasitesi “gözlenen araç karışımı” üzerinden çıkarılırken, metro/tram/füniküler/marmaray için kapasiteyi **statik bir tablo** ile veriyoruz.

#### 3.6.1 Statik per-departure kapasite tablosu

- Dosya: `config/rail_capacity.yaml`
- Anlamı: **tek sefer, tek yön** (1 departure, 1 direction) kapasitesi.
- Varyantlı hatlarda (örn M2 4-car/8-car): default olarak **varyantların ortalaması** kullanılır.
  - Örn M2: (1050 + 2100) / 2 = 1575

Backend tarafında `CapacityStore` bu dosyayı yükler ve `get_capacity_meta(line_code)` çağrılarında:

- Eğer `line_code` rail kapasite map’inde varsa `confidence="static"` ile bu değeri döndürür.
- `M1A/M1B` için kapasite alias’ı `M1`’dir.

Bu değer, forecast üretiminde “vehicle_capacity” olarak kullanılır.

#### 3.6.2 Raylı sistemlerde trips-per-hour hesabı (Metro timetable cache)

Bus tarafında trips-per-hour, IETT planned schedule cache’inden gelir (`bus_schedules`).
Metro tarafında ise timetable bilgisi bizim sistemde **station+direction bazlı** cache’lenir:

- Kaynak: `POST /metro/schedule` (upstream: Metro İstanbul `GetTimeTable`)
- Persist cache tablo: `metro_schedules`

Trips-per-hour hedefi bus ile aynı olmalı: model tahmini `G + D` toplam yolcu olduğu için kapasite hesabında da **iki yön toplam sefer** kullanılmalı.

Önemli UX doğruluğu: Metro’da her istasyon ayrı timetable döndürebildiği için, ara istasyonlardan sayım yapmak sefer sayısını şişirir.
Bu yüzden trips-per-hour hesabı şu şekilde yapılır:

1) Hat için sadece **terminus** istasyonlar kullanılır: ilk istasyon + son istasyon.
2) Terminus istasyonun `direction_id` listesinde birden fazla değer varsa, aynı seferlerin farklı direction_id ile tekrar dönmesi ihtimaline karşı
   `Times` listesi terminus bazında **union (set)** yapılır.
3) `trips_per_hour = (first_terminus_departures_per_hour) + (last_terminus_departures_per_hour)`

Bu yaklaşım ara istasyon “geçiş” seferlerini saymadığı için kapasiteyi şişirmez.

Notlar:

- Metro cache’in dolu olması gerekir; bunun için `metro_schedule_prefetch` job’u forecast job’undan önce çalışmalıdır.
- Eğer cache yoksa rail trips-per-hour fallback davranışı, bus fallback’e benzer şekilde “en az 1 trip” yaklaşımına düşebilir; bu durumda UI’da “schedule unavailable” semantiği geçerlidir.

#### 3.6.3 Forecast job’a etkisi

Forecast üretiminde:

- Bus/ferry gibi hatlarda `trips_per_hour` bus schedule cache’inden gelir.
- Raylı hatlarda `trips_per_hour` metro timetable cache’inden türetilir.
- `vehicle_capacity` tüm hatlar için `CapacityStore` üzerinden gelir:
  - bus: artefact (parquet)
  - rail: static map

Sonuç:

- `DailyForecast.trips_per_hour` rail için de anlamlı hale gelir.
- `DailyForecast.max_capacity = trips_per_hour * vehicle_capacity` rail için de “gerçekçi” olur.

`effective_max_capacity(line, date, hour) = expected_vehicle_capacity(line) * trips_per_hour(line, date, hour)`

4) Occupancy:

`occupancy_pct = predicted_passengers / effective_max_capacity`

Kapsam notu:

- Bu hesap “bus hatları” için geçerli.
- Metro/rail tarafı ayrı schedule/cache akışına sahip (metro schedule widget + metro cache).

### 3.2 Trips-per-hour hesaplama (G + D toplam) – kritik nokta

Schedule cache payload (bus): `G` ve `D` yönleri için saat string listeleri verir.

Hesap:

- `G_times = payload["G"]` (örn `"06:10"`)
- `D_times = payload["D"]`
- Her `time_str` → `hour = int(HH)` parse edilir.
- `trips_G_per_hour[hour] = count(times in G with that hour)`
- `trips_D_per_hour[hour] = count(times in D with that hour)`
- `trips_per_hour = trips_G_per_hour + trips_D_per_hour`

Notlar:

- Bizim yolcu tahmini “gidiş+dönüş toplam” olduğu için **G+D** toplam kullanmak şart.
- Schedule’dan gelen saatler “planlanan” sefer saatleri; realtime değil.

Edge-case (midnight wrap):

- Schedule’da `00:xx` saatleri varsa `hour=0` bucket’ına sayılır.
- Forecast tarafı 0-23 saat üretiyor; schedule parse’ı bu aralığa map edilir.

### 3.3 Day-type (I/C/P) ve ileri tarih forecast uyumu

Forecast job ileriye dönük çalışıyor (şu an default T+1..T+2).

Schedule cache de `valid_for` ve day_type’e göre saklanıyor:

- `BusScheduleCacheService.day_type_for_date(date)` → `I` (weekday), `C` (Saturday), `P` (Sunday)
- `get_cached_schedule(db, line_code, valid_for=forecast_date)` çağrısı doğru day_type’ı seçer.

Hedef: Forecast üretirken ilgili günün schedule’ı DB cache’de hazır olmalı.

Bu yüzden scheduler’da bus schedule prefetch:

- forecast horizon kaç günse (`num_days`), schedule prefetch de **en az aynı günler** için yapılmalı.
- “Hafta içi / cumartesi / pazar” farkı yüzünden (day_type) horizon içinde farklı day type varsa, eksik kalmamalı.

Pratik yaklaşım (plan):

- Prefetch job, forecast’in üreteceği tarih aralığındaki **unique day_type** setini çıkarır.
- Her day_type için en az 1 “valid_for” gününde cache doldurur.
- Böylece forecast job schedule cache miss yaşamaz.

Önemli:

- Şu an scheduler’da `bus_schedule_prefetch` sadece tek bir `valid_for` gün için çalışıyor.
- Forecast job ileri tarih ürettiği için (T+1..T+N), schedule cache de aynı günler için hazır olmalı.

### 3.4 Kapasite fallback kuralı (API güvenliği)

Kapasite dosyası hiç yoksa veya hat bulunamazsa:

- `DEFAULT_VEHICLE_CAPACITY_FALLBACK = 100`

UI tarafında “alert” basmadan, küçük bir tooltip ile:

- “Kapasite verisi bulunamadığı için varsayılan/ortalama araç kapasitesi kullanıldı.”

Bu fallback “son çare”dir; amaç sistemin kırılmaması.

Bu fallback kullanıldığında UI tarafında “alert” değil, küçük bir tooltip/metin tercih edilir.

### 3.5 API sözleşmesi (UI için minimal değişim)

UI hali hazırda `currentHourData.max_capacity` gösteriyor.

Plan:

- ForecastResponse içindeki `max_capacity` artık “effective_max_capacity” olacak.

UI için önerilen yeni endpoint’ler (dosya tabanlı, DB gerektirmez):

- `GET /capacity/{line_code}`
  - Kaynak dosya: `data/processed/bus_capacity_snapshots/line_capacity_representative_vehicle.parquet`
  - Döndürülecek minimal alanlar:
    - `line_code`
    - `expected_capacity_weighted_int`
    - `capacity_min`, `capacity_max`
    - `confidence`
    - `likely_models_topk_json`
    - `notes`

- `GET /capacity/{line_code}/mix?top_k=10`
  - Kaynak dosya: `data/processed/bus_capacity_snapshots/line_capacity_vehicle_mix.parquet`
  - Döndürülecek alanlar:
    - `representative_brand_model`, `model_capacity_int`
    - `share_by_vehicles`
    - `occupancy_delta_pct_vs_expected`
    - `n_days_present`

Backend tarafında bu iki endpoint’in hızlı olması için öneri:

- Uygulama başlangıcında Parquet’leri memory’ye al (tek sefer) ve `line_code` bazında lookup yap.
- Dosya yoksa veya satır yoksa kapasite fallback 100 devreye girer; endpoint `confidence="fallback"` benzeri bir flag döndürebilir.

Alternatif minimal:

- Forecast response’a `capacity_meta` eklenebilir (payload büyür). Bu dokümanda tercih: ayrı endpoint.

---

## 4) Scheduler planı (job order + saatler)

Mevcut job history:

- Forecast (2 days): 02:00 (≈34s)
- Cleanup: 03:00 (≈0.2s)
- Metro Cache: 03:15 (≈7–8m)
- Quality Check: 04:00 (≈0.2s)
- Bus schedule prefetch: 04:15 (≈39m)

Yeni ihtiyaç: forecast job trips-per-hour hesaplayacağı için **bus schedule prefetch forecast’ten önce** olmalı.
Ek olarak metro cache de forecast’ten önce koşabilir.

Hedef: Forecast en geç 05:00’te tamamlanmış olsun.

Önerilen sıra:

1) 00:10 – Bus schedule prefetch (forecast horizon kadar)
2) 02:30 – Metro schedule prefetch
3) 04:00 – Forecast (T+1..T+N)
4) 04:15 – Cleanup
5) 04:30 – Quality check

Bu planın gerekçesi:

- Job history’de `bus_schedule_prefetch` ~39dk sürüyor ve bugün forecast’ten sonra çalışıyor.
- Forecast artık schedule’dan trips-per-hour hesaplayacağı için schedule cache **önceden** dolu olmalı.
- Forecast runtime çok kısa (~35sn) olduğu için 04:00e alınabilir; ancak 05:00 SLA korunmalı.

Horizon uyumu:

- Forecast `num_days = N` ise, bus prefetch de en az T+1..T+N için schedule cache üretecek şekilde çalışmalı.
- Day type farkı (I/C/P) yüzünden bu “tek bir gün” ile çözülemez; horizon içindeki tüm day_type’lar kapsanmalı.

Not:

- Prefetch süresi uzarsa, forecast’i 03:00–04:30 aralığına çekmek de mümkün; 05:00 deadline korunmalı.
- Bus schedule prefetch, horizon’da farklı day_type varsa ekstra çalışma yapabilir; bu durumda bus prefetch’i daha erken başlatmak gerekir (örn 00:00).

---

## 5) Frontend / UX entegrasyon planı

Hedef komponent:

- `frontend/src/components/ui/LineDetailPanel.jsx`

Bugün UI’da:

- Kapasite metni `currentHourData.max_capacity` olarak gösteriliyor.
- Üstünde küçük tooltip var (`maxCapacityTooltip`).

Yeni UX planı (minimal, şık):

1) Kapasite metni “tıklanabilir” görünsün:
   - underline / subtle icon / hover state
   - mevcut layout bozulmasın

2) Tıklayınca bir modal/overlay açılsın:
   - Başlık: “Saatlik Kapasite ve Araç Varyasyonları”
   - İçerik (current hour):
     - Trips-per-hour (G+D)
     - Per-vehicle expected capacity (weighted)
     - Effective hourly capacity = trips * expected
     - Predicted passengers
     - Current occupancy%

3) Eğer mix verisi varsa (top-k modeller):
   - Liste: model adı, kapasite, pay
   - “Bu model gelirse” senaryosu:
     - `scenario_capacity = trips_per_hour * model_capacity_int`
     - `scenario_occupancy_pct = predicted / scenario_capacity`
     - `occupancy_delta_pct_vs_expected` göster
   - UI: compact bar/list

4) Fallback tooltip (alert değil):
   - Eğer fallback kullanıldıysa küçük tooltip: “Kapasite verisi bulunamadığı için varsayılan araç kapasitesi kullanıldı.”

UI tarafında veri kaynakları:

- Forecast response: saatlik `max_capacity`, `predicted_value`, `occupancy_pct` (zaten var)
- Yeni kapasite endpoint’leri:
  - `/capacity/{line}` (meta)
  - `/capacity/{line}/mix` (varyasyon listesi)

Kullanım önerisi:

- Panel açıkken ekstra istek atma: sadece kullanıcı kapasite metnine tıklayınca (lazy-load).
- Cache: modal kapansa bile aynı hat için tekrar açılınca yeniden fetch etmeyebilir (UI tarafında memo/cache).

Data akışı:

- Forecast çağrısı zaten var.
- Modal açılınca lazy-load:
  - `/capacity/{line}` ve `/capacity/{line}/mix`

### 5.1 Raylı sistemlerde modal içeriği

Raylı hatlarda “araç karışımı / model bazlı senaryo” bus’lar kadar anlamlı değil (çoğu hat için sabit set veya statik tablo kullanılıyor).
Bu yüzden UI tarafında:

- Modal her zaman açılır (metro hatlarında da).
- Mix boşsa raylı hatlarda “mix gösterilmiyor” açıklaması gösterilir.
- Etiketler raylıya göre sadeleştirilir:
  - `trips_per_hour`: “sefer/saat (iki yön toplam)”
  - `vehicle_capacity`: “sefer başı kapasite” (per-departure)

Bu, kullanıcıya "bu kapasite tahmini" mesajını net verir ve bus’lara özgü karmaşık senaryo ekranını raylıda zorlamaz.

---

## 6) Uygulama sırası (checklist)

1) Lokal ETL:
   - `build_bus_capacity_snapshots` (parquet)
   - `impute_no_data_line_capacities` (inplace)
2) Remote server’a artefact kopya:
   - `ibb_transport/data/processed/bus_capacity_snapshots/line_capacity_representative_vehicle.parquet`
   - `ibb_transport/data/processed/bus_capacity_snapshots/line_capacity_vehicle_mix.parquet`
3) Backend:
   - Kapasite dosyalarını `data/processed/...` yolundan okuyacak şekilde load et (in-memory cache)
   - Trips-per-hour hesaplamayı schedule cache’den (G+D) yap
   - Forecast job’da `max_capacity` hesabını “effective_max_capacity” yap
   - Fallback 100 + flag/notes
4) Scheduler:
   - Bus schedule prefetch’i forecast’ten önceye al
   - Prefetch horizon’u forecast horizon ile uyumlu yap
   - Metro cache’i de forecast’ten önceye al
5) Frontend:
   - `LineDetailPanel.jsx`: max capacity alanını tıklanabilir yap
   - Modal: mix list + senaryo occupancy
   - Fallback tooltip (alert değil)

---

Not: Bu doküman kod yazmaz; uygulanacak değişikliklerin sırasını ve veri kontratlarını netleştirir.
