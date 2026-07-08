# Teknik Tasarım Dokümanı

## Ürün
**Hat Bazlı Toplu Ulaşım Yoğunluk Tahmin Platformu**

Model Tipi: **ML tabanlı saatlik yolcu sayısı forecast + bağlamsal yoğunluk skorlaması**  
Gerçek zamanlı ölçüm yok — tümü tahmin.  

---

## ✅ Veri Kaynakları

| Kaynak | Kullanım |
|---------|-----------|
| Ulaşım (İBB) | Hat-saat yolcu sayısı (target) |
| Hava Durumu (Saatlik) | Yağış, sıcaklık, rüzgar
| Takvim | Haftasonu, resmî tatil, okul dönemi |
| GIS (Opsiyonel) | İlçe heatmap + hat çizimleri (V1.5) |
| Event (Opsiyonel) | Manuel CSV ile etkinlik günleri (V2) |

Notlar:  
- Hava verisi  **saatlik** alınır (Open-Meteo API).  
- Event datası MVP’de yok, V2’de manuel ekleme.

---

## ✅ Veri Modeli

### Raw tablolar
- **transport_raw(date, hour, line_name, passenger_count)**
- **weather_raw(datetime, temp, precip_mm, humidity, wind_speed)**
- **calendar_raw(date, is_holiday, holiday_name)**
- **district_geo(geom_polygon, district_name)**

### Clean / Feature tablolar
- **transport_hourly:**  
  GROUP BY date, hour, line_name → SUM  
  Negative/duplicate fix  
  Europe/Istanbul TZ  
  Outlier winsorize (z-score/IQR)

- **weather_hourly:**  
  Saatlik veri (Open-Meteo archive + forecast)  
  Rolling features: `temp_delta_1h`, `rain_flag`, `wind_delta_3h`

- **calendar_dim:**  
  is_weekend, is_holiday, holiday_win_m1, holiday_win_p1,  
  is_school_term, month, season

---

## ✅ Feature Engineering

### Zaman
hour_of_day, day_of_week, is_weekend, month, season

### Takvim
is_holiday, holiday_win_m1, holiday_win_p1, is_school_term

### Hava
temp, precip_mm, wind_speed, humidity, rain_flag, temp_delta, wind_delta

### Lag & Rolling (line bazlı)
Lag optimizasyonu yapılır:  
- lag ∈ {1h, 2h, 3h, 12h, 24h, 48h, 168h}  
- rolling ∈ {3h, 6h, 12h, 24h}  
Feature importance ile seçilir.

### Hedef
`y = passenger_count`

### Kategorik
`line_name`

Leakage yok: geleceğe ait bilgi kullanılmaz.

---

## ✅ Model Seçimi

| Model | Rol | Neden |
|--------|-----|-------|
| LightGBM (Global) | Ana model | Hava, takvim, lag/rolling’i iyi işler; `line_name` kategorik olarak kullanılır |
| Baseline | Kıyas | lag-24h + hour-of-week avg |
| SARIMAX (opsiyonel) | Akademik kıyas | Tez karşılaştırması için |

Ek notlar:  
- Model artık **tek global model** olarak eğitilir, hatlar kategorik değişkendir.  
- Bu yaklaşım overfitting’i azaltır, bakım kolaylığı sağlar.

---

## ✅ Eğitim & Validasyon

- **Zaman bazlı bölme:**  
  - Train: geçmişin çoğu  
  - Valid: son 6→2 ay  
  - Test: son 2 ay  
- **Backtesting:** 1h, 6h, 12h, 24h horizon  
- **Metrikler:** MAE, SMAPE, ayrıca `MAE by hour_of_day` raporu  
  (pik saatlerde model hatası analizi)

---

## ✅ Forecast Üretimi

### Batch Forecast
- Her gece **00:05 (cron)**
- Input: Son 168 saat + ertesi gün hava tahmini
- Output: T+24 saat için tahmin
- Kayıt:  
  `predictions(date, hour, line_name, y_hat, [p10,p50,p90])`

### Nowcast (Anlık Tahmin)
- Her 15 dakika  
- Son lag/rolling verileri + güncel hava tahmini  
- **Cache (Redis)**: `(line_name, date)` bazında  
  UI isteklerinde tekrarlı hesap engellenir

Kaynak yükü:  
- Eğitim: 2–4 CPU, 8–16GB RAM  
- Tahmin: 1–2 CPU  

Model local eğitilir, model dosyası API sunucusuna yüklenir.

---

## ✅ Yoğunluk Skorlama

### Aşama 1 — Model tahmini
`y_hat` (tahmini yolcu sayısı)

### Aşama 2 — Normalizasyon
- **percentile_rank =** CDF(y_hat | line_name, hour_of_day)
- **peak_index =** y_hat / historical_max_by_line  
- **crowd_score =** 0.6×percentile_rank + 0.4×peak_index  

### Aşama 3 — 5 seviyeli sınıflandırma

| Aralık | Seviye | Renk |
|---------|---------|------|
| 0.00–0.20 | Çok Düşük | 🟢 |
| 0.20–0.40 | Düşük | 🟢🟡 |
| 0.40–0.60 | Orta | 🟡 |
| 0.60–0.80 | Yüksek | 🟠 |
| 0.80–1.00 | Çok Yüksek | 🔴 |

### Aşama 4 — UI çıkışı
**M2 — Şu An: Yüksek (🟠)**  
• Geçmişe göre: %78 konumunda  
• Pik referansına göre: %63  
• En uygun saat: 21:00 (Orta)  
• Güven seviyesi: Orta (p50 ± %10 aralık)

---

## ✅ API & UI Entegrasyon Akışı

| UI Eylem | API Çağrısı |
|-----------|-------------|
| Hat seç | `/predictions?line=M2&date=...` |
| Timeline kaydır | Aynı endpoint, farklı saat |
| District heatmap | `/district-heatmap?date=...&hour=...` |
| Öneri | `/suggestion?line=M2` |

Ek:  
- Cache entegrasyonu (Redis/memory)  
- İleri sürümde SHAP tabanlı “neden yoğun?” açıklaması

---

## ✅ GIS Katmanı

| Katman | Durum |
|---------|-------|
| District Heatmap | ✅ MVP |
| Hat çizimleri (polyline) | ✅ V1.5 |
| Event overlay | ⏳ V2 |

---

## ✅ Operasyon & Süreklilik

- Veri güncellenmedikçe retraining yapılmaz  
- Yeni veri gelirse **drift kontrolü** uyarı üretir  
- Haftalık histogram farkı analizi  
- Otomatik retrain şu an **kapalı**  
- Fallback: hour-of-week avg + lag-24h baseline

---

## ✅ Riskler & Çözümler

| Risk | Etki | Çözüm |
|-------|------|--------|
| Saatlik hava eksikliği | Nowcast hatası | Saatlik API entegrasyonu |
| Transport verisi bozuk | Tahmin oynaklığı | Outlier winsorize + loglama |
| Kapasite verisi yok | Gerçek oran bilinmez | percentile + peak-index |
| Tatil verisi eksik | Sezonsallık hatası | Manuel CSV |
| API gecikmesi | UI yavaşlar | Cache katmanı |

---

## ✅ Geliştirme İyileştirme Önerileri

| İş | Amaç | Durum |
|----|-------|--------|
| Saatlik hava verisi | Nowcast doğruluğunu artırmak 
| Anomali filtreleme | Aykırı veri etkisini azaltmak
| Lag tuning | Pik saat doğruluğunu artırmak
| Global model | Model bakımını sadeleştirmek
| Cache | API performansını artırmak
| Drift izleme | Veri değişimini erken fark etmek
| Pik saat hata analizi | Model zayıflıklarını bulmak

---

## ✅ Core Features

- Hat bazlı saatlik yoğunluk tahmini (24h ileri)
- Anlık hat yoğunluk görünümü
- Weather-aware prediction (saatlik veri)
- Takvim ve sezon etkileri
- Timeline slider (geçmiş/gelecek)
- İlçe bazlı heatmap
- Favori hat seçimi
- PWA + bildirim
- Daha az yoğun saat önerisi

---

## ✅ Side Features (V1.5–V2)

- Trend görselleştirme (dün / geçen hafta)
- Hava olayı overlay
- Senaryo simulasyonu (ör. “yağmur başlarsa artış %?”)
- Hat geometrisi (polyline)

---

## ✅ Future Features (V3+)

- Multimodal transit routing (GTFS + OTP)
- Hat segment bazlı yoğunluk
- Event awareness (maç, konser, sınav)
- Capacity risk uyarıları (kapasite verisi gelirse)
- User-specific smart commute (kişisel öneriler)

---

## ✅ Ek Teknik Notlar

- Kod altyapısı: Python + Pandas + LightGBM + FastAPI  
- Veri pipeline: Prefect veya Airflow (opsiyonel)  
- Veri deposu: PostgreSQL + PostGIS  
- Cache: Redis  
- Frontend: Next.js 16.0.3 + Leaflet + Tailwind CSS  
- i18n: next-intl v4.5.5 (Türkçe/İngilizce desteği)  
- Dil değiştirme: LanguageSwitcher component (Settings sayfasında)  
- Lokalizasyon: Tüm UI componentleri çevrilmiş (navigation, searchBar, lineDetail, weather, transportTypes)  
- URL yapısı: /[locale]/ (örn: /tr/, /en/forecast)  
- API performans testi: <200 ms yanıt hedefi  
- Tez raporuna eklenecek metrikler: MAE, SMAPE, MAE@peak, SHAP summary

---
