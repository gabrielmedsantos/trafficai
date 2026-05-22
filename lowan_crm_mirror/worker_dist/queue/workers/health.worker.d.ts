import { Worker } from 'bullmq';
import type { HealthCheckJobData } from '../../types/queue.types';
export declare function createHealthWorker(): Worker<HealthCheckJobData>;
/**
 * Agenda reset diário do contador messagesSentToday à meia-noite.
 */
export declare function scheduleDailyReset(): void;
/**
 * Agenda health checks periódicos para todas as conexões ativas.
 * Chamado uma vez na inicialização dos workers.
 */
export declare function scheduleHealthChecks(): Promise<void>;
//# sourceMappingURL=health.worker.d.ts.map