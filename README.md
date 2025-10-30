# İstanbul Ulaşım Yoğunluk Tahmin Platformu

## Proje Özeti

Bu repo, İstanbul Büyükşehir Belediyesi’nin paylaştığı saatlik yolcu verilerini kullanarak toplu taşıma hat ve ilçeleri için ileriye dönük yoğunluk tahminleri üreten bir platformu barındırır. Amaç, hem yolculara daha az yoğun saatleri önermek hem de planlama ekiplerine operasyonel içgörüler sağlamaktır.

## Mevcut Durum

- Polars tabanlı ETL ile ham CSV dosyaları saat/ilçe bazlı parquet çıktılara dönüştürülüyor.
- Pandas ile temel temizlik adımı (`town` eksik değerlerini atma) uygulanıyor.
- Keşif betikleri veri setinin başlıca istatistiklerini incelemek için hazır.
- Modelleme, API ve arayüz bileşenleri için klasörler oluşturuldu; uygulama kodu henüz eklenmedi.

## Depo Yapısı

| Yol | Açıklama |
| --- | --- |
| `src/data_prep/` | Ham verileri işleyen, temizleyen ve hızlı keşifler sunan Python betikleri. |
| `data/raw/` | İBB’nin saatlik toplu taşıma CSV dosyaları (repo içinde takip edilmez). |
| `data/processed/` | İşlenmiş parquet çıktılarının hedef konumu. |
| `docs/` | PRD, teknik tasarım, literatür taraması ve proje günlüğü. |
| `frontend/`, `api/`, `model/` | İleride eklenecek uygulama bileşenleri için boş şablon klasörleri. |

## Kurulum

1. Python 3.10+ sürümüyle sanal ortam oluşturun.
2. Gerekli paketleri yükleyin:

   ```bash
   pip install -r requirements.txt
   ```

3. `data/raw/` klasörüne İBB’nin saatlik toplu taşıma CSV dosyalarını yerleştirin.

## Veri Hazırlama Adımları

1. **Ham veriyi parquet’e dönüştürme:**

   ```bash
   python src/data_prep/load_raw.py
   ```

   - Varsayılan betik ilçeye göre saatlik toplamları `data/processed/transport_district_hourly.parquet` olarak üretir.
   - Hat bazlı çıktıyı almak için betikte yorum satırı hâlindeki bölüm yeniden etkinleştirilmelidir.

2. **Temizleme:**

   ```bash
   python src/data_prep/clean_data.py
   ```

   - Eksik `town` kayıtlarını filtreleyerek `transport_district_hourly_clean.parquet` dosyasını oluşturur.

3. **Keşif:**

   ```bash
   python src/data_prep/explore_data.py
   ```

   - Veri kümesinin ilk/son kayıtlarını ve eksik değer istatistiklerini raporlar. Betik şu anda hat bazlı parquet dosyasını okumaktadır; ilçeye göre çalıştırmak için dosya yolu güncellenmelidir.

## Yol Haritası

- Temizlik adımlarını Polars pipeline’ına entegre ederek tek geçişte üretim.
- Model eğitim pipeline’ı ve değerlendirme raporları.
- API katmanı ve PWA tabanlı kullanıcı arayüzü.
- Yoğunluk skorunu yüzdelik ve pik oranlarına göre hesaplayan servis.

## Dokümantasyon

- Ürün gereksinimleri: `docs/PRD.md`
- Teknik mimari: `docs/Technical Document.md`
- Literatür taraması: `docs/Existing Projects & Research.md`
- Proje günlüğü: `docs/project-log.md`

> Daha fazla bağlam ve karar geçmişi için `docs/` klasöründeki diğer kaynaklara göz atabilirsiniz.
