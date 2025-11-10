# İstanbul Ulaşım Yoğunluk Tahmin Platformu

Bu repo, İstanbul Büyükşehir Belediyesi’nin paylaşılmış saatlik yolcu kayıtlarını kullanarak toplu taşıma hatları ve ilçeleri için ileriye dönük yoğunluk tahminleri üretmeye odaklanan veri ve modelleme altyapısını içerir. Amaç; yolculara daha uygun seyahat zamanları önermek, operasyon ekiplerine talep trendlerini izleme olanağı sağlamak ve ileride harita tabanlı bir arayüze veri sağlayacak API’yi beslemek.

## Mevcut Durum

- Polars tabanlı ETL, ham CSV dosyalarını hat/ilçe kırılımlarında parquet çıktılarına dönüştürüyor (`src/data_prep/`).
- Takvim, hava durumu ve lag/rolling özellikleri birleştirilerek model-ready feature setleri (`features_pl.parquet`, `features_pd.parquet`) hazırlanıyor (`src/features/`).
- Pandas ve Polars tabanlı veri kalite kontrolleri `docs/data_quality_log.txt` ve `docs/data_quality_log_pl.txt` dosyalarına yazılıyor.
- Tarih bazlı train/validation/test bölünmeleri otomatik olarak üretiliyor (`src/features/split_features.py`).
- LightGBM ile normalizasyonlu eğitim pipeline’ı (`src/model/train_model.py`) ve çoklu baseline + SHAP karşılaştırmalarını içeren değerlendirme scripti (`src/model/eval_model.py`) tamamlandı.
- Modeller, raporlar ve görseller sırasıyla `models/`, `reports/logs/`, `reports/figs/` klasörlerinde saklanıyor.

## Depo Yapısı

| Yol | Açıklama |
| --- | --- |
| `src/data_prep/` | Ham veriyi parquet’e çeviren, temizlik ve keşif analizi yapan betikler. |
| `src/features/` | Lag/rolling üretimi, nihai feature birleşimi, veri kalite kontrolleri ve pandas/Polars dönüşümleri. |
| `src/model/` | LightGBM eğitim ve değerlendirme betikleri, SHAP analizi dahil. |
| `data/raw/` | Kaynak CSV/yardımcı dosyalar (ör. `hourly_transportation_*.csv`, `holidays-2022-2031.csv`). |
| `data/interim/` | Ham veriden türeyen ara parquet çıktıları. |
| `data/processed/` | Modellemeye hazır feature setleri, boyut tabloları ve tarihsel split dosyaları. |
| `docs/` | PRD, teknik tasarım, proje özeti/günlüğü ve veri kalite logları. |
| `frontend/` | Harita tabanlı UI prototipleri için ayrılmış klasör (şimdilik boş). |
| `models/`, `reports/` | Eğitim çıktılarının ve değerlendirme görsellerinin saklandığı klasörler. |

## Kurulum

1. Python 3.10+ sürümüyle sanal ortam oluşturun.
2. Bağımlılıkları yükleyin:

   ```bash
   pip install -r requirements.txt
   ```

3. Gerekli veri dosyalarını `data/raw/` klasörüne yerleştirin (İBB saatlik yolcu CSV’leri, `holidays-2022-2031.csv`, vb.).

> Makefile, aktif sanal ortamı (`$VIRTUAL_ENV`) veya proje kökündeki `.venv/` klasörünü otomatik seçer. Farklı bir yorumlayıcı kullanmak için komutları `PYTHON=/path/to/python make ...` biçiminde çalıştırabilirsiniz.

## Veri Pipeline’ı

1. **Ham veriyi parquet’e dönüştürme**

   ```bash
   python src/data_prep/load_raw.py
   ```

   - Çıktılar `data/interim/transport_hourly.parquet` ve `data/interim/transport_district_hourly.parquet` olarak oluşturulur.
   - Betikteki seçenekleri düzenleyerek hat/ilçe kırılımları arasında geçiş yapabilirsiniz.

2. **Temizleme**

   ```bash
   python src/data_prep/clean_data.py
   ```

   - Eksik `town` kayıtlarını filtreleyerek `data/processed/transport_district_hourly_clean.parquet` dosyasını üretir.

3. **Keşif**

   ```bash
   python src/data_prep/explore_data.py
   ```

   - Veri kümesinin örnek kayıtlarını ve eksik değer istatistiklerini raporlar. Farklı parquet dosyalarını incelemek için betikteki yol değişkenini düzenleyin.

4. **Feature üretimi**

   ```bash
   python src/features/build_final_features.py
   ```

   - Lag/rolling (`lag_rolling_transport_hourly.parquet`), takvim (`calendar_dim.parquet`) ve hava (`weather_dim.parquet`) tablolarını birleştirerek `features_pl.parquet` dosyasını üretir.
   - Pandas uyumlu bir kopya gerekiyorsa `python src/features/convert_features_to_pandas.py` çalıştırın (`features_pd.parquet`).

5. **Veri kalite kontrolü**

   ```bash
   python src/features/check_features_quality.py
   ```

   - Polars tabanlı QA sonuçlarını `docs/data_quality_log_pl.txt` dosyasına ekler. Pandas muadili `src/features/convert_features_to_pandas.py` çalıştığında `docs/data_quality_log.txt` güncellenir.

6. **Train/Validation/Test bölünmesi**

   ```bash
   python src/features/split_features.py
   ```

   - `features_pd.parquet` üzerinden tarih bazlı kesimler yaparak `data/processed/split_features/` klasöründe train/val/test parquet dosyaları oluşturur ve `datetime` ile `year` sütunlarını kaldırır.

## Model Eğitimi ve Değerlendirmesi

1. **LightGBM eğitim (v1 normalizasyonlu pipeline)**

   ```bash
   python src/model/train_model.py
   ```

   - Hat bazlı aykırı değer kırpma ve normalizasyon uygular, LightGBM’i erken durdurma ile eğitir, ardından modeli (`models/lgbm_transport_v1_norm.txt`), metrikleri (`reports/logs/lgbm_metrics_v1_norm.json`), önem tablosunu (`feature_importance_v1_norm.csv`) ve ilk 20 özelliği gösteren grafiği (`reports/figs/feature_importance_v1_norm.png`) kaydeder.

2. **Değerlendirme ve SHAP analizi**

   ```bash
   python src/model/eval_model.py
   ```

   - Eğitimde kullanılan modelleri (varsayılan olarak `lgbm_transport_v1.txt`/`lgbm_transport_v2.txt`) yükler, tahminleri yeniden ölçekler ve lag-24h, lag-168h, line+hour ortalaması baselines ile karşılaştırır.
   - MAE/RMSE/SMAPE metrikleri, saat bazlı hatalar, en problemli 10 hat listesi, önem değişim tablosu ve SHAP özet grafiği üreterek `reports/logs/` ve `reports/figs/` klasörlerine kaydeder.
   - Not: Eğer yalnızca `lgbm_transport_v1_norm.txt` mevcutsa scriptteki dosya adlarını eşleştirin. SHAP örneklem sayısı (varsayılan 5000) bellek ihtiyacına göre güncellenebilir.

## Makefile Kısayolları

Aşağıdaki hedefler güncel pipeline’ı otomatikleştirmek için tanımlanmıştır (ayrıntılar için `Makefile` dosyasına bakınız):

```bash
make install            # pip install -r requirements.txt
make data-raw           # load_raw.py
make data-clean         # clean_data.py
make data-explore       # explore_data.py
make features-final     # build_final_features.py
make features-qa        # check_features_quality.py
make features-split     # split_features.py
make model-train        # train_model.py
make model-eval         # eval_model.py
make pipeline           # data-raw → features-final → features-qa → features-split
```

## Dokümantasyon

- Ürün gereksinimleri: `docs/PRD.md`
- Teknik mimari: `docs/Technical Document.md`
- Proje özeti: `docs/project-summary.md`
- Commit bazlı günlük: `docs/project-log.md`
- Veri kalite logları: `docs/data_quality_log.txt`, `docs/data_quality_log_pl.txt`

> Ayrıntılı karar geçmişi ve ek bağlam için `docs/` klasöründeki diğer dokümanlara göz atabilirsiniz.
