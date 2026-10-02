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
/[locale]               Ağ haritası + saat kaydırıcısı · arama · favoriler · "Şu an" panosu
                        (tüm raylı hatlar + Metrobüs) · yakınındaki istasyonlar
/[locale]/line/[code]   Hattı vurgulayan harita · şu an · rahat/kaçınılacak saatler ·
                        saatlik grafik (hattın renginde) · sefer saatleri · istasyon şeridi
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
| `GET /api/lines/34/route` | Metrobüs güzergahı |
| `GET /api/forecast/{code}` | Saatlik tahmin (pano için ~21 hat paralel, önbellekli) |

## 7. Kurallar

- Renk tek başına anlam taşımaz; her seviye bir kelime ve figür sayısıyla birlikte gösterilir.
- Saat hesapları `Europe/Istanbul` diliminde yapılır.
- Dokunma hedefleri en az 44 px. Animasyonlar kısa tutulur ve `prefers-reduced-motion` ayarına uyar.
- Yeni bir renk eklemeden önce: bu bir hat rengi mi, değilse gerçekten gerekli mi?
