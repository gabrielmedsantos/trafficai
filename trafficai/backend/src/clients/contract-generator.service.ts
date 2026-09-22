// ==============================
// TrafficAI — Geração automática de contrato (PDF)
// Modelo com {placeholders} (mesmo padrão de renderTemplate() usado no
// relatório diário de WhatsApp) + geração de PDF via pdfkit — sem depender
// de headless browser (Chromium), leve o suficiente pra rodar na VPS.
// ==============================

import PDFDocument from 'pdfkit';
import { query, queryOne } from '../database/connection';

// ─── Modelo padrão ───────────────────────────────────────────────────────
// Dados do CONTRATADO (Alfamax) são fixos — só o CONTRATANTE (cliente) e os
// termos do contrato (valor, vencimento, prazo, projeto) variam por cliente.
const DEFAULT_TEMPLATE_CONTENT = `Contrato de Prestação de Serviço

CONTRATANTE: {client_legal_name},
CNPJ: {client_cnpj}, COM SEDE NA {client_address}, BAIRRO: {client_neighborhood}, CEP: {client_zip}, {client_city_state}.

CONTRATADO: ALFAMAX DIGITAL,
CNPJ: 51.732.222/0001-30, COM SEDE NA RUA GOIÁS, BAIRRO: BELA VISTA, CEP: 60441-150, FORTALEZA - CE.
DEVIDAMENTE REPRESENTADA NESSE ATO POR GABRIEL MEDEIROS DOS SANTOS, CPF 621.313.733-50, PROPRIETÁRIO.

As partes identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Assessoria de Marketing Digital e Gestão de Tráfego Pago, que se regerá pelas cláusulas seguintes e pelas condições descritas no presente.

1. DO OBJETO DO CONTRATO

CLÁUSULA 1ª: O presente instrumento tem como objeto a prestação de serviços de ASSESSORIA DE MARKETING E GESTÃO DE TRÁFEGO PAGO, regendo-se pelas cláusulas seguintes e pelas condições posteriormente descritas.

CLÁUSULA 2ª: O CONTRATADO executará os serviços diretamente à CONTRATANTE para o respectivo projeto: {project_name}. Todavia, serviços prestados a outros empreendimentos ou projetos pertencentes à CONTRATANTE ou seu representante legal deverão ser orçados à parte.

2. DA PRESTAÇÃO DE SERVIÇOS

CLÁUSULA 3ª: O CONTRATADO prestará à CONTRATANTE todos os serviços abaixo descritos:

A) Elaboração de plano estratégico para campanhas de tráfego pago;
B) Configurações da conta de anúncios;
C) Configuração do pixel e API de conversões;
D) Gestão de tráfego pago no gerenciador de anúncios do Meta Ads e Google Ads;
E) Análise de dados visando melhorias na performance;
F) Direcionamento para produção de criativos e vídeos de anúncios;
G) Grupo para feedback, dúvidas e informações importantes para o andamento do projeto;
H) Reuniões quinzenais via chamada de vídeo (meet ou zoom), podendo haver reuniões semanais se necessário.

Parágrafo Primeiro. O CONTRATADO executará os serviços acima listados conforme autorização prévia do CONTRATANTE, correndo única e exclusivamente por conta do CONTRATANTE todos os custos necessários à execução, como: investimento em anúncios, criativos estáticos e vídeos.

Parágrafo Segundo. O CONTRATANTE deverá disponibilizar login e senha das ferramentas, plataformas e redes sociais ao CONTRATADO, para configurações necessárias na plataforma do Instagram, Facebook Ads e Google Ads, sendo proibido o uso para outros fins do CONTRATADO.

3. DO PREÇO, FORMA E CONDIÇÕES DE PAGAMENTO.

CLÁUSULA 4ª: O presente instrumento conta com a discriminação mensal de pagamentos acordados entre ambas as partes, e a CONTRATANTE compromete-se a cumprir pontualmente com o pagamento de: {monthly_value} ({monthly_value_extenso}) no mês de referência, na data de pagamento acordada dia {first_payment_date}, e assim sucessivamente no mesmo dia {due_day} até o final do prazo desse contrato e/ou renovação automática.

Parágrafo Primeiro. O CONTRATANTE pagará ao CONTRATADO os valores estipulados acima via pix para a seguinte conta bancária:
51.732.222 GABRIEL MEDEIROS DOS SANTOS: PIX: 51.732.222/0001-30 (CNPJ), Santander

Parágrafo Segundo. O não pagamento do serviço prestado, até a data do vencimento, sujeitará o CONTRATANTE, imediata e independentemente de notificação ou interpelação judicial ou extrajudicial, a juros de mora de 0,33% (zero vírgula trinta e três por cento) ao dia, a partir do vencimento de cada parcela.

4. DO PRAZO

CLÁUSULA 5ª: A prestação dos serviços tem vigência inicial de {contract_term_months} meses, contando a partir da data de início, podendo ser prorrogado de acordo com a renovação automática (cláusula 12) caso não haja manifestação por escrito por parte da Contratante, respeitando o aviso prévio, da rescisão do mesmo.

Parágrafo Primeiro. O início da veiculação dos anúncios é de até 7 dias úteis após a entrega dos acessos, regularização das contas de anúncios nas plataformas e entrega dos ativos necessários para veiculação, como; criativos estáticos e/ou vídeos e legendas.

5. DAS OBRIGAÇÕES DA CONTRATANTE

CLÁUSULA 6ª: Fica estabelecido que são obrigações da CONTRATANTE:

a) Efetuar o pagamento pontualmente nas datas acordadas;
b) Todas as reuniões, quando não-presenciais, serão via Meet ou Zoom e que poderão ser gravadas para documentação mediante concordância de ambas as partes já firmada no presente instrumento;
c) Fornecer à CONTRATADA, materiais e informações indispensáveis para a prestação de serviços, em até 24h (vinte e quatro horas) a partir da solicitação formalizada nos meios de comunicação previamente acordados.

CLÁUSULA 7ª: Fica estabelecido as seguintes obrigações da CONTRATADA:

a) Cumprir, com excelência, o estipulado na cláusula 3ª e disponibilizar-se a considerar e orçar todo e qualquer serviço necessário à parte do previsto no presente instrumento, contanto que a solicitação em questão faça parte do know-how da CONTRATADA;
b) Observar as instruções da CONTRATANTE e adaptá-las aos critérios internos do desenvolvimento do projeto, responsabilizando-se pelo caráter técnico dos serviços;
c) Prestar informações à CONTRATANTE, sobre o andamento, desenvolvimento e resultado dos serviços, sempre que solicitado;
d) Cumprir rigorosamente com o princípio de confidencialidade acerca de procedimentos e informações que digam respeito à CONTRATANTE.

CLÁUSULA 8ª: São motivos para que a CONTRATANTE rescinda o presente instrumento:

a) Desídia do CONTRATADO no cumprimento das obrigações assumidas para com a CONTRATANTE;
b) Comprovação de atos partindo da CONTRATADA que venham a impactar de forma negativa a imagem comercial da CONTRATANTE perante terceiros;
c) Abstenção do cumprimento de quaisquer das cláusulas dispostas no presente instrumento.

CLÁUSULA 9ª: São motivos para que a CONTRATADA rescindir o presente instrumento:

a) Registro de solicitações do CONTRATANTE sobre atividades que excedam o préstito neste instrumento de contrato sob o argumento de cobertura contractual, (vide cláusulas 3ª e 6ª);
b) Descumprimento da parte CONTRATANTE de quaisquer termos dispostos nas cláusulas presentes neste instrumento;
c) Inadimplência da CONTRATANTE a partir do 15º dia após o vencimento.

PARÁGRAFO ÚNICO: É responsabilidade da parte CONTRATANTE fornecer dados suficientes para o Relatório Comparativo de Campanhas, que toma como principal objetivo o levantamento de critérios avaliativos dos resultados e que refletem significativamente no índice de dividendos da CONTRATANTE, sendo o fornecimento destes dados de suma importância para o desenvolvimento do projeto como um todo.

6. DA RESCISÃO

CLÁUSULA 10ª: Conforme previsto nas cláusulas anteriores (vide 8ª e 9ª), o presente instrumento poderá ser rescindido caso uma das partes não cumpra o estabelecido ou viole quaisquer dos acordos referentes a confidencialidade e honra previstos neste. A parte rescindente obriga-se a pagar multa correspondente à importância de 10% do valor total previamente descrito e perfeito expressivo na soma das {contract_term_months} parcelas.

CLÁUSULA 11ª: A rescisão amigável implica na não obrigatoriedade do pagamento de multa, uma vez que cumprido o aviso prévio de distrato previsto anteriormente (vide cláusula 10ª) e que não haja configuração de violação ou descumprimento de quaisquer das cláusulas previstas no presente instrumento. Doravante, compreende-se que o presente instrumento configura-se expressamente rescindido mediante a assinatura do Termo de Distrato, que deverá ser enviado pela CONTRATADA em até 48h após o registro formal do desejo de rescisão da parte interessada à parte contrária.

PARÁGRAFO ÚNICO: Em qualquer caso de rescisão contratual, não ocorrerá a devolução de qualquer valor pago pelo CONTRATANTE. A CONTRATADA poderá extinguir o presente contrato, a qualquer tempo, mediante prévia notificação à CONTRATANTE sempre que considerar caracterizado algum tipo de infração aos dispositivos constantes deste presente contrato.

7. DA RENOVAÇÃO AUTOMÁTICA

CLÁUSULA 12ª: Fica estabelecido entre as partes contratantes que, ao término do prazo inicial de vigência do presente contrato, caso nenhuma das partes notifique a outra por escrito com antecedência mínima de trinta (30) dias antes do término da vigência, o contrato será automaticamente renovado por período de tempo indeterminado. As condições, obrigações e termos de rescisão estipulados neste contrato permanecerão em vigor durante o período de renovação, salvo ajustes expressamente acordados por ambas as partes.

PARÁGRAFO ÚNICO: A NOTIFICAÇÃO DE NÃO RENOVAÇÃO deverá ser feita por escrito, através de meio eletrônico com confirmação de recebimento, e será considerada efetiva somente após a confirmação de recebimento pela parte notificada.

8. DO FORO

CLÁUSULA 13ª: As partes elegem o Foro desta Comarca, para dirimir eventuais dúvidas oriundas do presente, com renúncia expressa de qualquer outro por mais privilegiado que seja.

CLÁUSULA 14°. E por estarem justos e contratados assinam o presente em 2 (duas) vias de igual teor, forma e efeitos abaixo:

({signature_date}, {signature_city})`;

export interface ContractVars {
    client_legal_name: string;
    client_cnpj: string;
    client_address: string;
    client_neighborhood: string;
    client_zip: string;
    client_city_state: string;
    project_name: string;
    monthly_value: string;
    monthly_value_extenso: string;
    due_day: string;
    first_payment_date: string;
    contract_term_months: string;
    signature_date: string;
    signature_city: string;
}

/** Mesmo padrão de daily-whatsapp.service.ts — {placeholder} desconhecido fica intacto. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
        if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
        return match;
    });
}

export async function getOrCreateDefaultTemplate(userId: string): Promise<{ id: string; name: string; content: string }> {
    const existing = await queryOne<{ id: string; name: string; content: string }>(
        `SELECT id, name, content FROM contract_templates WHERE user_id = $1 AND name = 'Modelo padrão'`,
        [userId]
    );
    if (existing) return existing;
    const created = await queryOne<{ id: string; name: string; content: string }>(
        `INSERT INTO contract_templates (user_id, name, content) VALUES ($1, 'Modelo padrão', $2) RETURNING id, name, content`,
        [userId, DEFAULT_TEMPLATE_CONTENT]
    );
    return created!;
}

export function formatCurrencyBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Valor por extenso (PT-BR) ──────────────────────────────────────────
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function trescentosPorExtenso(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const partes: string[] = [];
    if (c > 0) partes.push(CENTENAS[c]!);
    if (resto > 0) {
        if (resto < 10) partes.push(UNIDADES[resto]!);
        else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]!);
        else {
            const d = Math.floor(resto / 10);
            const u = resto % 10;
            partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!);
        }
    }
    return partes.join(' e ');
}

/** Converte um valor em reais pra texto por extenso (ex: 1200 -> "mil e duzentos reais"). Cobre até 999.999. */
export function valorPorExtenso(value: number): string {
    const inteiro = Math.floor(value);
    const centavos = Math.round((value - inteiro) * 100);
    if (inteiro === 0 && centavos === 0) return 'zero reais';

    const milhar = Math.floor(inteiro / 1000);
    const resto = inteiro % 1000;
    const partes: string[] = [];
    if (milhar > 0) {
        partes.push(milhar === 1 ? 'mil' : `${trescentosPorExtenso(milhar)} mil`);
    }
    if (resto > 0) partes.push(trescentosPorExtenso(resto));
    const reaisTexto = partes.join(' e ') || 'zero';
    const reaisPalavra = inteiro === 1 ? 'real' : 'reais';

    if (centavos === 0) return `${reaisTexto} ${reaisPalavra}`;
    const centavosTexto = trescentosPorExtenso(centavos);
    const centavosPalavra = centavos === 1 ? 'centavo' : 'centavos';
    return `${reaisTexto} ${reaisPalavra} e ${centavosTexto} ${centavosPalavra}`;
}

/** Gera o PDF do contrato a partir do texto já renderizado (placeholders substituídos). */
export function generateContractPdf(renderedContent: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 60, right: 60 } });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const paragraphs = renderedContent.split('\n');
        const boldPatterns = /^(CLÁUSULA|PARÁGRAFO|CONTRATANTE:|CONTRATADO:|DEVIDAMENTE REPRESENTADA|\d+\.\s|Contrato de Prestação de Serviço$)/;

        for (const [i, line] of paragraphs.entries()) {
            const trimmed = line.trim();
            if (i === 0) {
                doc.font('Helvetica-Bold').fontSize(15).text(trimmed, { align: 'center' });
                doc.moveDown(1.2);
                continue;
            }
            if (!trimmed) { doc.moveDown(0.6); continue; }
            const isBold = boldPatterns.test(trimmed);
            doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5)
                .text(trimmed, { align: 'justify' });
            doc.moveDown(0.4);
        }

        doc.end();
    });
}

export async function saveGeneratedContract(
    contractId: string, templateId: string | null, filename: string, pdfBuffer: Buffer, vars: ContractVars
): Promise<{ id: string }> {
    const rows = await query<{ id: string }>(
        `INSERT INTO generated_contracts (contract_id, template_id, filename, file_data, vars_snapshot)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [contractId, templateId, filename, pdfBuffer, JSON.stringify(vars)]
    );
    return rows[0]!;
}
