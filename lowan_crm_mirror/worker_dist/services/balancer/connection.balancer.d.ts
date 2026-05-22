import { ConnectionStatus } from '@prisma/client';
export interface ConnectionCandidate {
    id: string;
    priority: number;
    healthScore: number;
    status: ConnectionStatus;
    rateLimitPerMinute: number;
    rateLimitPerDay: number;
    sentThisMinute: number;
    sentToday: number;
    queuePending: number;
    pausedUntil: Date | null;
}
export interface BalancerResult {
    connectionId: string | null;
    reason?: string;
}
export declare class ConnectionBalancer {
    /**
     * Selects the best available connection for sending a message.
     * Returns null if no connections are available.
     */
    selectConnection(allowedConnectionIds?: string[]): Promise<BalancerResult>;
    private isEligible;
    private calculateScore;
    private selectBestCandidate;
    private reserveSlot;
    /** Call after a message job completes (success or permanent failure) */
    releaseSlot(connectionId: string): Promise<void>;
}
//# sourceMappingURL=connection.balancer.d.ts.map