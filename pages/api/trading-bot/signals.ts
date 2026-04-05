// pages/api/trading-bot/signals.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getBotState, removeSignal } from '../../../lib/botState';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = getBotState();
  const now = Math.floor(Date.now() / 1000);

  if (req.method === 'GET') {
    // Return only non-expired signals
    const active = state.signals.filter((s) => s.expiresAt > now);
    return res.status(200).json({ ok: true, signals: active });
  }

  if (req.method === 'DELETE') {
    // Dismiss a signal by id
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'Missing signal id' });
    removeSignal(String(id));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
