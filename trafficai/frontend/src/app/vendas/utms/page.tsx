'use client';

import React, { useState } from 'react';
import { useSalesReport, Card, Tabs, ReportTable, NameCell, ErrorBox, financialColumns, Group } from '@/components/vendas/shared';

type UtmGroup = Extract<Group, 'utm_source' | 'utm_campaign' | 'utm_medium' | 'utm_content' | 'utm_term' | 'product'>;
const FIELDS: { key: UtmGroup; label: string }[] = [
    { key: 'utm_campaign', label: 'utm_campaign' },
    { key: 'utm_medium', label: 'utm_medium' },
    { key: 'utm_content', label: 'utm_content' },
    { key: 'utm_source', label: 'utm_source' },
    { key: 'utm_term', label: 'utm_term' },
    { key: 'product', label: 'Produto' },
];

export default function UtmsPage() {
    const [group, setGroup] = useState<UtmGroup>('utm_campaign');
    const { data, loading, error } = useSalesReport(group);
    const withSpend = group === 'utm_campaign' || group === 'utm_medium' || group === 'utm_content';

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Card style={{ padding: 0 }}>
                <Tabs tabs={FIELDS} active={group} onChange={setGroup} />
                <ReportTable
                    rows={data?.rows || []}
                    loading={loading}
                    defaultSort="revenue"
                    firstLabel={FIELDS.find(f => f.key === group)!.label}
                    renderFirst={(r) => <NameCell name={r.name} sub={r.meta_id} title={r.key} />}
                    columns={withSpend ? financialColumns() : financialColumns().filter(c => !['cpa', 'spend', 'roas', 'roi'].includes(String(c.key)))}
                    emptyText="Nenhuma venda com UTM no período."
                />
            </Card>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Quando a UTM vem no formato <code>nome|id</code> (template da Meta em Pixel e UTMs), o gasto do nível correspondente entra na conta:
                utm_campaign → campanha, utm_medium → conjunto, utm_content → anúncio.
            </p>
        </>
    );
}
