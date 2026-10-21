"use client";
import { useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, Eye } from "lucide-react";
import { workflows as w, type EmailBlock } from "./api";
export default function TemplateDesigner({
  blocks,
  body,
  preheader,
  onChange,
}: {
  blocks: EmailBlock[];
  body: string;
  preheader: string;
  onChange: (blocks: EmailBlock[]) => void;
}) {
  const [html, setHtml] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [previewStamp, setPreviewStamp] = useState("");
  const contentStamp = JSON.stringify([blocks, body, preheader]);
  const change = (index: number, next: Partial<EmailBlock>) =>
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...next } : b)));
  const move = (index: number, direction: number) => {
    const copy = [...blocks];
    const target = index + direction;
    if (target < 0 || target >= copy.length) return;
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };
  return (
    <section className="aw-card">
      <div className="aw-section-title">
        <h3>Conteúdo visual do e-mail</h3>
        <button
          onClick={() => onChange([...blocks, { type: "text", text: "" }])}
          disabled={blocks.length >= 40}
        >
          <Plus size={14} />
          Bloco
        </button>
      </div>
      <p>
        Os blocos compõem a versão HTML. O campo de conteúdo acima continua como
        alternativa em texto.
      </p>
      {blocks.map((b, index) => (
        <div
          className="aw-card"
          key={index}
          style={{ marginBottom: 10, padding: 12 }}
        >
          <div className="aw-row">
            <select
              aria-label={"Tipo do bloco " + (index + 1)}
              style={{ width: 150 }}
              value={b.type}
              onChange={(e) =>
                change(index, { type: e.target.value as EmailBlock["type"] })
              }
            >
              <option value="text">Parágrafo</option>
              <option value="heading">Título</option>
              <option value="button">Botão</option>
              <option value="image">Imagem</option>
            </select>
            <button
              aria-label="Mover bloco para cima"
              onClick={() => move(index, -1)}
              disabled={!index}
            >
              <ArrowUp size={13} />
            </button>
            <button
              aria-label="Mover bloco para baixo"
              onClick={() => move(index, 1)}
              disabled={index === blocks.length - 1}
            >
              <ArrowDown size={13} />
            </button>
            <button
              aria-label="Excluir bloco"
              onClick={() => onChange(blocks.filter((_, i) => i !== index))}
            >
              <Trash2 size={13} />
            </button>
          </div>
          <label>
            {b.type === "image" ? "Descrição da imagem" : "Texto"}
            <textarea
              value={b.text}
              onChange={(e) => change(index, { text: e.target.value })}
            />
          </label>
          {["button", "image"].includes(b.type) && (
            <label>
              URL HTTPS ou {"{{checkout_url}}"} / {"{{delivery_url}}"}
              <input
                value={b.url || ""}
                onChange={(e) => change(index, { url: e.target.value })}
              />
            </label>
          )}
        </div>
      ))}
      <button
        disabled={busy}
        onClick={async () => {
          setError("");
          setBusy(true);
          try {
            const preview = await w.post<{ html: string }>(
              "/templates/preview",
              { blocks, body, preheader },
            );
            setHtml(preview.html);
            setPreviewStamp(contentStamp);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Eye size={15} />
        Prévia com dados de exemplo
      </button>
      {error && <p role="alert">{error}</p>}
      {html && previewStamp !== contentStamp && (
        <p role="status">
          O conteúdo mudou. Atualize a prévia para conferir a nova versão.
        </p>
      )}
      {html && previewStamp === contentStamp && (
        <iframe
          title="Prévia do e-mail com dados de exemplo"
          sandbox=""
          srcDoc={html}
          style={{
            background: "white",
            width: "100%",
            height: 400,
            border: 0,
            marginTop: 12,
            borderRadius: 8,
          }}
        />
      )}
    </section>
  );
}
