import { createHash } from "crypto";
import { ValidationError } from "../../shared/errors";
export function purchaseTag(product: any): string {
  if (!product?.source_id || !product?.external_product_id) return "";
  return "comprou:" + createHash("sha256").update(JSON.stringify(product.settings?.purchase_offer_code ? [product.source_id,product.external_product_id,product.settings.purchase_offer_code] : [product.source_id, product.external_product_id])).digest("hex").slice(0, 32);
}
export function promotionProduct(product: any, offerId?: string): any {
  if (!product || product.active === false) throw new ValidationError("Produto oferecido indisponível");
  const offer = offerId ? (product.offers || []).find((item: any) => item.id === offerId) : null;
  if (offerId && !offer) throw new ValidationError("Oferta de upsell não encontrada");
  const target = offer ? { ...product, ...offer, id: product.id } : product;
  if (!target.source_id || !target.external_product_id || !target.checkout_url)
    throw new ValidationError("Configure fonte, ID externo e checkout do produto oferecido");
  return target;
}

export function salesTag(value: string, product: any, promotion: any): string {
  if (value.includes("{{product_tag}}") && !purchaseTag(product)) return "";
  if (value.includes("{{promotion_tag}}") && !purchaseTag(promotion)) return "";
  return value.split("{{product_tag}}").join(purchaseTag(product)).split("{{promotion_tag}}").join(purchaseTag(promotion));
}
