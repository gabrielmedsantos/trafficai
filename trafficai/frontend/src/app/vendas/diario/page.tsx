'use client';

import React from 'react';
import { useSalesReport, Card, ReportTable, ErrorBox, financialColumns } from '@/components/vendas/shared';

export default function DiarioPage() {
    const { data, loading, error } = useSalesReport('day');
    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Card flat style={{ padding: 0 }}>
                <ReportTable
                    rows={data?.rows || []}
                    loading={loading}
                    defaultSort="key"
                    firstLabel="Data"
                    renderFirst={(r) => (
                        <span style={{ whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                            {new Date(`${r.key}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })}
                        </span>
                    )}
                    columns={financialColumns({ media: true })}
                />
            </Card>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
                Lucro do dia desconta imposto, custo de produto e as despesas adicionais lançadas naquela data.
            </p>
        </>
    );
}
