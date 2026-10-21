"use client";
import { Plus, Trash2 } from "lucide-react";
import type { Offer } from "./api";
export default function OfferFields({
  offers,
  onChange,
}: {
  offers: Offer[];
  onChange: (offers: Offer[]) => void;
}) {
  const change = (index: number, key: keyof Offer, value: string) =>
    onChange(
      offers.map((o, i) =>
        i === index
          ? { ...o, [key]: key === "price" ? Number(value) : value }
          : o,
      ),
    );
  return (
    <section className="aw-card">
      <div className="aw-section-title">
        <h3>Ofertas do produto</h3>
        <button
          disabled={offers.length >= 30}
          onClick={() =>
            onChange([
              ...offers,
              {
                id: crypto.randomUUID(),
                name: "",
                price: 0,
                currency: "BRL",
                checkout_url: "",
              },
            ])
          }
        >
          <Plus size={14} />
          Oferta
        </button>
      </div>
      {offers.map((o, index) => (
        <div key={o.id} className="aw-card" style={{ marginBottom: 12 }}>
          <label>
            Nome
            <input
              value={o.name}
              onChange={(e) => change(index, "name", e.target.value)}
            />
          </label>
          <label>
            Preço
            <input
              type="number"
              min={0}
              step="0.01"
              value={o.price}
              onChange={(e) => change(index, "price", e.target.value)}
            />
          </label>
          <label>
            Checkout HTTPS
            <input
              value={o.checkout_url}
              onChange={(e) => change(index, "checkout_url", e.target.value)}
            />
          </label>
          <label>
            ID externo da oferta (para identificar pedidos)
            <input
              value={o.external_product_id || ""}
              onChange={(e) =>
                change(index, "external_product_id", e.target.value)
              }
            />
          </label>
          <button
            onClick={() => onChange(offers.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} />
            Remover oferta do rascunho
          </button>
        </div>
      ))}
    </section>
  );
}
