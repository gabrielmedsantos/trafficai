// ==============================
// TrafficAI — Alerts Service (Anomaly Detection)
// ==============================

import { alertsRepository } from './alerts.repository';
import { metaRepository } from '../meta/meta.repository';
import { logger } from '../shared/logger';

interface AnomalyThresholds {
    cpaSpike: number;      // % increase to trigger alert
    ctrDrop: number;       // % decrease to trigger alert
    cpmAnomaly: number;    // % change to trigger alert
    conversionDrop: number; // % decrease to trigger alert
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
    cpaSpike: 30,
    ctrDrop: 25,
    cpmAnomaly: 40,
    conversionDrop: 30,
};

export class AlertsService {
    private thresholds: AnomalyThresholds;

    constructor(thresholds: Partial<AnomalyThresholds> = {}) {
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    }

    /**
     * Check all campaigns for a user and generate alerts
     */
    async checkAllCampaigns(userId: string): Promise<void> {
        const campaigns = await metaRepository.getCampaignsByUser(userId);

        for (const campaign of campaigns) {
            try {
                await this.checkCampaign(userId, campaign.id, campaign.name);
            } catch (err: any) {
                logger.warn('Alert check failed for campaign', {
                    campaignId: campaign.id,
                    error: err.message,
                });
            }
        }
    }

    /**
     * Check a single campaign for anomalies
     */
    private async checkCampaign(userId: string, campaignId: string, campaignName: string): Promise<void> {
        const insights = await metaRepository.getInsightsByCampaign(campaignId, 7);
        if (insights.length < 2) return; // Not enough data

        const latest = insights[0];
        const previous = insights[1];

        // 1. CPA Spike Detection
        if (previous.cost_per_conversion > 0 && latest.cost_per_conversion > 0) {
            const cpaChange = ((latest.cost_per_conversion - previous.cost_per_conversion) / previous.cost_per_conversion) * 100;
            if (cpaChange > this.thresholds.cpaSpike) {
                await alertsRepository.create({
                    user_id: userId,
                    campaign_id: campaignId,
                    type: 'cpa_spike',
                    severity: cpaChange > 60 ? 'critical' : 'warning',
                    title: `CPA subindo rapidamente - ${campaignName}`,
                    message: `O custo por aquisição aumentou ${cpaChange.toFixed(1)}% (de R$${previous.cost_per_conversion} para R$${latest.cost_per_conversion}). Considere revisar público-alvo e criativos.`,
                    metric_name: 'cost_per_conversion',
                    previous_value: previous.cost_per_conversion,
                    current_value: latest.cost_per_conversion,
                });
            }
        }

        // 2. CTR Drop Detection
        if (previous.ctr > 0) {
            const ctrChange = ((Number(latest.ctr) - Number(previous.ctr)) / Number(previous.ctr)) * 100;
            if (ctrChange < -this.thresholds.ctrDrop) {
                await alertsRepository.create({
                    user_id: userId,
                    campaign_id: campaignId,
                    type: 'ctr_drop',
                    severity: ctrChange < -50 ? 'critical' : 'warning',
                    title: `CTR em queda - ${campaignName}`,
                    message: `A taxa de cliques caiu ${Math.abs(ctrChange).toFixed(1)}% (de ${previous.ctr}% para ${latest.ctr}%). Possível fadiga de criativo ou problema de segmentação.`,
                    metric_name: 'ctr',
                    previous_value: Number(previous.ctr),
                    current_value: Number(latest.ctr),
                });
            }
        }

        // 3. CPM Anomaly Detection
        if (previous.cpm > 0) {
            const cpmChange = ((Number(latest.cpm) - Number(previous.cpm)) / Number(previous.cpm)) * 100;
            if (Math.abs(cpmChange) > this.thresholds.cpmAnomaly) {
                await alertsRepository.create({
                    user_id: userId,
                    campaign_id: campaignId,
                    type: 'cpm_anomaly',
                    severity: Math.abs(cpmChange) > 70 ? 'critical' : 'warning',
                    title: `CPM anormal - ${campaignName}`,
                    message: `O CPM ${cpmChange > 0 ? 'aumentou' : 'diminuiu'} ${Math.abs(cpmChange).toFixed(1)}% (de R$${previous.cpm} para R$${latest.cpm}). Verifique concorrência no leilão e qualidade do anúncio.`,
                    metric_name: 'cpm',
                    previous_value: Number(previous.cpm),
                    current_value: Number(latest.cpm),
                });
            }
        }

        // 4. Conversion Drop Detection
        if (previous.conversions > 0) {
            const convChange = ((latest.conversions - previous.conversions) / previous.conversions) * 100;
            if (convChange < -this.thresholds.conversionDrop) {
                await alertsRepository.create({
                    user_id: userId,
                    campaign_id: campaignId,
                    type: 'conversion_drop',
                    severity: convChange < -60 ? 'critical' : 'warning',
                    title: `Queda de conversões - ${campaignName}`,
                    message: `As conversões caíram ${Math.abs(convChange).toFixed(1)}% (de ${previous.conversions} para ${latest.conversions}). Verifique página de destino e pixel de conversão.`,
                    metric_name: 'conversions',
                    previous_value: previous.conversions,
                    current_value: latest.conversions,
                });
            }
        }

        // 5. High Frequency Alert
        if (Number(latest.frequency) > 3) {
            await alertsRepository.create({
                user_id: userId,
                campaign_id: campaignId,
                type: 'high_frequency',
                severity: Number(latest.frequency) > 5 ? 'critical' : 'info',
                title: `Frequência alta - ${campaignName}`,
                message: `A frequência está em ${latest.frequency}. Seu público pode estar saturado. Considere ampliar o público ou renovar criativos.`,
                metric_name: 'frequency',
                current_value: Number(latest.frequency),
            });
        }
    }
}

export const alertsService = new AlertsService();
