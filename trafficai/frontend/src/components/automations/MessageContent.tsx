"use client";
import { useState } from "react";
import { workflows as w, labels, type RecordRow } from "./api";
import TemplateDesigner from "./TemplateDesigner";

export default function MessageContent({ channel, template, onSaved }: {
  channel: string;
  template?: RecordRow;
  onSaved: (template: RecordRow) => void;
}) {
  const [draft, setDraft] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = () => {
    setError("");
    setDraft(template ? { ...template, name: (template.name || "Mensagem") + " · cópia" } : {
      id: "", name: "Nova mensagem", channel, purpose: "marketing", body: "", subject: "", blocks: [],
    });
  };
  async function save() {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const saved = await w.post<RecordRow>("/templates", {
        name: draft.name, channel, purpose: draft.purpose || "marketing",
        subject: draft.subject || "", body: draft.body || "", blocks: draft.blocks || [],
        preheader: draft.preheader || "", provider_template: draft.provider_template,
        language: draft.language || "pt_BR", parameters: draft.parameters || [],
      });
      onSaved(saved); setDraft(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar a mensagem"); }
    finally { setBusy(false); }
  }
  return <section className="aw-card" aria-label="Conteúdo da mensagem">
    <h4>{labels[channel] || channel} · Conteúdo</h4>
    {template ? <>
      <strong>{template.name}</strong>
      {channel === "email" && <p><b>Assunto:</b> {template.subject || "Sem assunto"}</p>}
      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 300, overflowY: "auto", margin: "12px 0" }}>{template.body || "Sem texto configurado"}</div>
      {!!template.blocks?.length && <details><summary>Ver conteúdo visual do e-mail ({template.blocks.length} blocos)</summary>
        {template.blocks.map((block, index) => <div key={index} style={{ marginTop: 12, overflowWrap: "anywhere" }}><b>{block.type === "button" ? "Botão" : block.type === "image" ? "Imagem" : block.type === "heading" ? "Título" : "Parágrafo"}:</b> <span style={{ whiteSpace: "pre-wrap" }}>{block.text}</span>{block.url && <div>{block.url}</div>}</div>)}
      </details>}
      {template.provider_template && <p>Template Meta: {template.provider_template}</p>}
      <small>As variáveis como {"{{name}}"} e {"{{checkout_url}}"} são preenchidas no envio.</small>
    </> : <p>Selecione um modelo ou crie o conteúdo desta mensagem aqui.</p>}
    {!draft && <button type="button" onClick={start}>{template ? "Adaptar cópia para este bloco" : "Criar mensagem aqui"}</button>}
    {draft && <fieldset disabled={busy} style={{ minWidth: 0, border: 0, padding: 0 }}>
      <legend>{template ? "Adaptar mensagem" : "Nova mensagem"}</legend>
      <label>Nome do modelo<input value={draft.name || ""} maxLength={160} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Finalidade<select value={draft.purpose || "marketing"} onChange={e => setDraft({ ...draft, purpose: e.target.value })}><option value="marketing">Marketing</option><option value="transactional">Transacional</option></select></label>
      {channel === "email" && <>
        <label>Assunto<input value={draft.subject || ""} maxLength={200} onChange={e => setDraft({ ...draft, subject: e.target.value })} /></label>
        <label>Prévia na caixa de entrada<input value={draft.preheader || ""} maxLength={200} onChange={e => setDraft({ ...draft, preheader: e.target.value })} /></label>
      </>}
      <label>{channel === "email" ? "Corpo em texto (alternativa ao e-mail visual)" : "Texto da mensagem"}<textarea rows={9} value={draft.body || ""} maxLength={10000} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
      <small>Variáveis: {"{{name}}, {{product}}, {{checkout_url}}, {{delivery_url}}, {{unsubscribe_url}}"}</small>
      {channel === "email" && <TemplateDesigner blocks={draft.blocks || []} body={draft.body || ""} preheader={draft.preheader || ""} onChange={blocks => setDraft({ ...draft, blocks })} />}
      {channel === "whatsapp" && <>
        <label>Template aprovado na Meta (somente WhatsApp Cloud)<input value={draft.provider_template || ""} onChange={e => setDraft({ ...draft, provider_template: e.target.value })} /></label>
        <label>Parâmetros Cloud, na ordem, separados por vírgula<input value={(draft.parameters || []).join(",")} onChange={e => setDraft({ ...draft, parameters: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} /></label>
        <small>Na Uazapi, o envio utiliza o texto acima. No WhatsApp Cloud, deve corresponder ao template aprovado.</small>
      </>}
      <p>Salvar cria um novo modelo e o seleciona no rascunho deste bloco. Depois, salve e publique o fluxo para usar a alteração.</p>
      <button type="button" disabled={!draft.name?.trim() || !draft.body?.trim()} onClick={save}>{busy ? "Salvando…" : "Salvar modelo e usar neste bloco"}</button>
      <button type="button" onClick={() => { setDraft(null); setError(""); }}>Cancelar</button>
    </fieldset>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
