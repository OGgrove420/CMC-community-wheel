"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

type GiveawayData = {
  title: string;
  prize: string;
  endsAt: string | null;
  entriesOpen: boolean;
  entryCount: number;
  winnerDrawn: boolean;
  drawnAt: string | null;
  updatedAt: string;
};
type ResultData = {
  drawn: boolean;
  winnerWallet: string | null;
  drawnAt: string | null;
  audit: {
    entryCount: number;
    winnerIndex: number;
    randomValue: string;
    randomCommitment: string;
    algorithm: string;
  } | null;
};
type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  finished: boolean;
};

function getTimeLeft(endsAt: string | null): TimeLeft {
  if (!endsAt) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      finished: false,
    };
  }

  const remaining = Math.max(
    0,
    new Date(endsAt).getTime() - Date.now()
  );

  return {
    days: Math.floor(remaining / 86400000),
    hours: Math.floor(remaining / 3600000) % 24,
    minutes: Math.floor(remaining / 60000) % 60,
    seconds: Math.floor(remaining / 1000) % 60,
    finished: remaining === 0,
  };
}

function Giveaway() {
  const { publicKey, connected, signMessage } = useWallet();

  const [giveaway, setGiveaway] = useState<GiveawayData | null>(
    null
  );
  const [result, setResult] = useState<ResultData | null>(null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(
    getTimeLeft(null)
  );
  const [status, setStatus] = useState("loading giveaway");
  const [loading, setLoading] = useState(false);

  const loadGiveaway = useCallback(async () => {
    try {
      const response = await fetch("/api/giveaway", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "could not load giveaway");
      }

      setGiveaway(result);
      setTimeLeft(getTimeLeft(result.endsAt));
      setStatus("");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "could not load giveaway"
      );
    }
  }, []);

 useEffect(() => {
  loadGiveaway();
  loadResult();

  const refresh = window.setInterval(() => {
    loadGiveaway();
    loadResult();
  }, 10000);

  return () => window.clearInterval(refresh);
}, [loadGiveaway, loadResult]);
  const loadResult = useCallback(async () => {
    try {
      const response = await fetch("/api/results", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "could not load result");
      }

      setResult(data);
    } catch {
      setResult(null);
    }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft(getTimeLeft(giveaway?.endsAt || null));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [giveaway?.endsAt]);

  const enterGiveaway = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setStatus("connect Phantom or Solflare first");
      return;
    }

    if (!giveaway?.entriesOpen || timeLeft.finished) {
      setStatus("giveaway entries are closed");
      return;
    }

    setLoading(true);
    setStatus("preparing wallet verification");

    try {
      const wallet = publicKey.toBase58();

      const nonceResponse = await fetch("/api/nonce", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ wallet }),
      });

      const nonceResult = await nonceResponse.json();

      if (!nonceResponse.ok) {
        throw new Error(
          nonceResult.error ||
            "could not create verification request"
        );
      }

      setStatus("approve the message in your wallet");

      const message = String(nonceResult.message);
      const signature = await signMessage(
        new TextEncoder().encode(message)
      );

      setStatus("confirming giveaway entry");

      const entryResponse = await fetch("/api/enter", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          wallet,
          message,
          signature: Array.from(signature),
        }),
      });

      const entryResult = await entryResponse.json();

      if (!entryResponse.ok) {
        throw new Error(entryResult.error || "entry failed");
      }

      setStatus(
        entryResult.alreadyEntered
          ? "this wallet is already entered"
          : "entry confirmed"
      );

      await loadGiveaway();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "entry failed"
      );
    } finally {
      setLoading(false);
    }
  }, [
    publicKey,
    signMessage,
    giveaway?.entriesOpen,
    timeLeft.finished,
    loadGiveaway,
  ]);

  const pad = (value: number) =>
    String(value).padStart(2, "0");

  const isOpen =
    Boolean(giveaway?.entriesOpen) && !timeLeft.finished;

  return (
    <main>
      <section className="card">
        <div className="topline">
          <p className="eyebrow">CMC community giveaway</p>
          <span className={isOpen ? "badge open" : "badge"}>
            {isOpen ? "entries open" : "entries closed"}
          </span>
        </div>

        <h1>{giveaway?.title || "CMC community wheel"}</h1>

        <div className="prize">
          <span>prize</span>
          <strong>{giveaway?.prize || "tbd"}</strong>
        </div>

        <div className="wheel-shell">
          <div className="pointer" />
          <div
            className={
              loading ? "wheel wheel-loading" : "wheel"
            }
          >
            <div className="hub">
              <strong>CMC</strong>
              <span>{giveaway?.entryCount || 0} entries</span>
            </div>
          </div>
        </div>

        <p className="countdown-label">
          {giveaway?.endsAt
            ? timeLeft.finished
              ? "giveaway ended"
              : "giveaway ends in"
            : "countdown not set"}
        </p>

        <div className="countdown">
          <div>
            <strong>{pad(timeLeft.days)}</strong>
            <span>days</span>
          </div>
          <div>
            <strong>{pad(timeLeft.hours)}</strong>
            <span>hours</span>
          </div>
          <div>
            <strong>{pad(timeLeft.minutes)}</strong>
            <span>mins</span>
          </div>
          <div>
            <strong>{pad(timeLeft.seconds)}</strong>
            <span>secs</span>
          </div>
        </div>

        <div className="stats">
          <div>
            <strong>{giveaway?.entryCount || 0}</strong>
            <span>verified wallets</span>
          </div>
          <div>
            <strong>
              {giveaway?.winnerDrawn ? "drawn" : "pending"}
            </strong>
            <span>winner status</span>
          </div>
        </div>

        <WalletMultiButton />

        {connected && (
          <button
            className="enter"
            disabled={loading || !isOpen}
            onClick={enterGiveaway}
          >
            {loading
              ? "verifying…"
              : isOpen
                ? "sign and enter giveaway"
                : "entries closed"}
          </button>
        )}

        {publicKey && (
          <p className="wallet">{publicKey.toBase58()}</p>
        )}

        {status && <p className="status">{status}</p>}

        <p className="note">
          Solana mainnet. one entry per verified wallet. signing
          does not send a transaction or authorize spending.
        </p>
      </section>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          color: #edf8f1;
          background: #070b0f;
          font-family: Arial, sans-serif;
        }

        main {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 20px;
          background:
            radial-gradient(
              circle at 50% 5%,
              #1c3b46 0,
              transparent 38%
            ),
            #070b0f;
        }

        .card {
          width: min(100%, 450px);
          padding: 24px;
          text-align: center;
          background: #10181e;
          border: 1px solid #293943;
          border-radius: 20px;
          box-shadow: 0 24px 70px #0008;
        }

        .topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .eyebrow {
          margin: 0;
          color: #9cff57;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-align: left;
        }

        .badge {
          padding: 6px 9px;
          color: #9aabb5;
          background: #182229;
          border: 1px solid #344650;
          border-radius: 999px;
          font-size: 9px;
        }

        .badge.open {
          color: #9cff57;
          background: #15221a;
          border-color: #3e6531;
        }

        h1 {
          margin: 14px 0 12px;
          font-size: 32px;
          overflow-wrap: anywhere;
        }

        .prize {
          margin-bottom: 18px;
        }

        .prize span,
        .prize strong {
          display: block;
        }

        .prize span {
          color: #82949e;
          font-size: 10px;
        }

        .prize strong {
          margin-top: 4px;
          color: #ffcf4a;
          font-size: 20px;
          overflow-wrap: anywhere;
        }

        .wheel-shell {
          position: relative;
          width: 240px;
          height: 240px;
          margin: 0 auto 22px;
        }

        .pointer {
          position: absolute;
          z-index: 2;
          top: -8px;
          left: 105px;
          width: 0;
          height: 0;
          border-right: 15px solid transparent;
          border-left: 15px solid transparent;
          border-top: 29px solid white;
          filter: drop-shadow(0 3px 3px #000);
        }

        .wheel {
          width: 240px;
          height: 240px;
          display: grid;
          place-items: center;
          border: 8px solid #edf8f1;
          border-radius: 50%;
          background: conic-gradient(
            #9cff57 0deg 45deg,
            #ff5da2 45deg 90deg,
            #54d8ff 90deg 135deg,
            #ffcf4a 135deg 180deg,
            #a98cff 180deg 225deg,
            #ff7657 225deg 270deg,
            #67f0c2 270deg 315deg,
            #f2f5ff 315deg 360deg
          );
          box-shadow:
            0 0 0 4px #293943,
            0 18px 45px #0009;
        }

        .wheel-loading {
          animation: rotate 1.2s linear infinite;
        }

        @keyframes rotate {
          to {
            transform: rotate(360deg);
          }
        }

        .hub {
          width: 84px;
          height: 84px;
          display: grid;
          place-content: center;
          color: #9cff57;
          background: #071008;
          border: 5px solid white;
          border-radius: 50%;
        }

        .hub strong,
        .hub span {
          display: block;
        }

        .hub strong {
          font-size: 20px;
        }

        .hub span {
          margin-top: 3px;
          color: #9aabb5;
          font-size: 9px;
        }

        .countdown-label {
          margin: 0 0 8px;
          color: #82949e;
          font-size: 11px;
        }

        .countdown {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 7px;
          margin-bottom: 14px;
        }

        .countdown div {
          padding: 10px 4px;
          background: #080d11;
          border: 1px solid #293943;
          border-radius: 10px;
        }

        .countdown strong,
        .countdown span {
          display: block;
        }

        .countdown strong {
          font-size: 20px;
        }

        .countdown span {
          margin-top: 3px;
          color: #83939d;
          font-size: 9px;
        }

        .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }

        .stats div {
          padding: 11px;
          background: #121c22;
          border: 1px solid #293943;
          border-radius: 10px;
        }

        .stats strong,
        .stats span {
          display: block;
        }

        .stats strong {
          color: #9cff57;
          font-size: 17px;
        }

        .stats span {
          margin-top: 3px;
          color: #82949e;
          font-size: 9px;
        }

        .wallet-adapter-button,
        .enter {
          width: 100%;
          justify-content: center;
          margin-top: 10px;
          border: 0;
          border-radius: 10px;
        }

        .enter {
          padding: 14px;
          color: #071008;
          background: #9cff57;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .enter:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .wallet,
        .status,
        .note {
          overflow-wrap: anywhere;
          font-size: 12px;
        }

        .wallet {
          color: #82949e;
        }

        .status {
          color: #9cff57;
        }

        .note {
          margin: 18px 0 0;
          color: #82949e;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}

export default function Page() {
  const endpoint = useMemo(
    () => clusterApiUrl("mainnet-beta"),
    []
  );

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Giveaway />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
