"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleKanbanRules = scheduleKanbanRules;
const logger_1 = require("../../config/logger");
const kanban_service_1 = require("../../modules/kanban/kanban.service");
const RULES_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
function scheduleKanbanRules() {
    const run = async () => {
        try {
            await kanban_service_1.KanbanService.runAllWorkspaces();
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Kanban rules scheduler error');
        }
    };
    // Run immediately, then every 30 min
    run();
    setInterval(run, RULES_INTERVAL_MS);
    logger_1.logger.info({ intervalMs: RULES_INTERVAL_MS }, 'Kanban rules scheduler started');
}
//# sourceMappingURL=kanban.worker.js.map