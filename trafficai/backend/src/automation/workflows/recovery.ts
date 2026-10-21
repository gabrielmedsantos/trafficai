export const RECOVERABLE_ORDER_STATUSES = ['pending', 'abandoned', 'refused', 'canceled'] as const;

/** Only configured offer URLs can be selected by webhook data. Unknown offers
 * return to the product page, rather than silently changing the buyer's plan. */
export function recoveryCheckout(product: any, order?: any, quiz = false): string {
  if (quiz) return product?.sales_url || '';
  const code = order?.raw?.item?.offer_code || order?.raw?.offer_code;
  const map = product?.settings?.recovery_offer_urls;
  const configured = typeof code === 'string' && map && Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
  if (typeof configured === 'string') {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' && !url.username && !url.password &&
          (product?.platform !== 'ticto' || url.hostname === 'payment.ticto.app')) return url.href;
    } catch {}
  }
  return product?.settings?.recovery_preserve_offer ? product?.sales_url || '' : product?.checkout_url || '';
}
