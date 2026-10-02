# İstanbul ulaşım verisi: API'ler ve veri setleri

İstanbul'da toplu taşıma ve şehir verisi sunan açık servislerin sade bir haritası. Her şey
**2 Ekim 2026'da canlı olarak denendi**; durum sütunu o günkü sonucu gösterir. Bu dosya DoluMu'dan
bağımsız okunabilir, başka projelere olduğu gibi kopyalanabilir.

- ✅ çalışıyor · ⚠️ çalışıyor ama dikkat · ❌ hata veriyor / boş

## Önce bilinmesi gerekenler

| | |
|---|---|
| Kimlik doğrulama | Yok. Anahtar, kayıt, token gerekmiyor. |
| Hız sınırı | Görülmedi (20 paralel istek ~0,3 sn'de döndü). Yine de sonuçları önbelleğe alın. |
| CORS | Metro İstanbul, İETT, İSPARK **CORS başlığı göndermiyor** → tarayıcıdan doğrudan çağrılamaz, kendi sunucunuz üzerinden (proxy) çağırın. Hava kalitesi servisi `*` gönderiyor. |
| Lisans | [İBB Açık Veri Lisansı](https://data.ibb.gov.tr/license) — ticari kullanım serbest, kaynak gösterilmeli. |
| Katalog | [data.ibb.gov.tr](https://data.ibb.gov.tr) (CKAN). 557 veri seti, ~190'ı ulaşımla ilgili. |
| Ana adres | Canlı servislerin çoğu `https://api.ibb.gov.tr/...` altında. |

**Katalogdan bir veri setinin dosyalarını programla bulmak** (CKAN API):

```bash
# Bir veri setinin tüm dosyaları (ad, format, URL, son güncelleme)
curl -s 'https://data.ibb.gov.tr/api/3/action/package_show?id=iett-gtfs-verisi'
# Arama
curl -s 'https://data.ibb.gov.tr/api/3/action/package_search?q=metro&rows=50'
```

Dosya URL'leri yeni yıl/ay eklendikçe değişir; kodda sabit URL yerine `package_show` ile en yeni
kaynağı seçmek daha dayanıklıdır.

---

## 1. Metro İstanbul (metro, tramvay, füniküler, teleferik)

REST + JSON. Taban: `https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/`
Yanıt hep `{"Success": true, "Error": null, "Data": ...}` biçiminde. Yardım sayfası:
`https://api.ibb.gov.tr/MetroIstanbul/Help`. **Marmaray bu API'de yok.**

```bash
curl -s https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetStations
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"BoardingStationId":118,"DirectionId":66,"DateTime":"2026-10-02T08:00:00"}' \
  https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/GetTimeTable
```

| Uç | Ne verir | Durum |
|---|---|---|
| `GET GetLines` | 18 hat: ad, renk, ilk/son sefer, `Content` içinde HTML "İşletme Bilgileri" (uzunluk, sefer süresi, günlük yolcu, araç sayısı, sefer sıklığı) | ✅ 170 KB |
| `GET GetStations` | 248 istasyon: hat, sıra, koordinat, asansör/yürüyen merdiven sayısı, WC, mescit, bebek odası | ✅ |
| `GET GetStationById/{LineId}` | Bir hattın istasyonları | ✅ |
| `GET GetRailwayGroups` | Hat grupları ve **LineId ↔ hat kodu** eşlemesi (`9: M1A`, `11: T1`…) | ✅ |
| `GET GetDirectionById/{LineId}` | Hattın iki yönü (`DirectionId`) | ✅ |
| `POST GetDirectionsByLineIdAndStationId` `{LineId, StationId}` | İstasyondaki yönler | ✅ |
| `POST GetTimeTable` `{BoardingStationId, DirectionId, DateTime}` | O istasyondan o yöne **dakika bazlı kalkış saatleri** | ✅ (geçmişte uzun süre bozuk kaldı) |
| `POST GetStationBetweenTime` `{…aynı}` | Hat boyunca istasyonlar arası dakika | ⚠️ bazı yönlerde `Sequence contains more than one element` hatası |
| `GET GetServiceStatuses` | **Canlı aksama/arıza** bildirimi olan hatlar (metin, güncelleme zamanı) | ✅ |
| `GET GetFaultyEquipments` | Toplam çalışan/arızalı asansör, yürüyen merdiven, bant sayıları | ✅ |
| `POST GetFaultyEquipmentDetails` `{"EquipmentGroupName":"Asansör"}` | **İstasyon bazında arızalı ekipman** (`"Yürüyen Merdiven"`, `"Yürüyen Bant"` da olur) | ✅ |
| `GET GetAnnouncements/{tr\|en}` · `GetNews/{tr\|en}` · `GetActivities` | Duyuru, haber, etkinlik | ✅ |
| `GET GetTicketPrice/TR` | İstanbulkart ücret tablosu | ✅ |
| `GET GetLineProjects` | Yapımı süren hatlar (ilerleme %, yüklenici, km) | ✅ |
| `GET GetMaps` · `GetAddresses/{dil}` · `FrequentlyAskedQuestions` · `GetTechnicalObjectTypes` · `GetFailureTypes` | Ağ haritası PDF'leri, adresler, SSS, kod listeleri | ✅ |
| `GET GetDirections` | Tüm yönler | ❌ 500 |
| `GET GetFailuresTypes` | Arıza türleri | ❌ iç hata |

Dikkat: `DetailInfo.Latitude/Longitude` metin; yeni açılan istasyonlarda boş gelebilir.
`GetLines.Content` HTML'dir, olgular düz metinden ayıklanmalı.

---

## 2. İETT (otobüs, Metrobüs)

**SOAP** servisleri; çoğu işlemin `_json` sürümü var ama JSON yine de SOAP zarfının içinde,
HTML-escape edilmiş olarak döner. Taban: `https://api.ibb.gov.tr/iett/`. Her servisin işlem listesi
`?wsdl` ile görülebilir.

```bash
curl -s https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx \
  -H 'Content-Type: text/xml; charset=utf-8' \
  -H 'SOAPAction: "http://tempuri.org/GetHatOtoKonum_json"' \
  -d '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetHatOtoKonum_json xmlns="http://tempuri.org/"><HatKodu>500T</HatKodu></GetHatOtoKonum_json></soap:Body></soap:Envelope>'
```

Yanıttaki `<GetHatOtoKonum_jsonResult>…</GetHatOtoKonum_jsonResult>` içeriğini alın,
HTML-unescape edin (`&lt;` → `<`, `&amp;` → `&` …), sonra JSON olarak çözün. Küçük bir yardımcı:

```python
import html, json, re, requests

def iett(service, op, **params):
    args = "".join(f"<{k}>{v}</{k}>" for k, v in params.items())
    env = ('<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
           f'<soap:Body><{op} xmlns="http://tempuri.org/">{args}</{op}></soap:Body></soap:Envelope>')
    r = requests.post(f"https://api.ibb.gov.tr/iett/{service}", data=env.encode(), timeout=60,
                      headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": f'"http://tempuri.org/{op}"'})
    inner = html.unescape(re.search(rf"<{op}Result[^>]*>(.*?)</{op}Result>", r.text, re.S).group(1))
    return json.loads(inner) if op.endswith("_json") else inner  # _json değilse XML DataSet

iett("FiloDurum/SeferGerceklesme.asmx", "GetHatOtoKonum_json", HatKodu="500T")
```

### Canlı

| Servis · işlem | Ne verir | Durum |
|---|---|---|
| `FiloDurum/SeferGerceklesme.asmx` · `GetHatOtoKonum_json(HatKodu)` | Hatta **atanmış** araçların anlık konumu: kapı no, koordinat, yön, `guzergahkodu` (depar), en yakın durak, son konum zamanı | ✅ ~0,3 sn |
| `… GetFiloAracKonum_json()` | **Tüm filo** (~6,9 bin araç): kapı no, plaka, koordinat, hız, saat. Hat kodu yok. | ✅ 1,1 MB |
| `UlasimDinamikVeri/Duyurular.asmx` · `GetDuyurular_json()` | Hat bazında duyurular (iptal edilen seferler, güzergah değişiklikleri) | ✅ |
| `… GetBozukSatih_json()` | Şoförlerin bildirdiği bozuk yol noktaları | ✅ |
| `… GetKazaLokasyon_json(Tarih)` | O günkü İETT kaza konumları ve saatleri | ✅ |

### Ana veri (hat, durak, tarife)

| Servis · işlem | Ne verir | Durum |
|---|---|---|
| `UlasimAnaVeri/HatDurakGuzergah.asmx` · `GetHat_json(HatKodu)` | Boş kod → **çalışan tüm hatlar** (~783): ad, tarife (`2 BİLETLİ`…), uzunluk, sefer süresi | ✅ |
| `… GetDurak_json(DurakKodu)` | Boş kod → **tüm duraklar** (~15 bin, 3,6 MB): ad, koordinat (WKT), ilçe, yön, durak tipi, engelli uygunluğu | ✅ |
| `… GetGaraj_json()` | 86 garaj ve konumları | ✅ |
| `ibb/ibb.asmx` · `DurakDetay_GYY_wYonAdi(hat_kodu)` | Hattın **iki yöndeki sıralı durakları**, yön adlarıyla (XML DataSet) | ✅ |
| `… HatServisi_GYY(hat_kodu)` | Hat adı, durum, bölge, sefer süresi (XML) | ✅ |
| `UlasimAnaVeri/PlanlananSeferSaati.asmx` · `GetPlanlananSeferSaati_json(HatKodu)` | Planlı kalkış saatleri; gün tipi `I` hafta içi, `C` cumartesi, `P` pazar | ✅ |

### Geçmiş (ibb360)

| Servis · işlem | Ne verir | Durum |
|---|---|---|
| `ibb/ibb360.asmx` · `GetIettArsivGorev_json(Tarih=yyyyMMdd)` | Bir günün **gerçekleşen tüm seferleri** (~55 bin, 20 MB): hat, depar, araç, planlanan/gerçek kalkış, bitiş, durum (`T` tamamlandı, `I` iptal). En az 16 gün geriye gidiyor. | ✅ ~5 sn |
| `… GetIettYolculukHat_json(Tarih=yyyy-MM-dd)` | O gün **en yoğun 50 hattın** yolculuk sayısı | ✅ |
| `AracAnaVeri/AracOzellik.asmx` · `GetAkarYakitToplamLitre_json(Yil, Ay)` | Günlük toplam yakıt tüketimi | ✅ |

Kavramlar: **depar** = güzergah varyantı, kod biçimi `HAT_YÖN_D<no>` (ör. `19_G_D1610`); `D0` ana
güzergah, diğerleri kısa/alternatif seferler. Metrobüs `34`, `34AS`, `34BZ`… gibi birçok kodla işler.
İETT metro arızalarında aynı kodla (ör. `M7`) aktarma otobüsü çalıştırabilir.

---

## 3. Marmaray (TCDD)

**Açık canlı API yok.** Ne var:

| Kaynak | İçerik |
|---|---|
| İBB GTFS 2024 (`public-transport-gtfs-data`) | Ajans `TCDD`: Marmaray hatları ve sıklıkları (2024'ten kalma) |
| `rayli-sistem-istasyon-noktalari-verisi` (GeoJSON) | Marmaray istasyonları (`HAT_TURU: Banliyö`), ayrıca yapımı süren istasyonlar |
| `rayli-sistemler-istasyon-bazli-yolcu-ve-yolculuk-sayilari` | Marmaray istasyonlarında günlük giriş (`TCDD TASIMACILIK A.S.` satırları) |
| OpenStreetMap relation [9987139](https://www.openstreetmap.org/relation/9987139) | Güzergah ve 43 istasyon (ODbL) |

---

## 4. Deniz (Şehir Hatları ve diğer vapurlar)

Canlı API yok. GTFS 2024'te Şehir Hatları ve diğer deniz işletmeleri var (`route_type 4`). Ayrıca:
`deniz-ulasim-istasyonlari-vektor-verisi` (iskeleler), `deniz-ulasim-hatlari-vektor-verisi`,
`istanbul-deniz-iskeleleri-yolcu-sayilari` (yıllık, 2025 dahil), `sehir-hatlari-sefer-sayilari`.

---

## 5. Diğer canlı şehir servisleri

| Uç | Ne verir | Durum |
|---|---|---|
| `GET api.ibb.gov.tr/ispark/Park` | 247 İSPARK otoparkı: kapasite, **anlık boş yer**, çalışma saatleri, tip. `isOpen` açık/kapalı otopark *tipini* gösterir, açık olup olmadığını değil. | ✅ |
| `GET api.ibb.gov.tr/ispark/ParkDetay?id={parkID}` | Tek otopark: aylık ücret, tarife, adres, alan poligonu, güncelleme zamanı (geçersiz id'de boş kayıt döner) | ✅ |
| `GET/POST api.ibb.gov.tr/ispark-bike/GetAllStationStatus` | İsbike istasyonları | ❌ boş liste |
| `GET tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndex_Sc1_Cont` | **Anlık trafik indeksi**: `TI` genel, `TI_An` Anadolu, `TI_Av` Avrupa yakası | ✅ |
| `GET api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndexHistory/{gün}/{periyot}` | Trafik indeksi geçmişi, 5 dk adımlı (XML) | ✅ |
| `GET api.ibb.gov.tr/web/api/junction` | 2.589 sinyalize kavşak ve konumları | ✅ |
| `GET api.ibb.gov.tr/havakalitesi/OpenDataPortalHandler/GetAQIStations` · `GetAQIByStationId?StationId=&StartDate=dd.MM.yyyy HH:mm:ss&EndDate=…` | Hava kalitesi istasyonları ve saatlik ölçümler (PM10, NO2, O3…), CORS açık | ✅ |
| [sehirharitasiapi.ibb.gov.tr/developer](https://sehirharitasiapi.ibb.gov.tr/developer/) | Şehir Haritası API'si (adres, POI; kendi geliştirici portalı) | — |
| `api.ibb.gov.tr/teas/api/open_data` | Yol bakım | ❌ 404 |

---

## 6. Dosya veri setleri (seçme)

Ulaşım için en işe yarar olanlar. Ad = `package_show?id=` değeri.

| Veri seti | İçerik | Güncellik |
|---|---|---|
| `hourly-public-transport-data-set` | Saatlik İstanbulkart geçişleri, hat bazında | ⚠️ 2020-01 → **2024-10'da donmuş**; Kasım–Aralık 2024 dosyaları boş |
| `rayli-sistemler-istasyon-bazli-yolcu-ve-yolculuk-sayilari` | Raylı sistemlerde istasyon girişi bazında günlük geçiş ve yolcu, 2021–2025 | 2025 yılı var |
| `yas-grubuna-gore-rayli-sistemler-istasyon-bazli-yolcu-ve-yol…` | Aynısı, yaş grubu kırılımıyla | 2025 |
| `toplu-ulasimda-istanbul-kart-harici-gecis-verisi` | Kredi kartı / QR gibi kart dışı geçişler | 2025 |
| `iett-gtfs-verisi` | İETT GTFS (agency, routes, trips, stops, stop_times, calendar) | 2026-03 |
| `public-transport-gtfs-data` | Çok işletmeli GTFS: Metro İstanbul, TCDD (Marmaray), Şehir Hatları, İDO, Turyol, Dentur, minibüs, taksi-dolmuş; shapes ve frequencies dahil | 2024-03 |
| `iett-hat-guzergahlari` | Tüm İETT deparlarının yol geometrisi, uzunluk, süre (GeoJSON, 257 MB) | 2026-03 |
| `iett-otobus-duraklari-verisi` | İETT durakları (GeoJSON) | 2026-03 |
| `rayli-ulasim-hatlari-vektor-verisi` · `rayli-sistem-istasyon-noktalari-verisi` | Raylı hat geometrisi ve istasyonlar (mevcut + inşaat) | 2025-06 |
| `minibus-hatlari-verisi` · `taksi-dolmus-hatlari-verisi` · `taksi-duraklari-verisi` | Minibüs, dolmuş, taksi hat/durakları | 2025-06 |
| `istanbul-bisiklet-yollari-verisi` · `bisiklet-ve-mikromobilite-park-alanlari` | Bisiklet yolları, park alanları | 2025-06 |
| `rayli-sistemler-gunluk-aylik-yillik-hat-bazli-sefer-sayilari` | Raylı hat başına sefer sayıları | 2026-04 |
| `hourly-traffic-density-data-set` | Geohash hücresi başına saatlik en düşük/en yüksek/ortalama hız ve araç sayısı | 2025-01'e kadar |
| `istanbul-trafik-indeksi` | Günlük en düşük / en yüksek / ortalama trafik indeksi, 2015'ten beri | 2025-09 |
| `ulasim-yonetim-merkezi-trafik-duyuru-verisi` | Kaza, yol çalışması vb. trafik duyuruları | 2025-03 |
| `gunluk-arac-sayimi` | Sayım noktalarında günlük araç sayısı | 2024 |
| `istanbul-ulasim-modeli` | Ulaşım ana planı modeli (bölgeler, matrisler) | 2026-02 |

---

## 7. Tuzaklar

- **Tarih biçimi** İETT'de `/Date(1790831780000)/` (UTC milisaniye) → İstanbul saatine çevirin (UTC+3).
- **Koordinatlar** bazı dosyalarda yerel biçimle bozulmuş: `289.920.277.777.778` → `28.9920277…`
  (noktaları silip ilk iki haneden sonra ondalık koyun). Bazı satırlarda hiç yok; istasyon adıyla eşleyin.
- **Kodlama ve ayraç**: İETT GTFS `routes` dosyası `;` ile ayrılmış ve çift UTF-8 kodlanmış
  (`KADIKÃ–Y`); 2024 GTFS Windows-1254. İstasyon yolcu CSV'si `;` ayraçlı, başında BOM var.
- **GTFS `stop_times`**: CSV sürümü 1.048.576 satırda kesik (Excel sınırı). ZIP sürümü tam (6,15 milyon satır).
- **Atanmış ≠ seferde**: `GetHatOtoKonum` garaja ya da ilk durağa boş giden araçları da verir. Aracın
  kendi deparının yoluna uzaklığına bakarak ayıklayın (500T'de 33 aracın 7'si güzergah dışındaydı).
- **Statik geometri geride kalabilir**: güzergah veri seti bazen canlı durak listesinden eski (19 numaralı hat
  veri setinde hâlâ Kadıköy'de bitiyordu, gerçekte Uzunçayır). Durak sırası için canlı `DurakDetay_GYY_wYonAdi` esas alın.
- **Aynı istasyonun birden çok girişi** var (`Şişli 2 Kuzey`, `Yenikapı Güney`): istasyon toplamı için girişleri toplayın.
- Büyük yanıtlar (arşiv 20 MB, filo 1,1 MB, güzergah GeoJSON 257 MB): sunucuda işleyip özetini saklayın.

---

## 8. DoluMu'da nerede kullanılıyor

| Kaynak | Kod |
|---|---|
| Metro İstanbul | `frontend/src/lib/live/metro.ts`, `src/api/clients/metro_api.py` |
| İETT canlı ve ana veri | `frontend/src/lib/live/iett.ts`, `src/api/services/iett_registry.py` |
| İETT sefer arşivi | `src/api/services/iett_archive.py` (`bus_line_days` tablosu) |
| İSPARK | `frontend/src/lib/live/city.ts` |
| Trafik indeksi | `src/api/routers/traffic.py` |
| Statik dosyalar | `frontend/scripts/build-bus-stops.mjs`, `build-bus-routes.mjs`, `build-rail-ridership.mjs` (her ay GitHub Action ile yenilenir) |
