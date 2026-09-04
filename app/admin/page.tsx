"use client";

import { FormEvent, useMemo, useState } from "react";
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

function AdminPanel() {
  const { publicKey, signMessage } = useWallet();
  const [title, setTitle] = useState("CMC community wheel");
  const [prize, setPrize] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [entriesOpen, setEntriesOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [winnerWallet, setWinnerWallet] = useState("");

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publicKey || !signMessage) {
      setStatus("connect the authorized admin wallet first");
      return;
    }

    if (!title.trim() || !prize.trim() || !endsAt) {
      setStatus("title, prize, and end time are required");
      return;
    }

    const selectedEnd = new Date(endsAt);

    if (
      Number.isNaN(selectedEnd.getTime()) ||
      selectedEnd.getTime() <= Date.now()
    ) {
      setStatus("choose a future end time");
      return;
    }

    setSaving(true);
    setStatus("requesting admin verification");

    try {
      const wallet = publicKey.toBase58();

      const nonceResponse = await fetch("/api/admin/nonce", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ wallet }),
      });

      const nonceResult = await nonceResponse.json();

      if (!nonceResponse.ok) {
        throw new Error(
          nonceResult.error || "could not request admin verification"
        );
      }

      setStatus("approve the message in your wallet");

      const message = String(nonceResult.message);
      const signature = await signMessage(
        new TextEncoder().encode(message)
      );

      setStatus("saving giveaway settings");

      const settingsResponse = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          wallet,
          message,
          signature: Array.from(signature),
          title: title.trim(),
          prize: prize.trim(),
          endsAt: selectedEnd.toISOString(),
          entriesOpen,
        }),
      });

      const settingsResult = await settingsResponse.json();

      if (!settingsResponse.ok) {
        throw new Error(
          settingsResult.error || "settings could not be saved"
        );
      }

      setStatus("giveaway settings saved");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "settings could not be saved"
      );
    } finally {
      setSaving(false);
    }
  }
  async function drawWinner() {
    if (!publicKey || !signMessage) {
      setStatus("connect the authorized admin wallet first");
      return;
    }

    const confirmed = window.confirm(
      "draw the winner now? this action is permanent."
    );

    if (!confirmed) return;

    setDrawing(true);
    setWinnerWallet("");
    setStatus("requesting draw authorization");

    try {
      const wallet = publicKey.toBase58();

      const nonceResponse = await fetch("/api/admin/draw-nonce", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ wallet }),
      });

      const nonceResult = await nonceResponse.json();

      if (!nonceResponse.ok) {
        throw new Error(
          nonceResult.error || "could not request draw authorization"
        );
      }

      setStatus("approve the draw message in your wallet");

      const message = String(nonceResult.message);
      const signature = await signMessage(
        new TextEncoder().encode(message)
      );

      setStatus("drawing winner");

      const drawResponse = await fetch("/api/admin/draw", {
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

      const drawResult = await drawResponse.json();

      if (!drawResponse.ok) {
        throw new Error(drawResult.error || "winner draw failed");
      }

      setWinnerWallet(String(drawResult.winnerWallet));
      setStatus("winner drawn and recorded");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "winner draw failed"
      );
    } finally {
      setDrawing(false);
    }
  }
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">CMC community wheel</p>
        <h1>admin controls</h1>

        <WalletMultiButton />

        <form onSubmit={saveSettings}>
          <label>
            giveaway title
            <input
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label>
            prize
            <input
              maxLength={200}
              placeholder="enter the giveaway prize"
              value={prize}
              onChange={(event) => setPrize(event.target.value)}
            />
          </label>

          <label>
            giveaway end time
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={entriesOpen}
              onChange={(event) =>
                setEntriesOpen(event.target.checked)
              }
            />
            accept wallet entries
          </label>

          <button className="save" disabled={saving} type="submit">
            {saving ? "saving…" : "sign and save settings"}
          </button>
        </form>
<button
  className="save"
  style={{ marginTop: "14px" }}
  disabled={drawing}
  onClick={drawWinner}
  type="button"
>
  {drawing ? "drawing…" : "draw winner"}
</button>

{winnerWallet && (
  <p className="status">
    winner: {winnerWallet}
  </p>
)}
        {publicKey && (
          <p className="wallet">{publicKey.toBase58()}</p>
        )}

        {status && <p className="status">{status}</p>}

        <p className="note">
          only the configured admin wallet can save changes. signing
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
            radial-gradient(circle at 50% 10%, #17303a 0, transparent 42%),
            #070b0f;
        }

        .panel {
          width: min(100%, 460px);
          padding: 24px;
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
          margin: 8px 0 20px;
          font-size: 32px;
        }

        form {
          display: grid;
          gap: 16px;
          margin-top: 20px;
        }

        label {
          display: grid;
          gap: 7px;
          color: #9aabb5;
          font-size: 12px;
        }

        input {
          width: 100%;
          padding: 13px;
          color: #edf8f1;
          background: #080d11;
          border: 1px solid #30414c;
          border-radius: 10px;
          font-size: 15px;
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .toggle input {
          width: 18px;
          height: 18px;
        }

        .wallet-adapter-button,
        .save {
          width: 100%;
          justify-content: center;
          border: 0;
          border-radius: 10px;
        }

        .save {
          padding: 14px;
          color: #071008;
          background: #9cff57;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
        }

        .save:disabled {
          cursor: wait;
          opacity: 0.6;
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

export default function AdminPage() {
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
          <AdminPanel />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
