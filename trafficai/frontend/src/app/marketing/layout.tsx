import Script from 'next/script';

// Fontes de tracking (Meta Pixel + CAPI) configuradas em /tracking pro site de marketing.
// public_token identifica a fonte no endpoint publico /track/pixel/:token.js
const PIXEL_TOKENS = [
    '7cec974dd97e3ea9594bc7cfb03a6e438c51250f', // Site Marketing — Pixel A (4243532112582475)
    '15ca40865ece61c24bbcd2131dbe80bf3847b35e', // Site Marketing — Pixel B (1251622673415548)
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {PIXEL_TOKENS.map(token => (
                <Script
                    key={token}
                    async
                    src={`${process.env.NEXT_PUBLIC_API_URL || 'https://api.alfamaxdigital.com.br/api/v1'}/track/pixel/${token}.js`}
                    strategy="afterInteractive"
                />
            ))}
            {children}
        </>
    );
}
