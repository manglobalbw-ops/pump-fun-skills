// lib/pumpfunApi.ts
// Lightweight client for the pump.fun public API and Jupiter price quotes.

const PUMPFUN_API = 'https://frontend-api.pump.fun';
const JUPITER_PRICE_API = 'https://price.jup.ag/v4/price';

export interface PumpCoin {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  created_timestamp: number;
  usd_market_cap: number;
  virtual_sol_reserves: number; // SOL in the bonding curve
  virtual_token_reserves: number;
  real_sol_reserves: number;
  real_token_reserves: number;
  reply_count: number;
  last_trade_unix_time: number;
  complete: boolean; // true = graduated to Raydium
  raydium_pool?: string;
}

export interface PricedCoin extends PumpCoin {
  priceSol: number;      // current SOL price per token
  marketCapSol: number;  // market cap in SOL
  liquiditySol: number;  // liquidity in SOL
}

/** Fetch the most recently-traded tokens from pump.fun. */
export async function fetchRecentCoins(limit = 20): Promise<PumpCoin[]> {
  const url = `${PUMPFUN_API}/coins?offset=0&limit=${limit}&sort=last_trade_unix_time&order=DESC&includeNsfw=false`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`pump.fun API error: ${res.status}`);
  return res.json();
}

/** Fetch a single coin's on-chain data from pump.fun. */
export async function fetchCoin(mint: string): Promise<PumpCoin | null> {
  try {
    const res = await fetch(`${PUMPFUN_API}/coins/${mint}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Derive SOL price, market cap, and liquidity from bonding-curve reserves. */
export function derivePricing(coin: PumpCoin): PricedCoin {
  const solReserves = coin.virtual_sol_reserves / 1e9;      // lamports → SOL
  const tokenReserves = coin.virtual_token_reserves / 1e6;  // 6 decimals

  // Constant-product AMM price
  const priceSol = tokenReserves > 0 ? solReserves / tokenReserves : 0;

  // Total supply (1 billion tokens for pump.fun)
  const totalSupply = 1_000_000_000;
  const marketCapSol = priceSol * totalSupply;

  const liquiditySol = coin.real_sol_reserves / 1e9;

  return { ...coin, priceSol, marketCapSol, liquiditySol };
}

/** Fetch SOL price in USD from Jupiter. Returns null on failure. */
export async function fetchSolPriceUsd(): Promise<number | null> {
  try {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const res = await fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[SOL_MINT]?.price ?? null;
  } catch {
    return null;
  }
}
