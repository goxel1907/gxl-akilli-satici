import type { Channel, Message } from "./types.js";

export interface ChannelConnector {
  channel: Channel;
  mode: "automatic" | "manual_handoff" | "catalog_and_orders";
  send(message: Message): Promise<{ accepted: boolean; externalId?: string; reason?: string }>;
}

class MetaConnector implements ChannelConnector {
  constructor(public channel: "whatsapp" | "instagram" | "facebook") {}
  mode = "automatic" as const;

  async send(message: Message) {
    if (!process.env.META_ACCESS_TOKEN) {
      return { accepted: false, reason: "META_ACCESS_TOKEN yapılandırılmadı; mesaj demo kuyruğunda tutuldu." };
    }
    // Üretimde kanal türüne göre Graph API endpoint'i çağrılır. Token istemciye asla gönderilmez.
    return { accepted: true, externalId: `meta-demo-${message.id}` };
  }
}

class ShopierConnector implements ChannelConnector {
  channel = "shopier" as const;
  mode = "catalog_and_orders" as const;
  async send() {
    return { accepted: false, reason: "Shopier müşteri mesaj kanalı değildir; ürün ve sipariş senkronizasyonu kullanılır." };
  }
}

class LetgoConnector implements ChannelConnector {
  channel = "letgo" as const;
  mode = "manual_handoff" as const;
  async send() {
    return { accepted: false, reason: "Doğrulanmış resmî mesajlaşma API'si yok; Letgo uygulamasında manuel devam edin." };
  }
}

class EtsyConnector implements ChannelConnector {
  channel = "etsy" as const;
  mode = "catalog_and_orders" as const;
  async send() {
    return { accepted: false, reason: "Etsy müşteri edinme için toplu mesaj kanalı değildir; ilan, sipariş ve izinli müşteri görüşmeleri yönetilir." };
  }
}

class EmailConnector implements ChannelConnector {
  channel = "email" as const;
  mode = "automatic" as const;
  async send() {
    if (!process.env.EMAIL_FROM || !process.env.EMAIL_PROVIDER_TOKEN) {
      return { accepted: false, reason: "İşletme e-posta hesabı ve gönderim sağlayıcısı bağlanmadı." };
    }
    return { accepted: false, reason: "E-posta sağlayıcısı adaptörü yapılandırılmalı." };
  }
}

export const connectors: Record<Channel, ChannelConnector> = {
  whatsapp: new MetaConnector("whatsapp"),
  instagram: new MetaConnector("instagram"),
  facebook: new MetaConnector("facebook"),
  shopier: new ShopierConnector(),
  letgo: new LetgoConnector(),
  etsy: new EtsyConnector(),
  email: new EmailConnector()
};
