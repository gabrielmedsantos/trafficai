'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Rotina virou a vista "Calendário" dentro de /agenda — mantém essa rota
// funcionando pra quem tinha o link salvo, só redirecionando.
export default function RotinaRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/agenda?view=calendario');
    }, [router]);
    return null;
}
