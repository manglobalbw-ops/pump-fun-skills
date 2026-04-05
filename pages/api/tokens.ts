// pages/api/tokens.ts
// Returns recent pump.fun token launches with derived pricing.
import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchRecentCoins, derivePricing, PricedCoin } from '../../lib/pumpfunApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const limit = Math.min(Number(req.query.limit) || 40, 100);

  try {
    const coins = await fetchRecentCoins(limit);
    const priced: PricedCoin[] = coins.map(derivePricing);
    return res.status(200).json({ ok: true, coins: priced, count: priced.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ ok: false, error: msg });
  }
}
