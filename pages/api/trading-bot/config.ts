// pages/api/trading-bot/config.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getBotState, updateConfig, BotConfig } from '../../../lib/botState';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = getBotState();

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, config: state.config });
  }

  if (req.method === 'POST') {
    const body: Partial<BotConfig> = req.body || {};

    // Validate numeric fields
    const numericFields: (keyof BotConfig)[] = [
      'buyAmountSol',
      'takeProfitPercent',
      'stopLossPercent',
      'maxPositions',
      'minMarketCapSol',
      'maxMarketCapSol',
      'minLiquiditySol',
    ];

    for (const field of numericFields) {
      if (field in body) {
        const v = Number(body[field]);
        if (isNaN(v) || v < 0) {
          return res.status(400).json({ ok: false, error: `Invalid value for ${field}` });
        }
        (body as Record<string, unknown>)[field] = v;
      }
    }

    if ('maxPositions' in body) {
      const v = Number(body.maxPositions);
      if (!Number.isInteger(v) || v < 1 || v > 20) {
        return res.status(400).json({ ok: false, error: 'maxPositions must be an integer between 1 and 20' });
      }
    }

    if ('takeProfitPercent' in body && Number(body.takeProfitPercent) <= 0) {
      return res.status(400).json({ ok: false, error: 'takeProfitPercent must be > 0' });
    }

    if ('stopLossPercent' in body && Number(body.stopLossPercent) <= 0) {
      return res.status(400).json({ ok: false, error: 'stopLossPercent must be > 0' });
    }

    updateConfig(body);
    return res.status(200).json({ ok: true, config: getBotState().config });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
