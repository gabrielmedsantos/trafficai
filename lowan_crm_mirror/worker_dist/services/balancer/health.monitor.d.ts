export declare class HealthMonitor {
    /**
     * Incrementa o contador de erros de um tipo específico.
     * Retorna se o número deve ser pausado automaticamente.
     */
    recordError(connectionId: string, errorType: 'AUTH' | 'RATE_LIMIT' | 'TEMPORARY' | 'PERMANENT' | 'TEMPLATE' | 'INVALID_NUMBER'): Promise<{
        shouldPause: boolean;
        pauseSeconds: number;
    }>;
    /**
     * Pausa automaticamente um número e registra no banco + Redis.
     */
    autoPauseConnection(connectionId: string, reason: string, pauseSeconds: number): Promise<void>;
    /**
     * Tenta reativar conexões com pausedUntil expirado.
     * Chamado periodicamente pelo HealthWorker.
     */
    tryAutoRecovery(): Promise<void>;
    recoverConnection(connectionId: string): Promise<void>;
    updateHealthScore(connectionId: string, score: number): Promise<void>;
    logHealthSnapshot(connectionId: string): Promise<void>;
    private degradeHealthScore;
    private boostHealthScore;
    resetErrorCounters(connectionId: string): Promise<void>;
}
export declare const healthMonitor: HealthMonitor;
//# sourceMappingURL=health.monitor.d.ts.map