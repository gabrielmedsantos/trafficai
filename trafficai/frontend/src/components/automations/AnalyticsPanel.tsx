"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { workflows as w, labels } from "./api";
import { ErrorFeedback, LoadingState } from "./Feedback";
interface Data {
  channels: {
    channel: string;
    provider: string;
    attempts: number;
    sent: number;
    delivered: number;
    failed: number;
    uncertain: number;
    opened_signal: number;
    clicked: number;
    unknown_cost: number;
  }[];
  costs: { currency: string; amount: string; priced_messages: number }[];
  revenue: {
    currency: string;
    purchases: number;
    attributed_revenue: string;
    recovered_revenue: string | null;
  }[];
  flows: {
    id: string;
    name: string;
    executions: number;
    completed: number;
    needs_attention: number;
  }[];
  attribution_model: string;
  cost_note: string;
}
export default function AnalyticsPanel() {
  const [days, setDays] = useState(30),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    w.get<Data>(
      "/analytics?since=" +
        new Date(Date.now() - days * 864e5).toISOString().slice(0, 10),
    )
      .then((v) => {
        if (live) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [days]);
  const money = (amount: string | null, currency: string) =>
    amount === null
      ? "Indisponível"
      : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
          Number(amount),
        );
  return (
    <>
      <header className="aw-head">
        <div>
          <h1>Analytics de automações</h1>
          <p>
            Dados reais por canal, fluxo e moeda. Simulações ficam fora dos
            indicadores.
          </p>
        </div>
        <Link className="aw-link" href="/automacoes">
          Voltar à central
        </Link>
      </header>
      <div className="aw-section-title">
        <h2>Desempenho</h2>
        <select
          aria-label="Período de análise"
          style={{ width: 180 }}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </div>
      {error && <ErrorFeedback message={error} />}
      {data ? (
        <>
          <div className="aw-card">
            {data.channels.length ? (
              <>
                <div className="aw-chart">
                  <ResponsiveContainer>
                    <BarChart
                      data={data.channels.map((c) => ({
                        ...c,
                        label:
                          (labels[c.channel] || c.channel) + " · " + c.provider,
                      }))}
                    >
                      <CartesianGrid vertical={false} stroke="#ffffff0b" />
                      <XAxis dataKey="label" fontSize={10} stroke="#7a8290" />
                      <YAxis allowDecimals={false} stroke="#7a8290" />
                      <Tooltip
                        contentStyle={{
                          background: "#16181b",
                          border: "1px solid #444",
                        }}
                      />
                      <Bar
                        dataKey="sent"
                        name="Enviadas"
                        fill="#38bdf8"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="delivered"
                        name="Entrega confirmada"
                        fill="#34d399"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="aw-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th>Enviadas</th>
                        <th>Entregues</th>
                        <th>Cliques</th>
                        <th>Falhas</th>
                        <th>Incerto</th>
                        <th>Sem custo informado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.channels.map((c) => (
                        <tr key={c.channel + ":" + c.provider}>
                          <td>
                            {labels[c.channel]} · {c.provider}
                          </td>
                          <td>{c.sent}</td>
                          <td>{c.delivered}</td>
                          <td>{c.clicked}</td>
                          <td>{c.failed}</td>
                          <td>{c.uncertain}</td>
                          <td>{c.unknown_cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="aw-empty">
                <h3>Ainda não há envios reais neste período</h3>
                <p>
                  O painel será preenchido pelas execuções e pelos recibos dos
                  provedores.
                </p>
              </div>
            )}
          </div>
          <div
            className="aw-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              marginTop: 18,
            }}
          >
            <section className="aw-card aw-table">
              <h2>Receita atribuída</h2>
              <p>{data.attribution_model}</p>
              {data.revenue.length ? (
                data.revenue.map((r) => (
                  <div key={r.currency}>
                    <strong>{money(r.attributed_revenue, r.currency)}</strong>
                    <p>
                      {r.purchases} compras · recuperação atribuída:{" "}
                      {money(r.recovered_revenue, r.currency)}
                    </p>
                  </div>
                ))
              ) : (
                <p>Nenhuma compra atribuída neste período.</p>
              )}
            </section>
            <section className="aw-card aw-table">
              <h2>Custos confirmados</h2>
              <p>{data.cost_note}</p>
              {data.costs.length ? (
                data.costs.map((c) => (
                  <p key={c.currency}>
                    {money(c.amount, c.currency)} · {c.priced_messages}{" "}
                    mensagens com custo informado
                  </p>
                ))
              ) : (
                <p>Indisponíveis: nenhum custo confirmado recebido.</p>
              )}
            </section>
          </div>
          <section className="aw-card aw-table">
            <h2>Por fluxo</h2>
            {data.flows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Fluxo</th>
                    <th>Execuções</th>
                    <th>Concluídas</th>
                    <th>Precisam de atenção</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flows.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link href={"/automacoes/fluxos/" + f.id}>
                          {f.name}
                        </Link>
                      </td>
                      <td>{f.executions}</td>
                      <td>{f.completed}</td>
                      <td>{f.needs_attention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Sem execuções reais.</p>
            )}
          </section>
          <p>
            Abertura de e-mail é um sinal limitado e não comprova leitura
            humana. Aceite de envio também não significa entrega confirmada.
          </p>
        </>
      ) : (
        !error && <LoadingState label="Carregando os indicadores…" />
      )}
    </>
  );
}
