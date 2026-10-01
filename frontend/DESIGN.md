# DoluMu — Ürün ve Tasarım Rehberi (v2)

Bu doküman yeni arayüzün ürün kararlarını, bilgi mimarisini ve tasarım sistemini tanımlar.
Backend'e dokunulmadı; her şey mevcut `/api` kontratı üzerine kurulu.

## 1. Ürün

**Kullanıcının asıl sorusu:** "Bu hatla gideceğim. Ne kadar kalabalık olacak, ne zaman gitsem daha rahat ederim?"

Uygulama bu soruyu **3 dokunuşta** cevaplamalı: hat ara → hattı aç → "şimdi" ve "ne zaman daha sakin" bilgisini gör.

**Ürün tanımı:** Mobil-öncelikli, kurulabilir (PWA) web uygulaması. Masaüstü ayrı bir ürün değil; aynı ekranlar geniş ekranda iki kolona açılır. Sürüklenebilir paneller, ayrı mobil/masaüstü bileşenleri yok.

### Kapsam

| Var | Yok (bilinçli) |
|---|---|
| Hat arama (otobüs, metrobüs, raylı, vapur) | Rota planlama / A→B yolculuk |
| Bugün + yarın için saatlik kalabalık tahmini | Canlı araç konumu |
| "Şimdi" özeti + daha sakin saat önerisi | Haftalık görünüm (API sadece T, T+1 veriyor) |
| Yön seçimi, sefer saatleri (otobüs) | Metro dakika tarifesi (Metro İstanbul API'si bozuk, bayrakla kapalı) |
| Güzergah haritası | Ana ekranda tam ekran harita |
| Favoriler, son aramalar | Hesap / giriş |
| TR/EN, açık/koyu/sistem tema | |

### Önemli ürün kararı: kalabalık seviyesi göreli gösterilir

API'deki `occupancy_pct` tahmini kapasiteye bölünerek hesaplanıyor ve kapasite verisi zayıf
(`confidence: "low"`). Sonuç olarak birçok hat günün 19 saati boyunca `%100 / Very High` görünüyor
(örn. 500T). Bu, "ne zaman daha sakin?" sorusunu cevaplayamaz.

Yeni arayüz Google Maps "Popüler saatler" mantığını kullanır:

```
göreli yoğunluk = o saatin tahmini yolcusu / o günün en yoğun saatindeki tahmini yolcu
```

| Seviye | Eşik | Anlamı |
|---|---|---|
| Sakin | < %40 | Günün en sakin dönemi |
| Normal | %40–65 | Ortalama |
| Yoğun | %65–85 | Kalabalık |
| Çok yoğun | ≥ %85 | Zirve saatleri |

Kapasiteye göre doluluk yüzdesi kaldırılmadı; "Bu tahmin nasıl hesaplanıyor?" bölümünde
güven notuyla birlikte gösterilir.

**"Daha sakin" önerisi:** Önümüzdeki 3 saat içinde şimdikinden en az %15 daha sakin bir saat
varsa öne çıkarılır ("21:00'de %35 daha sakin").

Tüm saat hesapları `Europe/Istanbul` saat dilimindedir (kullanıcı nerede olursa olsun).

## 2. Bilgi mimarisi

```
/[locale]                 Ana sayfa: arama, favoriler (şimdiki durum + mini grafik), popüler hatlar
/[locale]/line/[code]     Hat sayfası (paylaşılabilir URL, ?dir=G|D&day=today|tomorrow)
/[locale]/settings        Dil, tema, uygulamayı yükle, sorun bildir, hakkında, veriler
/[locale]/forecast        Eski favoriler sayfası → ana sayfaya yönlendirir
/[locale]/admin           Yönetim paneli (değişmedi)
```

Durum URL'de tutulur: hat, yön ve gün paylaşılabilir; geri tuşu doğal çalışır.

### Hat sayfası (mobil sırası)

1. Üst bar: geri, hat rozeti, hat adı, favori, paylaş
2. Yön seçici (otobüs) — durak adıyla: "→ TOPKAPI"
3. Duyuru/servis dışı bandı
4. **Şimdi kartı:** seviye, tahmini yolcu/saat, daha sakin saat önerisi
5. **Saatlik grafik:** Bugün/Yarın, 24 çubuk, dokununca saat detayı
6. Sefer saatleri: ilk/son, sıradaki kalkışlar, tüm tarife (alt sayfa)
7. Güzergah haritası (tembel yüklenir)
8. Bu tahmin nasıl hesaplanıyor? (kapasite, doluluk, güven)

Masaüstünde (≥1024px) 1–6 sol kolonda, harita ve açıklama sağ kolonda yapışkan.

## 3. Tasarım sistemi

### Renk (CSS değişkenleri, açık/koyu)

| Token | Kullanım |
|---|---|
| `bg`, `bg-subtle` | Sayfa zemini |
| `card`, `card-hover` | Kart yüzeyi |
| `border` | Ayraçlar |
| `fg`, `fg-muted`, `fg-subtle` | Metin hiyerarşisi |
| `brand` | DoluMu turkuazı (#188580 korunarak) — eylemler, odak |
| `level-quiet / normal / busy / peak` | Kalabalık skalası (yeşil → sarı → turuncu → kırmızı) |
| `mode-bus / metrobus / rail / ferry` | Ulaşım türü rozetleri; metro hatları resmi renklerini kullanır |

Kalabalık renkleri tek başına bilgi taşımaz: her zaman metin etiketiyle birlikte kullanılır.

### Tipografi

Geist Sans; saat ve sayılar `tabular-nums`. Ölçek: 12 / 14 / 16 / 20 / 28 px.

### Bileşenler

`LineBadge`, `LevelPill`, `HourlyBars`, `NowCard`, `Segmented`, `Sheet` (mobilde alt sayfa,
masaüstünde ortalı diyalog), `Section`, `EmptyState`, `Skeleton`.

### Etkileşim ilkeleri

- Dokunma hedefleri ≥ 44px
- Animasyonlar kısa (150–200ms) ve `prefers-reduced-motion`'a saygılı
- Her veri bölümünün yükleniyor / boş / hata durumu tasarlanmış
- Klavye: arama ↑↓/Enter, Esc ile kapanır; görünür odak halkası
