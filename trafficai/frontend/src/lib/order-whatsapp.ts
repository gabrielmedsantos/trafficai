export function whatsappPhone(phone: string | null | undefined): string | null {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return null;
    return digits.length <= 11 ? `55${digits}` : digits;
}

export function orderMessage(order: { customer_name?: string; product_name?: string; status?: string }): string {
    const name = String(order.customer_name || '').trim().split(/\s+/)[0];
    const greeting = name ? `Oi, ${name}!` : 'Oi!';
    const product = order.product_name ? `*${order.product_name}*` : 'produto';
    return order.status === 'approved'
        ? `${greeting} Seu ${product} já está sendo preparado. Em breve, vamos te mandar por aqui. 😊`
        : `${greeting} Estou entrando em contato sobre seu pedido de ${product}. Posso te ajudar?`;
}

export function orderWhatsappUrl(phone: string | null | undefined, message: string): string | null {
    const normalized = whatsappPhone(phone);
    return normalized && message.trim() ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null;
}

// Link de checkout usado na recuperação de quem avançou no quiz e não comprou.
const quizCheckoutUrls: Record<string, string> = { 'mamae-quero-historinha': 'https://payment.ticto.app/OD9CA0E4C' };

export function quizRecoveryMessage(lead: { child_name?: string; funnel_slug?: string; funnel_name?: string }): string {
    const child = String(lead.child_name || '').trim().split(/\s+/)[0];
    const checkout = quizCheckoutUrls[lead.funnel_slug || ''];
    if (lead.funnel_slug === 'mamae-quero-historinha') {
        const story = child ? `a historinha personalizada para *${child}*` : 'a sua historinha personalizada';
        return `Oi! Aqui é da *Mamãe, quero historinha* 💛\n\nVi que você montou ${story} e não finalizou. Ela ficou salva aqui comigo.\n\nEstou te avisando antes porque o valor vai subir de R$ 9,90 para *R$ 29,90*. Quem finalizar agora ainda garante por *R$ 9,90*.\n\nÉ a última chance nesse preço:\n${checkout}\n\nFicou alguma dúvida? Me responde aqui que eu te ajudo 😊`;
    }
    const product = lead.funnel_name ? `*${lead.funnel_name}*` : 'quiz';
    return `Oi! Vi que você começou o ${product} e não finalizou. Ficou alguma dúvida? Posso te ajudar a concluir.${checkout ? `\n\nSeu link continua aqui: ${checkout}` : ''}`;
}
