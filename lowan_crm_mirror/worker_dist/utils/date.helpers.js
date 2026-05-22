"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWithinSendWindow = isWithinSendWindow;
exports.msUntilWindowOpen = msUntilWindowOpen;
exports.randomBetween = randomBetween;
const date_fns_tz_1 = require("date-fns-tz");
const date_fns_1 = require("date-fns");
/**
 * Verifica se o momento atual está dentro da janela de envio configurada.
 */
function isWithinSendWindow(windowStart, // "08:00"
windowEnd, // "20:00"
timezone) {
    if (!windowStart || !windowEnd)
        return true; // sem janela = sempre permitido
    const now = (0, date_fns_tz_1.toZonedTime)(new Date(), timezone);
    const currentTime = (0, date_fns_1.format)(now, 'HH:mm');
    return currentTime >= windowStart && currentTime <= windowEnd;
}
/**
 * Retorna milliseconds até o início da próxima janela de envio.
 * Usado para delay de jobs fora da janela.
 */
function msUntilWindowOpen(windowStart, timezone) {
    const now = (0, date_fns_tz_1.toZonedTime)(new Date(), timezone);
    const [hours, minutes] = windowStart.split(':').map(Number);
    const windowOpenToday = (0, date_fns_tz_1.toZonedTime)(new Date(), timezone);
    windowOpenToday.setHours(hours, minutes, 0, 0);
    if (now < windowOpenToday) {
        return windowOpenToday.getTime() - now.getTime();
    }
    // Janela de amanhã
    windowOpenToday.setDate(windowOpenToday.getDate() + 1);
    return windowOpenToday.getTime() - now.getTime();
}
function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
//# sourceMappingURL=date.helpers.js.map