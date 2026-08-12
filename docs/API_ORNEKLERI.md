# API örnekleri

## Gösterge paneli

```bash
curl http://localhost:8787/api/dashboard
```

## İlk mesaj taslağı oluşturma

```bash
curl -X POST http://localhost:8787/api/approvals \
  -H 'content-type: application/json' \
  -d '{"leadId":"lead-001","draft":"Merhaba, size uygun iki tesbih modelini paylaşabilir miyim?","productIds":["prd-kehribar-01"]}'
```

## İlk mesajı onaylama

```bash
curl -X POST http://localhost:8787/api/approvals/apr-001/approve
```

## Müşteriden gelen mesajı işleme

```bash
curl -X POST http://localhost:8787/api/messages/inbound \
  -H 'content-type: application/json' \
  -d '{"leadId":"lead-002","text":"925 ayar gümüş tesbihin fiyatı nedir?"}'
```

## Ürün fotoğrafını analiz etme

Android uygulaması fotoğrafı sıkıştırılmış Base64 veri URL'si olarak gönderir. Sunucuda `OPENAI_API_KEY` ve `OPENAI_VISION_MODEL` tanımlı olmalıdır.

```bash
curl -X POST http://localhost:8787/api/products/analyze-images \
  -H 'content-type: application/json' \
  -d '{"imageDataUrls":["data:image/jpeg;base64,BASE64"],"sellerFacts":{"origin":"vintage","yearMade":1998,"authenticityVerified":false}}'
```

Yanıt; gözlenen özellikleri, doğrulanması gereken iddiaları, Etsy/Shopier/Letgo ilan taslaklarını ve her platform için `allowed`, `review` veya `blocked` kararını içerir.

## Potansiyel müşteriyi puanlama

```bash
curl -X POST http://localhost:8787/api/prospects/score \
  -H 'content-type: application/json' \
  -d '{"catalogTags":["koleksiyon"],"signals":[{"type":"inbound_message","channel":"instagram","occurredAt":"2026-08-12T10:00:00.000Z","consent":true,"productTags":["koleksiyon"],"text":"Fiyat ve kargo nedir?"}]}'
```

Motor yalnızca gerçek kanal sinyallerini puanlar. İzin veya gelen mesaj yoksa `canDraftFirstContact=false` döner.
