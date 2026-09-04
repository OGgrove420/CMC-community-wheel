"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

function Giveaway() {
  const { publicKey, connected, signMessage } = useWallet();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const enterGiveaway = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setStatus("connect a compatible wallet first");
      return;
    }

    setLoading(true);
    setStatus("preparing verification");

    try {
      const wallet = publicKey.toBase58();

      const nonceResponse = await fetch("/api/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
      });

      if (!nonceResponse.ok) {
        throw new Error("could not create verification request");
      }

      const { message } = await nonceResponse.json();
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      const entryResponse = await fetch("/api/enter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet,
          message,
          signature: Array.from(signature),
        }),
      });

      const result = await entryResponse.json();

      if (!entryResponse.ok) {
        throw new Error(result.error || "entry failed");
      }

      setStatus(result.alreadyEntered ? "wallet already entered" : "entry confirmed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "entry failed");
    } finally {
      setLoading(false);
    }
  }, [publicKey, signMessage]);

  return (
    <main>
      <section className="card">
        <p className="eyebrow">CMC community giveaway</p>
        <h1>spin to win</h1>

        <div className="wheel">
          <div className="hub">CMC</div>
        </div>

        <div className="countdown">
          <div><strong>00</strong><span>days</span></div>
          <div><strong>00</strong><span>hours</span></div>
          <div><strong>00</strong><span>mins</span></div>
          <div><strong>00</strong><span>secs</span></div>
        </div>

        <WalletMultiButton />

        {connected && (
          <button
            className="enter"
            disabled={loading}
            onClick={enterGiveaway}
          >
            {loading ? "verifying…" : "sign and enter"}
          </button>
        )}

        {publicKey && <p className="wallet">{publicKey.toBase58()}</p>}
        {status && <p className="status">{status}</p>}

        <p className="note">
          Solana mainnet. signing verifies wallet ownership and does not send a
          transaction or request funds.
        </p>
      </section>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #070b0f;
          color: #edf8f1;
          font-family: Arial, sans-serif;
        }

        main {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 20px;
          background:
            radial-gradient(circle at 50% 10%, #17303a 0, transparent 42%),
            #070b0f;
        }

        .card {
          width: min(100%, 430px);
          padding: 24px;
          text-align: center;
          background: #10181e;
          border: 1px solid #293943;
          border-radius: 20px;
        }

        .eyebrow {
          margin: 0;
          color: #9cff57;
          font-size: 12px;
          letter-spacing: 0.15em;
        }

        h1 {
          margin: 8px 0 24px;
          font-size: 34px;
        }

        .wheel {
          width: 230px;
          height: 230px;
          display: grid;
          place-items: center;
          margin: 0 auto 24px;
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
          box-shadow: 0 18px 45px #0009;
        }

        .hub {
          display: grid;
          place-items: center;
          width: 64px;
          height: 64px;
          color: #9cff57;
          background: #071008;
          border: 5px solid white;
          border-radius: 50%;
          font-weight: 900;
        }

        .countdown {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 7px;
          margin-bottom: 18px;
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
          opacity: 0.6;
        }

        .wallet,
        .status,
        .note {
          overflow-wrap: anywhere;
          font-size: 12px;
        }

        .wallet {
          color: #83939d;
        }

        .status {
          color: #9cff57;
        }

        .note {
          margin: 18px 0 0;
          color: #83939d;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}

export default function Page() {
  const endpoint = useMemo(() => clusterApiUrl("mainnet-beta"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
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
