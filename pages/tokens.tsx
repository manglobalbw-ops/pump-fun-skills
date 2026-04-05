// pages/tokens.tsx
// Token discovery page — shows recent pump.fun launches with live pricing.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import styles from '../styles/Tokens.module.css';

interface PricedCoin {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  created_timestamp: number;
  usd_market_cap: number;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  real_sol_reserves: number;
  real_token_reserves: number;
  reply_count: number;
  last_trade_unix_time: number;
  complete: boolean;
  raydium_pool?: string;
  priceSol: number;
  marketCapSol: number;
  liquiditySol: number;
}

function fmtSol(v: number): string {
  if (v < 0.000001) return '<0.000001';
  if (v < 0.001) return v.toFixed(6);
  if (v < 1) return v.toFixed(4);
  return v.toFixed(2);
}

function fmtAge(unix: number): string {
  const secs = Math.floor(Date.now() / 1000) - unix;
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

const REFRESH_INTERVAL = 30_000;

export default function TokensPage() {
  const [coins, setCoins] = useState<PricedCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [minMcap, setMinMcap] = useState('');
  const [minLiq, setMinLiq] = useState('');
  const [hideGraduated, setHideGraduated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCoins = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens?limit=60');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setCoins(data.coins);
        setLastUpdated(new Date());
        setError('');
      } else {
        setError(data.error || 'Failed to fetch tokens');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoins();
    timerRef.current = setInterval(fetchCoins, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchCoins]);

  const filtered = coins.filter((c) => {
    if (hideGraduated && c.complete) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.symbol.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) return false;
    }
    if (minMcap && c.marketCapSol < Number(minMcap)) return false;
    if (minLiq && c.liquiditySol < Number(minLiq)) return false;
    return true;
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>← Back</Link>
          <h1 className={styles.title}>🔍 Token Discovery</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.updatedAt}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
          </span>
          <button className={styles.refreshBtn} onClick={fetchCoins} disabled={loading}>
            ↻ Refresh
          </button>
          <Link href="/trading-bot" className={styles.botLink}>🤖 Trading Bot</Link>
        </div>
      </header>

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search by name or symbol…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className={styles.filterInput}
          type="number"
          placeholder="Min MCap (SOL)"
          value={minMcap}
          onChange={(e) => setMinMcap(e.target.value)}
        />
        <input
          className={styles.filterInput}
          type="number"
          placeholder="Min Liquidity (SOL)"
          value={minLiq}
          onChange={(e) => setMinLiq(e.target.value)}
        />
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={hideGraduated}
            onChange={(e) => setHideGraduated(e.target.checked)}
          />
          Hide graduated
        </label>
        <span className={styles.countBadge}>{filtered.length} tokens</span>
      </div>

      {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

      {loading && coins.length === 0 ? (
        <div className={styles.loadingState}>Fetching recent pump.fun launches…</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((coin) => (
            <div key={coin.mint} className={`${styles.card} ${coin.complete ? styles.graduated : ''}`}>
              <div className={styles.cardHeader}>
                <div className={styles.tokenIcon}>
                  {coin.image_uri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coin.image_uri}
                      alt={coin.symbol}
                      className={styles.tokenImg}
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.setAttribute('aria-hidden', 'true');
                        img.style.display = 'none';
                        const fallback = img.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className={styles.tokenImgFallback}
                    aria-label={coin.symbol}
                    style={{ display: coin.image_uri ? 'none' : 'flex' }}
                  >
                    {coin.symbol.slice(0, 2)}
                  </div>
                </div>
                <div className={styles.tokenMeta}>
                  <div className={styles.tokenSymbol}>{coin.symbol}</div>
                  <div className={styles.tokenName}>{coin.name}</div>
                </div>
                {coin.complete && <span className={styles.graduatedBadge}>🎓 Graduated</span>}
              </div>

              <div className={styles.statsGrid}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Price</span>
                  <span className={styles.statValue}>{fmtSol(coin.priceSol)} SOL</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>MCap</span>
                  <span className={styles.statValue}>
                    {coin.usd_market_cap > 0 ? fmtUsd(coin.usd_market_cap) : `${coin.marketCapSol.toFixed(0)} SOL`}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Liquidity</span>
                  <span className={styles.statValue}>{fmtSol(coin.liquiditySol)} SOL</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Age</span>
                  <span className={styles.statValue}>{fmtAge(coin.created_timestamp / 1000)}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Replies</span>
                  <span className={styles.statValue}>{coin.reply_count}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Last Trade</span>
                  <span className={styles.statValue}>{fmtAge(coin.last_trade_unix_time)}</span>
                </div>
              </div>

              {coin.description && (
                <p className={styles.description}>{coin.description.slice(0, 100)}{coin.description.length > 100 ? '…' : ''}</p>
              )}

              <div className={styles.cardFooter}>
                <a
                  href={`https://pump.fun/${coin.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.pumpLink}
                >
                  View on pump.fun ↗
                </a>
                <span className={styles.mintLabel} title={coin.mint}>
                  {coin.mint.slice(0, 6)}…{coin.mint.slice(-4)}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className={styles.emptyState}>No tokens match the current filters.</div>
          )}
        </div>
      )}
    </div>
  );
}
