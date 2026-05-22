import type { MetaSendTemplatePayload } from '../../types/whatsapp.types';
interface TemplateData {
    name: string;
    language: string;
    headerType?: string | null;
    headerContent?: string | null;
    variables: Array<{
        index: number;
        name: string;
        example?: string;
    }>;
    variablesCount: number;
}
/**
 * Monta o payload para envio de template message via Cloud API.
 * @param to              - Número do destinatário (E.164 sem +, ex: 5511999999999)
 * @param template        - Dados do template
 * @param variableValues  - Mapa de valores: {"nome": "João", "empresa": "ACME"}
 *                          Aceita também índice como chave: {"1": "João", "2": "ACME"}
 */
export declare function buildTemplatePayload(to: string, template: TemplateData, variableValues?: Record<string, string>): MetaSendTemplatePayload;
/**
 * Resolve variable values from contact data + campaign overrides.
 * Merges: contact.customVariables + provided overrides.
 */
export declare function resolveVariables(contactCustomVariables: Record<string, unknown>, overrides?: Record<string, string>): Record<string, string>;
export {};
//# sourceMappingURL=message.builder.d.ts.map