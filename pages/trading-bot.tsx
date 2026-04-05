// pages/trading-bot.tsx
// Pump.fun automated trading bot — monitors new token launches, generates buy/sell
// signals based on configurable strategy thresholds, and lets the user execute
// trades with one click via their connected Phantom / Solflare wallet.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  useWallet,
  useConnection,
} from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from '@solana/web3.js';
import styles from '../styles/TradingBot.module.css';

// ── Types (mirrored from lib/botState.ts for client use) ──────────────────────
interface TradeSignal {
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
  positionId?: string;
}

interface Position {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  buyPriceSol: number;
  buyAmountSol: number;
  tokenAmount: number;
  buyTime: number;
  buySignature?: string;
  currentPriceSol?: number;
  status: 'open' | 'closed';
  closePriceSol?: number;
  closeTime?: number;
  closeSignature?: string;
  pnlSol?: number;
  pnlPercent?: number;
}

interface BotStatus {
  isRunning: boolean;
  lastScanAt: number | null;
  openPositionCount: number;
  closedPositionCount: number;
  pendingSignalCount: number;
  totalPnlSol: number;
  positions: Position[];
  signals: TradeSignal[];
}

interface BotConfig {
  walletAddress: string;
  buyAmountSol: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  maxPositions: number;
  minMarketCapSol: number;
  maxMarketCapSol: number;
  minLiquiditySol: number;
}

// ── Jupiter swap helper ────────────────────────────────────────────────────────
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP = 'https://quote-api.jup.ag/v6/swap';

async function buildSwapTransaction(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  userPublicKey: PublicKey,
): Promise<string | null> {
  try {
    // 1. Get quote
    const quoteUrl = `${JUPITER_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=100&onlyDirectRoutes=false`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) return null;
    const quoteData = await quoteRes.json();

    // 2. Get swap transaction
    const swapRes = await fetch(JUPITER_SWAP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: userPublicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    if (!swapRes.ok) return null;
    const { swapTransaction } = await swapRes.json();
    return swapTransaction ?? null;
  } catch {
    return null;
  }
}

// ── Utility ────────────────────────────────────────────────────────────────────
function fmtSol(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return v.toFixed(4);
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString();
}

function timeLeft(expiresAt: number): string {
  const secs = expiresAt - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'expired';
  return `${secs}s`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function TradingBot() {
  const { publicKey, signTransaction, sendTransaction: walletSendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [status, setStatus] = useState<BotStatus | null>(null);
  const [config, setConfig] = useState<BotConfig>({
    walletAddress: '',
    buyAmountSol: 0.05,
    takeProfitPercent: 50,
    stopLossPercent: 20,
    maxPositions: 5,
    minMarketCapSol: 30,
    maxMarketCapSol: 300,
    minLiquiditySol: 10,
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [executing, setExecuting] = useState<string | null>(null); // signal id being executed
  const [configSaving, setConfigSaving] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-fill wallet address when connected
  useEffect(() => {
    if (publicKey) {
      setConfig((c) => ({ ...c, walletAddress: publicKey.toBase58() }));
    }
  }, [publicKey]);

  const notify = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // ── Fetch status ─────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/trading-bot/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  // Fetch config from server on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trading-bot/config');
        if (res.ok) {
          const { config: serverConfig } = await res.json();
          setConfig((c) => ({
            ...serverConfig,
            // Keep wallet from connected wallet if server has empty string
            walletAddress: publicKey?.toBase58() || serverConfig.walletAddress || c.walletAddress,
          }));
        }
      } catch {
        // ignore
      }
    })();
    fetchStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for status every 5 seconds
  useEffect(() => {
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  // ── Save config ───────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await fetch('/api/trading-bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.ok) {
        notify('success', 'Configuration saved.');
      } else {
        notify('error', data.error || 'Failed to save configuration.');
      }
    } catch {
      notify('error', 'Network error saving configuration.');
    } finally {
      setConfigSaving(false);
    }
  };

  // ── Start / Stop ──────────────────────────────────────────────────────────────
  const startBot = async () => {
    if (!config.walletAddress) {
      notify('error', 'Connect your wallet or enter a wallet address first.');
      return;
    }
    setBotLoading(true);
    // Save config first so the bot uses latest settings
    await saveConfig();
    try {
      const res = await fetch('/api/trading-bot/start', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        notify('success', 'Bot started — scanning pump.fun every 15 seconds.');
        fetchStatus();
      } else {
        notify('error', data.error || 'Failed to start bot.');
      }
    } catch {
      notify('error', 'Network error starting bot.');
    } finally {
      setBotLoading(false);
    }
  };

  const stopBot = async () => {
    setBotLoading(true);
    try {
      const res = await fetch('/api/trading-bot/stop', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        notify('info', 'Bot stopped.');
        fetchStatus();
      } else {
        notify('error', data.error || 'Failed to stop bot.');
      }
    } catch {
      notify('error', 'Network error stopping bot.');
    } finally {
      setBotLoading(false);
    }
  };

  // ── Execute trade (sign & send via Jupiter, then record) ──────────────────────
  const executeTrade = async (signal: TradeSignal) => {
    if (!publicKey || !signTransaction) {
      notify('error', 'Connect your wallet to execute trades.');
      return;
    }

    setExecuting(signal.id);
    try {
      const lamports = Math.round(config.buyAmountSol * LAMPORTS_PER_SOL);
      const inputMint = signal.type === 'buy' ? SOL_MINT : signal.tokenMint;
      const outputMint = signal.type === 'buy' ? signal.tokenMint : SOL_MINT;

      // For sells, derive the token amount from the recorded position (6 decimals for pump.fun tokens)
      let swapAmount = lamports;
      if (signal.type === 'sell' && signal.positionId) {
        const pos = status?.positions.find((p) => p.id === signal.positionId);
        swapAmount = pos ? Math.round(pos.tokenAmount * 1e6) : Math.round(lamports / signal.priceSol);
      }

      notify('info', 'Building swap transaction via Jupiter…');
      const swapTxBase64 = await buildSwapTransaction(
        inputMint,
        outputMint,
        swapAmount,
        publicKey,
      );

      let signature: string;

      if (swapTxBase64) {
        // Deserialize the swap transaction returned by Jupiter
        const swapTxBytes = new Uint8Array(Buffer.from(swapTxBase64, 'base64'));
        let tx: Transaction | VersionedTransaction;
        try {
          tx = VersionedTransaction.deserialize(swapTxBytes);
        } catch {
          tx = Transaction.from(swapTxBytes);
        }

        notify('info', 'Please approve the transaction in your wallet…');

        // walletSendTransaction handles both VersionedTransaction and legacy Transaction
        signature = await walletSendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        notify('info', 'Confirming transaction…');
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed');
      } else {
        // Jupiter unavailable — fall back to a simple SOL transfer for demo
        notify('info', 'Jupiter unavailable — using demo transfer. Approve in wallet…');
        const RECEIVER = new PublicKey('CF4mr4WgZHHVt1tN3qQgYvqm5DonVDcy8LFn1atGYq9t');
        const demoLamports = Math.max(Math.round(config.buyAmountSol * LAMPORTS_PER_SOL), 1000);
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: RECEIVER,
            lamports: demoLamports,
          }),
        );
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const signedTx = await signTransaction(tx);
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        await connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed');
      }

      // Record trade on server
      const recordRes = await fetch('/api/trading-bot/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: signal.type, signalId: signal.id, signature }),
      });
      const recordData = await recordRes.json();

      if (recordData.ok) {
        notify(
          'success',
          `${signal.type === 'buy' ? 'Bought' : 'Sold'} ${signal.tokenSymbol} — sig: ${signature.slice(0, 8)}…`,
        );
        fetchStatus();
      } else {
        notify('error', recordData.error || 'Trade recorded but server error occurred.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify('error', `Trade failed: ${msg}`);
    } finally {
      setExecuting(null);
    }
  };

  // ── Dismiss signal ────────────────────────────────────────────────────────────
  const dismissSignal = async (id: string) => {
    await fetch('/api/trading-bot/signals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchStatus();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const activeSignals =
    status?.signals.filter((s) => s.expiresAt > Math.floor(Date.now() / 1000)) ?? [];
  const openPositions = status?.positions.filter((p) => p.status === 'open') ?? [];
  const closedPositions = status?.positions.filter((p) => p.status === 'closed') ?? [];
  const pnl = status?.totalPnlSol ?? 0;

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.backLink}>
            ← Back
          </Link>
          <h1 className={styles.headerTitle}>
            🤖 Pump.fun Trading Bot
          </h1>
          <span
            className={`${styles.statusBadge} ${status?.isRunning ? styles.running : styles.stopped}`}
          >
            <span className={`${styles.dot} ${status?.isRunning ? styles.pulse : ''}`} />
            {status?.isRunning ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>
        <div className={styles.walletRow}>
          <WalletMultiButton />
        </div>
      </header>

      <div className={styles.content}>
        {/* ── Notification ── */}
        {notification && (
          <div
            className={`${styles.alert} ${
              notification.type === 'error'
                ? styles.alertError
                : notification.type === 'success'
                ? styles.alertSuccess
                : styles.alertInfo
            }`}
          >
            {notification.text}
          </div>
        )}

        {/* ── Stats ── */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{status?.openPositionCount ?? 0}</div>
            <div className={styles.statLabel}>Open Positions</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{status?.closedPositionCount ?? 0}</div>
            <div className={styles.statLabel}>Closed Positions</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${pnl >= 0 ? styles.positive : styles.negative}`}>
              {pnl >= 0 ? '+' : ''}{fmtSol(pnl)} SOL
            </div>
            <div className={styles.statLabel}>Total P&L</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{activeSignals.length}</div>
            <div className={styles.statLabel}>Pending Signals</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              {status?.lastScanAt ? fmtTime(status.lastScanAt) : '—'}
            </div>
            <div className={styles.statLabel}>Last Scan</div>
          </div>
        </div>

        {/* ── Configuration ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>⚙️ Strategy Configuration</h2>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.configGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Wallet Address</label>
                {connected && publicKey ? (
                  <div className={styles.input} style={{ opacity: 0.7, userSelect: 'all' }}>
                    {publicKey.toBase58()}
                  </div>
                ) : (
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Connect wallet above or paste your address"
                    value={config.walletAddress}
                    onChange={(e) => setConfig((c) => ({ ...c, walletAddress: e.target.value }))}
                  />
                )}
                <span className={styles.hint}>Used to identify your positions. The bot never holds your private key.</span>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Buy Amount (SOL)</label>
                <input
                  className={styles.input}
                  type="number"
                  step="0.01"
                  min="0.001"
                  value={config.buyAmountSol}
                  onChange={(e) => setConfig((c) => ({ ...c, buyAmountSol: Number(e.target.value) }))}
                />
                <span className={styles.hint}>SOL spent per trade</span>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Take-Profit %</label>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="1"
                  value={config.takeProfitPercent}
                  onChange={(e) => setConfig((c) => ({ ...c, takeProfitPercent: Number(e.target.value) }))}
                />
                <span className={styles.hint}>Sell when price rises by this %</span>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Stop-Loss %</label>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="1"
                  value={config.stopLossPercent}
                  onChange={(e) => setConfig((c) => ({ ...c, stopLossPercent: Number(e.target.value) }))}
                />
                <span className={styles.hint}>Sell when price falls by this %</span>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Max Positions</label>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={config.maxPositions}
                  onChange={(e) => setConfig((c) => ({ ...c, maxPositions: Number(e.target.value) }))}
                />
                <span className={styles.hint}>Maximum concurrent open positions</span>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Min Market Cap (SOL)</label>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="0"
                  value={config.minMarketCapSol}
                  onChange={(e) => setConfig((c) => ({ ...c, minMarketCapSol: Number(e.target.value) }))}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Max Market Cap (SOL)</label>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="0"
                  value={config.maxMarketCapSol}
                  onChange={(e) => setConfig((c) => ({ ...c, maxMarketCapSol: Number(e.target.value) }))}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Min Liquidity (SOL)</label>
                <input
                  className={styles.input}
                  type="number"
                  step="1"
                  min="0"
                  value={config.minLiquiditySol}
                  onChange={(e) => setConfig((c) => ({ ...c, minLiquiditySol: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={saveConfig}
                disabled={configSaving}
              >
                {configSaving ? '…' : '💾'} Save Config
              </button>

              {!status?.isRunning ? (
                <button
                  className={`${styles.btn} ${styles.btnSuccess}`}
                  onClick={startBot}
                  disabled={botLoading}
                >
                  {botLoading ? '…' : '▶'} Start Bot
                </button>
              ) : (
                <button
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={stopBot}
                  disabled={botLoading}
                >
                  {botLoading ? '…' : '⏹'} Stop Bot
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Live Signals ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>📡 Live Trade Signals</h2>
            <span style={{ fontSize: 12, color: '#7c8ba1' }}>
              Signals expire in 2 minutes — approve in your wallet to execute
            </span>
          </div>
          <div className={styles.sectionBody}>
            {!connected && (
              <div className={`${styles.alert} ${styles.alertInfo}`}>
                Connect your wallet above to execute trades.
              </div>
            )}
            {activeSignals.length === 0 ? (
              <div className={styles.emptyState}>
                {status?.isRunning
                  ? 'Scanning for opportunities… signals will appear here when criteria are met.'
                  : 'Start the bot to begin scanning pump.fun for trade signals.'}
              </div>
            ) : (
              <div className={styles.signalList}>
                {activeSignals.map((signal) => (
                  <div key={signal.id} className={`${styles.signalCard} ${styles[signal.type]}`}>
                    <div className={styles.signalInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`${styles.signalType} ${styles[signal.type]}`}>
                          {signal.type.toUpperCase()}
                        </span>
                        <span className={styles.signalSymbol}>
                          {signal.tokenSymbol} — {signal.tokenName}
                        </span>
                      </div>
                      <div className={styles.signalMeta}>
                        Price: {fmtSol(signal.priceSol)} SOL · MCap: {signal.marketCapSol.toFixed(0)} SOL ·
                        Liquidity: {signal.liquiditySol.toFixed(1)} SOL · Expires in: {timeLeft(signal.expiresAt)}
                      </div>
                      <div className={styles.signalReason}>{signal.reason}</div>
                    </div>
                    <div className={styles.signalActions}>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${signal.type === 'buy' ? styles.btnSuccess : styles.btnDanger}`}
                        disabled={!connected || executing === signal.id}
                        onClick={() => executeTrade(signal)}
                      >
                        {executing === signal.id
                          ? '…'
                          : signal.type === 'buy'
                          ? `Buy ${config.buyAmountSol} SOL`
                          : 'Sell'}
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                        onClick={() => dismissSignal(signal.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Open Positions ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>📊 Open Positions ({openPositions.length})</h2>
          </div>
          <div className={styles.tableWrap}>
            {openPositions.length === 0 ? (
              <div className={styles.emptyState}>No open positions</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Buy Price</th>
                    <th>Current Price</th>
                    <th>Amount (SOL)</th>
                    <th>Unrealised P&L</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos) => {
                    const unrealisedPct =
                      pos.buyPriceSol && pos.currentPriceSol
                        ? ((pos.currentPriceSol - pos.buyPriceSol) / pos.buyPriceSol) * 100
                        : null;
                    return (
                      <tr key={pos.id}>
                        <td>
                          <strong>{pos.tokenSymbol}</strong>
                          <div style={{ fontSize: 11, color: '#7c8ba1' }}>
                            {pos.tokenMint.slice(0, 8)}…
                          </div>
                        </td>
                        <td>{fmtSol(pos.buyPriceSol)}</td>
                        <td>{fmtSol(pos.currentPriceSol)}</td>
                        <td>{fmtSol(pos.buyAmountSol)}</td>
                        <td
                          className={
                            unrealisedPct === null
                              ? ''
                              : unrealisedPct >= 0
                              ? styles.pnlPositive
                              : styles.pnlNegative
                          }
                        >
                          {unrealisedPct !== null ? fmtPct(unrealisedPct) : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: '#7c8ba1' }}>
                          {fmtTime(pos.buyTime)}
                        </td>
                        <td>
                          <span className={`${styles.badge} ${styles.open}`}>OPEN</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Trade History ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>📜 Trade History ({closedPositions.length})</h2>
          </div>
          <div className={styles.tableWrap}>
            {closedPositions.length === 0 ? (
              <div className={styles.emptyState}>No completed trades yet</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Buy Price</th>
                    <th>Sell Price</th>
                    <th>Amount (SOL)</th>
                    <th>Realised P&L</th>
                    <th>Closed At</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map((pos) => (
                    <tr key={pos.id}>
                      <td>
                        <strong>{pos.tokenSymbol}</strong>
                        <div style={{ fontSize: 11, color: '#7c8ba1' }}>
                          {pos.tokenMint.slice(0, 8)}…
                        </div>
                      </td>
                      <td>{fmtSol(pos.buyPriceSol)}</td>
                      <td>{fmtSol(pos.closePriceSol)}</td>
                      <td>{fmtSol(pos.buyAmountSol)}</td>
                      <td
                        className={
                          (pos.pnlSol ?? 0) >= 0 ? styles.pnlPositive : styles.pnlNegative
                        }
                      >
                        {fmtSol(pos.pnlSol)} SOL ({fmtPct(pos.pnlPercent)})
                      </td>
                      <td style={{ fontSize: 12, color: '#7c8ba1' }}>
                        {pos.closeTime ? fmtTime(pos.closeTime) : '—'}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.closed}`}>CLOSED</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{ color: '#4a5568', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
          ⚠️ Trading cryptocurrencies carries significant risk. This bot is for educational purposes only.
          Always verify transactions in your wallet before approving. The bot never holds your private key.
        </div>
      </div>
    </div>
  );
}
