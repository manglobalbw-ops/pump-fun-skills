// pages/api/trading-bot/start.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getBotState, addSignal, TradeSignal } from '../../../lib/botState';
import {
  fetchRecentCoins,
  derivePricing,
  PricedCoin,
} from '../../../lib/pumpfunApi';

const SCAN_INTERVAL_MS = 15_000; // scan every 15 seconds
const SECONDS_PER_HOUR = 3_600;
const MAX_TOKEN_AGE_SECONDS = 6 * SECONDS_PER_HOUR;
const MAX_IDLE_TRADE_SECONDS = 600; // 10 minutes without a trade

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Evaluate whether a coin meets the buy criteria and emit a BUY signal.
 */
function evaluateBuySignal(coin: PricedCoin): TradeSignal | null {
  const state = getBotState();
  const { config } = state;

  // Already seen this mint
  if (state.seenMints.has(coin.mint)) return null;

  // Skip graduated tokens (moved to Raydium)
  if (coin.complete) return null;

  // Market cap filter
  if (coin.marketCapSol < config.minMarketCapSol) return null;
  if (coin.marketCapSol > config.maxMarketCapSol) return null;

  // Liquidity filter
  if (coin.liquiditySol < config.minLiquiditySol) return null;

  // Max positions guard
  const openCount = state.positions.filter((p) => p.status === 'open').length;
  if (openCount >= config.maxPositions) return null;

  // Skip tokens older than 6 hours — prefer fresh launches
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - Math.floor(coin.created_timestamp / 1000);
  if (ageSeconds > MAX_TOKEN_AGE_SECONDS) return null;

  // Require at least some trading activity in the last 10 minutes
  if (now - coin.last_trade_unix_time > MAX_IDLE_TRADE_SECONDS) return null;

  const reasonParts: string[] = [
    `MCap ${coin.marketCapSol.toFixed(1)} SOL`,
    `liq ${coin.liquiditySol.toFixed(2)} SOL`,
  ];
  if (ageSeconds < 3600) {
    reasonParts.push(`age ${Math.floor(ageSeconds / 60)}m`);
  }
  if (coin.reply_count > 0) {
    reasonParts.push(`${coin.reply_count} replies`);
  }

  return {
    id: generateId(),
    type: 'buy',
    tokenMint: coin.mint,
    tokenSymbol: coin.symbol,
    tokenName: coin.name,
    priceSol: coin.priceSol,
    marketCapSol: coin.marketCapSol,
    liquiditySol: coin.liquiditySol,
    reason: reasonParts.join(' · '),
    createdAt: now,
    expiresAt: now + 120, // signal valid for 2 minutes
  };
}

/**
 * Check open positions against current prices and emit SELL signals.
 */
async function evaluateSellSignals(coins: PricedCoin[]): Promise<void> {
  const state = getBotState();
  const { config } = state;
  const now = Math.floor(Date.now() / 1000);

  const coinMap = new Map<string, PricedCoin>(coins.map((c) => [c.mint, c]));

  for (const pos of state.positions) {
    if (pos.status !== 'open') continue;

    // Look up current price
    const coin = coinMap.get(pos.tokenMint);
    if (!coin) continue;

    const currentPriceSol = coin.priceSol;
    const pnlPercent =
      pos.buyPriceSol > 0
        ? ((currentPriceSol - pos.buyPriceSol) / pos.buyPriceSol) * 100
        : 0;

    // Update current price on position
    pos.currentPriceSol = currentPriceSol;

    // Check for already-queued sell signal
    const hasPendingSell = state.signals.some(
      (s) => s.type === 'sell' && s.positionId === pos.id && s.expiresAt > now
    );
    if (hasPendingSell) continue;

    let reason = '';
    if (pnlPercent >= config.takeProfitPercent) {
      reason = `Take-profit triggered at +${pnlPercent.toFixed(1)}%`;
    } else if (pnlPercent <= -config.stopLossPercent) {
      reason = `Stop-loss triggered at ${pnlPercent.toFixed(1)}%`;
    }

    if (reason) {
      addSignal({
        id: generateId(),
        type: 'sell',
        tokenMint: pos.tokenMint,
        tokenSymbol: pos.tokenSymbol,
        tokenName: pos.tokenName,
        priceSol: currentPriceSol,
        marketCapSol: coin.marketCapSol,
        liquiditySol: coin.liquiditySol,
        reason,
        createdAt: now,
        expiresAt: now + 120,
        positionId: pos.id,
      });
    }
  }
}

async function runScan(): Promise<void> {
  const state = getBotState();
  if (!state.isRunning) return;

  try {
    const coins = await fetchRecentCoins(50);
    const priced = coins.map(derivePricing);

    // Check sell conditions for existing positions
    await evaluateSellSignals(priced);

    // Check buy conditions for new coins
    for (const coin of priced) {
      const signal = evaluateBuySignal(coin);
      if (signal) {
        addSignal(signal);
        state.seenMints.add(coin.mint); // prevent duplicate buy signals for same mint
      }
    }

    state.lastScanAt = Math.floor(Date.now() / 1000);
  } catch (err) {
    // Log scan errors but don't crash the interval
    console.error('[TradingBot] Scan error:', err);
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const state = getBotState();

  if (!state.config.walletAddress) {
    return res.status(400).json({
      ok: false,
      error: 'Wallet address is required. Configure the bot first.',
    });
  }

  if (state.isRunning) {
    return res.status(200).json({ ok: true, message: 'Bot is already running' });
  }

  state.isRunning = true;

  // Run immediately, then on interval
  runScan().catch(console.error);
  state.intervalId = setInterval(() => {
    runScan().catch(console.error);
  }, SCAN_INTERVAL_MS);

  return res.status(200).json({ ok: true, message: 'Bot started' });
}
