/**
 * Verifica se o momento atual está dentro da janela de envio configurada.
 */
export declare function isWithinSendWindow(windowStart: string | null, // "08:00"
windowEnd: string | null, // "20:00"
timezone: string): boolean;
/**
 * Retorna milliseconds até o início da próxima janela de envio.
 * Usado para delay de jobs fora da janela.
 */
export declare function msUntilWindowOpen(windowStart: string, timezone: string): number;
export declare function randomBetween(min: number, max: number): number;
//# sourceMappingURL=date.helpers.d.ts.map