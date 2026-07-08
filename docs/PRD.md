# Ürün Gereksinim Dokümanı (PRD)

## Ürün Adı (Çalışma Adı)
**İstanbul Ulaşım Yoğunluk Tahmin Platformu**

## Amaç
İstanbul’daki toplu ulaşım hatları için saatlik yolcu yoğunluğunu tahmin ederek kullanıcıya daha uygun yolculuk zamanlarını öneren ve harita tabanlı görselleştirme sağlayan bir platform geliştirmek.

---

## 1. Ürün Tanımı
Bu platform; geçmiş yolcu verileri, hava durumu ve takvimsel etkileri kullanarak **24 saat ileriye dönük hat bazlı yoğunluk tahmini** üretir.  
Tahminler web tabanlı bir arayüzde gösterilir.  
Kullanıcılar bir hattın seçili saatlerde ne kadar yoğun olacağını görerek daha rahat saatleri planlayabilir.

> Yoğunluk verisi gerçek zamanlı sensör verisine değil; geçmiş istatistikler, hava durumu ve sezonsal etkilerle eğitilmiş tahmin modeline dayanır.

---

## 2. Hedef Kullanıcılar

| Kullanıcı | İhtiyaç | Sağlanan Fayda |
|------------|----------|----------------|
| Günlük Yolcular | Pik saatlerden kaçınma | Daha konforlu yolculuk |
| Operasyon / Planlama Ekipleri | Talep trendlerini izleme | Stratejik sefer kararlarına destek |
| Veri Analistleri | Yoğunluk modeli inceleme | Raporlama ve veri analizi için referans |

---

## 3. Kullanıcı Senaryoları
- Kullanıcı favori hattını seçer ve seçili saatlerdeki tahmini yoğunluğu görüntüler.  
- Gelecek 24 saat için yoğunluk değişimini zaman çizelgesi (slider) ile inceler.  
- Kritik saatlerde uygulama bildirim ile uyarı sağlar.  
- İlçe bazlı toplulaştırılmış yoğunluk haritası üzerinden kentin hareket durumu izlenebilir.  
- Kullanıcıya daha az yoğun saat önerisi sunulur.

---

## 4. Özellik Seti

### Temel Özellikler (MVP)
- Hat bazlı saatlik yoğunluk tahmini (24 saat ileri)
- Tahmine dayalı anlık yoğunluk gösterimi
- Hava durumu etkili tahmin (daily weather, forward-fill)
- Takvimsel etkilerin dahil edilmesi (hafta içi/hafta sonu, tatil, okul dönemi vb.)
- Zaman çizelgesi ile geçmiş/gelecek yoğunluk gösterimi
- İlçe bazlı yoğunluk ısı haritası
- Favori hat takibi
- Bildirim desteği (PWA)
- Daha az yoğun saat önerisi

### Genişletilebilir Özellikler (V1.5–V2)
- Yoğunluk trend görselleştirmesi (geçmiş kıyas)
- Harita üzerinde yağış etkisi erişimi (overlay)
- Senaryo simulasyonları (örn. yağış olursa değişim tahmini)
- Hat geometrilerinin haritada gösterimi (veri mevcut olursa)

### Olası Gelecek Özellikler (V3+)
- Çok hatlı güzergah önerisi (routing)
- Hat segment bazlı yoğunluk (detaylı polyline verisi sağlanırsa)
- Etkinlik farkındalığı (maç, konser etkisi)
- Kullanıcıya özel yolculuk önerileri

---

## 5. Veri Kaynakları

| Veri | Kullanım Amacı |
|-------|----------------|
| İBB hat-saat bazlı yolcu verisi | Model hedef değişkeni |
| Günlük hava durumu verisi (forecast dahil) | Eksojen değişken |
| Takvim verisi (tatil vb.) | Sezonsallık ve davranış değişimi |
| İlçe sınır poligonları | Harita üzerinde bölgesel gösterim |

> Not: Veri akışı şu anda sabittir. Güncellenirse model yeniden eğitime uygun altyapı hazır olacaktır.

---

## 6. Teknik Yaklaşım (Özet)

- **Makine öğrenmesi modeli:** Gradient Boosting (LightGBM)
- **Feature Engineering:**
  - Zaman değişkenleri (saat, gün, sezon vb.)
  - Hava durumu değişkenleri
  - Lag ve rolling pencereler
- **Tahmin Üretimi:**
  - Gece 1 kez toplu tahmin (T+24)
  - Gün içinde anlık tahmin (lag’ler ile)
- **Sunum:**
  - Web tabanlı harita arayüzü
  - Grafiksel gösterimler
  - API destekli veri sağlama

---

## 7. Yoğunluk Gösterimi

Model çıktısı olan yolcu sayısı, bağlamsal yoğunluk skoruna dönüştürülür:

1. **Tarihsel yüzdelik konumu (percentile)**
2. **Hattın kendi maksimumuna göre konum (peak index)**
3. **Birleşik yoğunluk seviyesi:**
   - Çok düşük  
   - Düşük  
   - Orta  
   - Yüksek  
   - Çok yüksek  

Bu sayede kullanıcıya anlaşılır ve bağlamsal yoğunluk bilgisi sağlanır.

---

## 8. Başarı Metrikleri

| Metrik | Hedef |
|---------|--------|
| Tahmin hata oranı (MAE/SMAPE) | Baseline yöntemden daha iyi performans |
| Kullanıcı etkileşimi | Hat seçimi ve grafik görüntüleme oranı |
| Performans & hız | Arayüzde gecikmesiz veri sunumu |

---

## 9. Yol Haritası

| Aşama | Açıklama |
|--------|-----------|
| Veri hazırlığı & özellik çıkarımı | Temel dataset ve feature pipeline |
| Modelleme & değerlendirme | ML modeli, validasyon & benchmark |
| Web arayüzü ve harita | UI/UX geliştirme |
| Bildirim ve son entegrasyon | API & kullanıcı bildirim entegrasyonu |

---

## 10. Riskler

| Risk | Etki | Çözüm |
|-------|------|--------|
| Sensör tabanlı gerçek zamanlı veri olmaması | Tahmin sınırlı kalabilir | Kullanımda tahmin olduğu net belirtilir |
| Hava API kesintisi | Tahmin eksikliği | Son bilinen değer ile devam |
| Hat geometri verisi eksikliği | Harita görselliği sınırlı | İlçe bazlı gösterim ile MVP tamamlanır |

---

## Özet

Platform, İstanbul’da toplu taşıma yolcularına bilgi desteği sunan, **veri temelli ve tahmine dayalı** bir yoğunluk bilgilendirme çözümüdür.  
Uygulama yalın, anlaşılır ve genişlemeye uygun bir yapıda tasarlanmıştır.
# Ürün Gereksinim Dokümanı (PRD)

## Ürün Adı (Çalışma Adı)
**İstanbul Ulaşım Yoğunluk Tahmin Platformu**

## Amaç
İstanbul’daki toplu ulaşım hatları için saatlik yolcu yoğunluğunu tahmin ederek kullanıcıya daha uygun yolculuk zamanlarını öneren ve harita tabanlı görselleştirme sağlayan bir platform geliştirmek.

---

## 1. Ürün Tanımı
Bu platform; geçmiş yolcu verileri, hava durumu ve takvimsel etkileri kullanarak **24 saat ileriye dönük hat bazlı yoğunluk tahmini** üretir.  
Tahminler web tabanlı bir arayüzde gösterilir.  
Kullanıcılar bir hattın seçili saatlerde ne kadar yoğun olacağını görerek daha rahat saatleri planlayabilir.

> Yoğunluk verisi gerçek zamanlı sensör verisine değil; geçmiş istatistikler, hava durumu ve sezonsal etkilerle eğitilmiş tahmin modeline dayanır.

---

## 2. Hedef Kullanıcılar

| Kullanıcı | İhtiyaç | Sağlanan Fayda |
|------------|----------|----------------|
| Günlük Yolcular | Pik saatlerden kaçınma | Daha konforlu yolculuk |
| Operasyon / Planlama Ekipleri | Talep trendlerini izleme | Stratejik sefer kararlarına destek |
| Veri Analistleri | Yoğunluk modeli inceleme | Raporlama ve veri analizi için referans |

---

## 3. Kullanıcı Senaryoları
- Kullanıcı favori hattını seçer ve seçili saatlerdeki tahmini yoğunluğu görüntüler.  
- Gelecek 24 saat için yoğunluk değişimini zaman çizelgesi (slider) ile inceler.  
- Kritik saatlerde uygulama bildirim ile uyarı sağlar.  
- İlçe bazlı toplulaştırılmış yoğunluk haritası üzerinden kentin hareket durumu izlenebilir.  
- Kullanıcıya daha az yoğun saat önerisi sunulur.

---

## 4. Özellik Seti

### Temel Özellikler (MVP)
- Hat bazlı saatlik yoğunluk tahmini (24 saat ileri)
- Tahmine dayalı anlık yoğunluk gösterimi
- Hava durumu etkili tahmin (daily weather, forward-fill)
- Takvimsel etkilerin dahil edilmesi (hafta içi/hafta sonu, tatil, okul dönemi vb.)
- Zaman çizelgesi ile geçmiş/gelecek yoğunluk gösterimi
- İlçe bazlı yoğunluk ısı haritası
- Favori hat takibi
- Bildirim desteği (PWA)
- Daha az yoğun saat önerisi

### Genişletilebilir Özellikler (V1.5–V2)
- Yoğunluk trend görselleştirmesi (geçmiş kıyas)
- Harita üzerinde yağış etkisi erişimi (overlay)
- Senaryo simulasyonları (örn. yağış olursa değişim tahmini)
- Hat geometrilerinin haritada gösterimi (veri mevcut olursa)

### Olası Gelecek Özellikler (V3+)
- Çok hatlı güzergah önerisi (routing)
- Hat segment bazlı yoğunluk (detaylı polyline verisi sağlanırsa)
- Etkinlik farkındalığı (maç, konser etkisi)
- Kullanıcıya özel yolculuk önerileri

---

## 5. Veri Kaynakları

| Veri | Kullanım Amacı |
|-------|----------------|
| İBB hat-saat bazlı yolcu verisi | Model hedef değişkeni |
| Günlük hava durumu verisi (forecast dahil) | Eksojen değişken |
| Takvim verisi (tatil vb.) | Sezonsallık ve davranış değişimi |
| İlçe sınır poligonları | Harita üzerinde bölgesel gösterim |

> Not: Veri akışı şu anda sabittir. Güncellenirse model yeniden eğitime uygun altyapı hazır olacaktır.

---

## 6. Teknik Yaklaşım (Özet)

- **Makine öğrenmesi modeli:** Gradient Boosting (LightGBM)
- **Feature Engineering:**
  - Zaman değişkenleri (saat, gün, sezon vb.)
  - Hava durumu değişkenleri
  - Lag ve rolling pencereler
- **Tahmin Üretimi:**
  - Gece 1 kez toplu tahmin (T+24)
  - Gün içinde anlık tahmin (lag’ler ile)
- **Sunum:**
  - Web tabanlı harita arayüzü
  - Grafiksel gösterimler
  - API destekli veri sağlama

---

## 7. Yoğunluk Gösterimi

Model çıktısı olan yolcu sayısı, bağlamsal yoğunluk skoruna dönüştürülür:

1. **Tarihsel yüzdelik konumu (percentile)**
2. **Hattın kendi maksimumuna göre konum (peak index)**
3. **Birleşik yoğunluk seviyesi:**
   - Çok düşük  
   - Düşük  
   - Orta  
   - Yüksek  
   - Çok yüksek  

Bu sayede kullanıcıya anlaşılır ve bağlamsal yoğunluk bilgisi sağlanır.

---

## 8. Başarı Metrikleri

| Metrik | Hedef |
|---------|--------|
| Tahmin hata oranı (MAE/SMAPE) | Baseline yöntemden daha iyi performans |
| Kullanıcı etkileşimi | Hat seçimi ve grafik görüntüleme oranı |
| Performans & hız | Arayüzde gecikmesiz veri sunumu |

---

## 9. Yol Haritası

| Aşama | Açıklama |
|--------|-----------|
| Veri hazırlığı & özellik çıkarımı | Temel dataset ve feature pipeline |
| Modelleme & değerlendirme | ML modeli, validasyon & benchmark |
| Web arayüzü ve harita | UI/UX geliştirme |
| Bildirim ve son entegrasyon | API & kullanıcı bildirim entegrasyonu |

---

## 10. Riskler

| Risk | Etki | Çözüm |
|-------|------|--------|
| Sensör tabanlı gerçek zamanlı veri olmaması | Tahmin sınırlı kalabilir | Kullanımda tahmin olduğu net belirtilir |
| Hava API kesintisi | Tahmin eksikliği | Son bilinen değer ile devam |
| Hat geometri verisi eksikliği | Harita görselliği sınırlı | İlçe bazlı gösterim ile MVP tamamlanır |

---

## Özet

Platform, İstanbul’da toplu taşıma yolcularına bilgi desteği sunan, **veri temelli ve tahmine dayalı** bir yoğunluk bilgilendirme çözümüdür.  
Uygulama yalın, anlaşılır ve genişlemeye uygun bir yapıda tasarlanmıştır.
