// pages/api/trading-bot/status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getBotState,
  getOpenPositions,
  getClosedPositions,
  totalPnlSol,
} from '../../../lib/botState';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const state = getBotState();
  const open = getOpenPositions();
  const closed = getClosedPositions();

  return res.status(200).json({
    ok: true,
    isRunning: state.isRunning,
    lastScanAt: state.lastScanAt,
    openPositionCount: open.length,
    closedPositionCount: closed.length,
    pendingSignalCount: state.signals.filter((s) => s.expiresAt > Date.now() / 1000).length,
    totalPnlSol: totalPnlSol(),
    positions: state.positions,
    signals: state.signals,
  });
}
