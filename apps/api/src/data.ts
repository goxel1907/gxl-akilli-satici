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

export const leads: Lead[] = [];
export const approvals: Approval[] = [];
export const messages: Message[] = [];
