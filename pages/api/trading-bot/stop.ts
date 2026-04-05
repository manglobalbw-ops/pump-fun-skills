// pages/api/trading-bot/stop.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getBotState } from '../../../lib/botState';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const state = getBotState();

  if (!state.isRunning) {
    return res.status(200).json({ ok: true, message: 'Bot is already stopped' });
  }

  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  state.isRunning = false;

  return res.status(200).json({ ok: true, message: 'Bot stopped' });
}
