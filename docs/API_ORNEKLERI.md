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
