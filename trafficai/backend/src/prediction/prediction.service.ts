// ==============================
// TrafficAI — Prediction Service
// ==============================

import { metaRepository, InsightRecord } from '../meta/meta.repository';
import { logger } from '../shared/logger';
import { AppError } from '../shared/errors';

interface PredictionResult {
    campaign_id: string;
    campaign_name: string;
    period: string;
    predictions: {
        estimated_leads: { value: number; trend: 'up' | 'down' | 'stable'; confidence: number };
        estimated_cpa: { value: number; trend: 'up' | 'down' | 'stable'; confidence: number };
        estimated_roas: { value: number; trend: 'up' | 'down' | 'stable'; confidence: number };
        estimated_spend: { value: number; trend: 'up' | 'down' | 'stable'; confidence: number };
        estimated_ctr: { value: number; trend: 'up' | 'down' | 'stable'; confidence: number };
    };
    data_points: number;
    generated_at: string;
}

export class PredictionService {
    /**
     * Generate predictions for a campaign based on historical data
     */
    async predictCampaign(campaignId: string): Promise<PredictionResult> {
        const campaign = await metaRepository.getCampaignById(campaignId);
        if (!campaign) {
            throw new AppError('Campaign not found', 404);
        }

        const insights = await metaRepository.getInsightsByCampaign(campaignId, 30);
        if (insights.length < 3) {
            throw new AppError('Insufficient data for prediction. At least 3 days of data required.', 400);
        }

        // Reverse to chronological order
        const sortedInsights = [...insights].reverse();

        const predictions: PredictionResult = {
            campaign_id: campaignId,
            campaign_name: campaign.name,
            period: 'next_7_days',
            predictions: {
                estimated_leads: this.predictMetric(sortedInsights, 'conversions'),
                estimated_cpa: this.predictMetric(sortedInsights, 'cost_per_conversion'),
                estimated_roas: this.predictMetric(sortedInsights, 'roas'),
                estimated_spend: this.predictMetric(sortedInsights, 'spend'),
                estimated_ctr: this.predictMetric(sortedInsights, 'ctr'),
            },
            data_points: sortedInsights.length,
            generated_at: new Date().toISOString(),
        };

        logger.info('Prediction generated', { campaignId, dataPoints: sortedInsights.length });
        return predictions;
    }

    /**
     * Simple linear regression prediction for a given metric
     */
    private predictMetric(
        insights: InsightRecord[],
        metricKey: keyof InsightRecord
    ): { value: number; trend: 'up' | 'down' | 'stable'; confidence: number } {
        const values = insights.map(i => Number(i[metricKey]) || 0);
        const n = values.length;

        if (n === 0) {
            return { value: 0, trend: 'stable', confidence: 0 };
        }

        // Calculate linear regression: y = mx + b
        const xValues = values.map((_, i) => i);
        const sumX = xValues.reduce((s, x) => s + x, 0);
        const sumY = values.reduce((s, y) => s + y, 0);
        const sumXY = xValues.reduce((s, x, i) => s + x * values[i], 0);
        const sumX2 = xValues.reduce((s, x) => s + x * x, 0);

        const denominator = n * sumX2 - sumX * sumX;
        let slope = 0;
        let intercept = sumY / n;

        if (denominator !== 0) {
            slope = (n * sumXY - sumX * sumY) / denominator;
            intercept = (sumY - slope * sumX) / n;
        }

        // Predict 7 days ahead (average of next 7 days)
        let predicted = 0;
        for (let day = n; day < n + 7; day++) {
            predicted += slope * day + intercept;
        }
        predicted = predicted / 7;

        // Ensure non-negative for most metrics
        if (metricKey !== 'roas') {
            predicted = Math.max(0, predicted);
        }

        // Determine trend
        const recentAvg = values.slice(-3).reduce((s, v) => s + v, 0) / 3;
        const oldAvg = values.slice(0, Math.min(3, n)).reduce((s, v) => s + v, 0) / Math.min(3, n);
        const changePercent = oldAvg !== 0 ? ((recentAvg - oldAvg) / oldAvg) * 100 : 0;

        let trend: 'up' | 'down' | 'stable';
        if (changePercent > 5) trend = 'up';
        else if (changePercent < -5) trend = 'down';
        else trend = 'stable';

        // R-squared for confidence
        const meanY = sumY / n;
        const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
        const ssRes = values.reduce((s, y, i) => {
            const yPred = slope * i + intercept;
            return s + (y - yPred) ** 2;
        }, 0);
        const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
        const confidence = Math.round(Math.max(0, Math.min(100, rSquared * 100)));

        return {
            value: Math.round(predicted * 100) / 100,
            trend,
            confidence,
        };
    }
}

export const predictionService = new PredictionService();
