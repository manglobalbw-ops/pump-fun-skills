// lib/botState.ts
// Module-level singleton that persists between API requests (in development/single-process deployments).

export interface BotConfig {
  walletAddress: string;
  buyAmountSol: number;      // SOL to spend per trade (e.g. 0.05)
  takeProfitPercent: number; // e.g. 50 means sell at +50%
  stopLossPercent: number;   // e.g. 20 means sell at -20%
  maxPositions: number;      // maximum concurrent open positions
  minMarketCapSol: number;   // minimum market cap in SOL to consider buying
  maxMarketCapSol: number;   // maximum market cap in SOL to consider buying
  minLiquiditySol: number;   // minimum liquidity in SOL
}

export interface Position {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  buyPriceSol: number;    // SOL price per token at buy time
  buyAmountSol: number;   // total SOL spent
  tokenAmount: number;    // tokens received (estimated)
  buyTime: number;        // Unix timestamp
  buySignature?: string;  // on-chain transaction signature
  currentPriceSol?: number;
  status: 'open' | 'closed';
  closePriceSol?: number;
  closeTime?: number;
  closeSignature?: string;
  pnlSol?: number;        // realized P&L in SOL
  pnlPercent?: number;
}

export interface TradeSignal {
  id: string;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  priceSol: number;
  marketCapSol: number;
  liquiditySol: number;
  reason: string;
  createdAt: number;
  expiresAt: number;
  positionId?: string; // set for sell signals
}

export interface BotState {
  config: BotConfig;
  isRunning: boolean;
  positions: Position[];
  signals: TradeSignal[];
  lastScanAt: number | null;
  seenMints: Set<string>;
  intervalId: ReturnType<typeof setInterval> | null;
}

const defaultConfig: BotConfig = {
  walletAddress: '',
  buyAmountSol: 0.05,
  takeProfitPercent: 50,
  stopLossPercent: 20,
  maxPositions: 5,
  minMarketCapSol: 30,
  maxMarketCapSol: 300,
  minLiquiditySol: 10,
};

// Global singleton — shared across all API route calls in the same process.
const botState: BotState = {
  config: { ...defaultConfig },
  isRunning: false,
  positions: [],
  signals: [],
  lastScanAt: null,
  seenMints: new Set(),
  intervalId: null,
};

export function getBotState(): BotState {
  return botState;
}

export function updateConfig(partial: Partial<BotConfig>): void {
  Object.assign(botState.config, partial);
}

export function addPosition(pos: Position): void {
  botState.positions.push(pos);
}

export function updatePosition(id: string, update: Partial<Position>): void {
  const pos = botState.positions.find((p) => p.id === id);
  if (pos) Object.assign(pos, update);
}

export function addSignal(signal: TradeSignal): void {
  // Limit to 50 most recent signals
  botState.signals.unshift(signal);
  if (botState.signals.length > 50) {
    botState.signals.length = 50;
  }
}

export function removeSignal(id: string): void {
  const idx = botState.signals.findIndex((s) => s.id === id);
  if (idx !== -1) botState.signals.splice(idx, 1);
}

export function getOpenPositions(): Position[] {
  return botState.positions.filter((p) => p.status === 'open');
}

export function getClosedPositions(): Position[] {
  return botState.positions.filter((p) => p.status === 'closed');
}

export function totalPnlSol(): number {
  return getClosedPositions().reduce((sum, p) => sum + (p.pnlSol ?? 0), 0);
}
