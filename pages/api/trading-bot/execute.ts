// pages/api/trading-bot/execute.ts
// Called by the frontend after the user signs and sends a trade transaction on-chain.
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getBotState,
  addPosition,
  updatePosition,
  removeSignal,
  Position,
} from '../../../lib/botState';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { type, signalId, signature } = req.body || {};

  if (!type || !signalId || !signature) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: type, signalId, signature' });
  }

  const state = getBotState();
  const signal = state.signals.find((s) => s.id === signalId);

  if (!signal) {
    return res.status(404).json({ ok: false, error: 'Signal not found or already expired' });
  }

  const now = Math.floor(Date.now() / 1000);

  if (type === 'buy' && signal.type === 'buy') {
    const { config } = state;
    const tokenAmount =
      signal.priceSol > 0 ? config.buyAmountSol / signal.priceSol : 0;

    const position: Position = {
      id: generateId(),
      tokenMint: signal.tokenMint,
      tokenSymbol: signal.tokenSymbol,
      tokenName: signal.tokenName,
      buyPriceSol: signal.priceSol,
      buyAmountSol: config.buyAmountSol,
      tokenAmount,
      buyTime: now,
      buySignature: String(signature),
      currentPriceSol: signal.priceSol,
      status: 'open',
    };

    addPosition(position);
    removeSignal(signalId);

    return res.status(200).json({ ok: true, position });
  }

  if (type === 'sell' && signal.type === 'sell' && signal.positionId) {
    const pos = state.positions.find((p) => p.id === signal.positionId);
    if (!pos) {
      return res.status(404).json({ ok: false, error: 'Position not found' });
    }

    const closePriceSol = signal.priceSol;
    const pnlSol = (closePriceSol - pos.buyPriceSol) * pos.tokenAmount;
    const pnlPercent =
      pos.buyPriceSol > 0
        ? ((closePriceSol - pos.buyPriceSol) / pos.buyPriceSol) * 100
        : 0;

    updatePosition(pos.id, {
      status: 'closed',
      closePriceSol,
      closeTime: now,
      closeSignature: String(signature),
      currentPriceSol: closePriceSol,
      pnlSol,
      pnlPercent,
    });

    removeSignal(signalId);

    const updated = state.positions.find((p) => p.id === pos.id);
    return res.status(200).json({ ok: true, position: updated });
  }

  return res.status(400).json({ ok: false, error: 'Invalid type or signal mismatch' });
}
