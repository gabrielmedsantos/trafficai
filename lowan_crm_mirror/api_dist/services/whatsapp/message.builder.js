"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTemplatePayload = buildTemplatePayload;
exports.resolveVariables = resolveVariables;
/**
 * Monta o payload para envio de template message via Cloud API.
 * @param to              - Número do destinatário (E.164 sem +, ex: 5511999999999)
 * @param template        - Dados do template
 * @param variableValues  - Mapa de valores: {"nome": "João", "empresa": "ACME"}
 *                          Aceita também índice como chave: {"1": "João", "2": "ACME"}
 */
function buildTemplatePayload(to, template, variableValues = {}) {
    const components = [];
    // Header component
    if (template.headerType && template.headerContent) {
        const headerComponent = buildHeaderComponent(template.headerType, template.headerContent);
        if (headerComponent)
            components.push(headerComponent);
    }
    // Body component with variables
    if (template.variablesCount > 0) {
        const bodyParams = buildBodyParameters(template, variableValues);
        if (bodyParams.length > 0) {
            components.push({ type: 'body', parameters: bodyParams });
        }
    }
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
            name: template.name,
            language: { code: template.language },
            ...(components.length > 0 && { components }),
        },
    };
}
function buildHeaderComponent(headerType, headerContent) {
    switch (headerType.toUpperCase()) {
        case 'TEXT':
            return {
                type: 'header',
                parameters: [{ type: 'text', text: headerContent }],
            };
        case 'IMAGE':
            return {
                type: 'header',
                parameters: [{ type: 'image', image: { link: headerContent } }],
            };
        case 'VIDEO':
            return {
                type: 'header',
                parameters: [{ type: 'video', video: { link: headerContent } }],
            };
        case 'DOCUMENT':
            return {
                type: 'header',
                parameters: [{ type: 'document', document: { link: headerContent, filename: 'document' } }],
            };
        default:
            return null;
    }
}
function buildBodyParameters(template, values) {
    const params = [];
    for (let i = 1; i <= template.variablesCount; i++) {
        // Look up by index or by variable name
        const varDef = template.variables.find((v) => v.index === i);
        const value = values[varDef?.name ?? ''] ||
            values[String(i)] ||
            varDef?.example ||
            `{{${i}}}`;
        params.push({ type: 'text', text: value });
    }
    return params;
}
/**
 * Resolve variable values from contact data + campaign overrides.
 * Merges: contact.customVariables + provided overrides.
 */
function resolveVariables(contactCustomVariables, overrides = {}) {
    const resolved = {};
    for (const [k, v] of Object.entries(contactCustomVariables)) {
        resolved[k] = String(v);
    }
    for (const [k, v] of Object.entries(overrides)) {
        resolved[k] = v;
    }
    return resolved;
}
//# sourceMappingURL=message.builder.js.map