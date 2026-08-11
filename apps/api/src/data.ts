import type { Approval, Lead, Message, Product } from "./types.js";

export const products: Product[] = [
  {
    id: "gxl-gumus-24g",
    sku: "GXL-GMS-024",
    name: "GXL 925 Ayar Gümüş Tesbih – Ay Yıldızlı Oksitli",
    category: "gumus_tesbih",
    description: "Ay-yıldız detaylı, oksit görünümlü, 24 gram 925 ayar gümüş tesbih.",
    stock: 1,
    stockVerified: false,
    weightGrams: 24,
    material: "925 ayar gümüş",
    imageUrls: ["asset:gxl-24g-1.jpg", "asset:gxl-24g-2.jpg", "asset:gxl-24g-3.jpg"],
    videoUrls: [],
    tags: ["925 ayar", "gümüş", "24 gram", "ay yıldız", "oksitli", "tesbih"],
    shopierUrl: "https://www.shopier.com/goxsel/49555980",
    letgoUrl: "https://www.letgo.com/ad/1732503836"
  },
  {
    id: "gxl-gumus-17g",
    sku: "GXL-GMS-017",
    name: "GXL 925 Ayar Gümüş Tesbih – Arpa Kesim",
    category: "gumus_tesbih",
    description: "Parlak arpa kesim taneli, 17 gram 925 ayar gümüş tesbih.",
    stock: 1,
    stockVerified: false,
    weightGrams: 17,
    material: "925 ayar gümüş",
    imageUrls: ["asset:gxl-17g-1.jpg", "asset:gxl-17g-2.jpg", "asset:gxl-17g-3.jpg"],
    videoUrls: [],
    tags: ["925 ayar", "gümüş", "17 gram", "arpa kesim", "parlak", "tesbih"],
    shopierUrl: "https://www.shopier.com/goxsel/49555980",
    letgoUrl: "https://www.letgo.com/ad/1732517403"
  },
  {
    id: "gxl-gumus-telkari",
    sku: "GXL-GMS-TEL",
    name: "GXL 925 Ayar Gümüş Telkâri Tesbih",
    category: "gumus_tesbih",
    description: "Telkâri görünümlü kafes taneli, 925 ayar gümüş tesbih. Gram bilgisi satış öncesi doğrulanmalıdır.",
    stock: 1,
    stockVerified: false,
    material: "925 ayar gümüş",
    imageUrls: ["asset:gxl-telkari-1.jpg", "asset:gxl-telkari-2.jpg", "asset:gxl-telkari-3.jpg"],
    videoUrls: [],
    tags: ["925 ayar", "gümüş", "telkari", "kafes", "el işçiliği", "tesbih"],
    shopierUrl: "https://www.shopier.com/goxsel/49555980"
  }
];

export const leads: Lead[] = [
  {
    id: "lead-001",
    displayName: "Ahmet K.",
    channel: "instagram",
    handle: "@ahmet_ornek",
    stage: "contact_pending",
    consent: true,
    interests: ["oksitli", "ay yıldız", "gümüş"],
    score: 88,
    autoReplyAllowed: false
  },
  {
    id: "lead-002",
    displayName: "Mehmet D.",
    channel: "whatsapp",
    handle: "+90 5** *** ** 42",
    stage: "active",
    consent: true,
    interests: ["925 ayar", "gümüş"],
    score: 93,
    lastInboundAt: new Date().toISOString(),
    autoReplyAllowed: true
  },
  {
    id: "lead-003",
    displayName: "Selin A.",
    channel: "letgo",
    handle: "selin_ornek",
    stage: "qualified",
    consent: false,
    interests: ["doğal taş", "bileklik"],
    score: 71,
    autoReplyAllowed: false
  }
];

export const approvals: Approval[] = [
  {
    id: "apr-001",
    leadId: "lead-001",
    channel: "instagram",
    draft: "Merhaba Ahmet Bey, GXL 925 ayar gümüş tesbih modellerimizle ilgilendiğinizi gördüm. İsterseniz 24 g oksitli ve 17 g arpa kesim modellerimizin fotoğraflarını gönderebilirim.",
    productIds: ["gxl-gumus-24g", "gxl-gumus-17g"],
    status: "pending",
    createdAt: new Date().toISOString()
  }
];

export const messages: Message[] = [
  {
    id: "msg-001",
    leadId: "lead-002",
    channel: "whatsapp",
    direction: "inbound",
    text: "925 ayar gümüş tesbihiniz var mı, fiyatı nedir?",
    mediaUrls: [],
    createdAt: new Date().toISOString(),
    automated: false
  }
];
