import { createClient } from "@supabase/supabase-js";
import express from "express";
import { webcrypto } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Lazy initialization of the Supabase client
let supabaseInstance: any = null;
function getSupabase() {
  if (!supabaseInstance) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    }
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

// ---------------------------------------------------------------------------
// Blockchain fetchers
// ---------------------------------------------------------------------------

interface BlockchainTransaction {
  hash: string;
  amount: number;
  tokenSymbol: string;
  from: string;
  to: string;
  network: string;
  usdValue: number;
  status: string;
  receiverWallet?: string;
}

async function fetchTronTransaction(txHash: string): Promise<BlockchainTransaction | null> {
  try {
    const response = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${txHash}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !data.data) return null;

    const contract = data.data;
    let amount = 0;
    let tokenSymbol = "TRX";
    let from = "";
    let to = "";

    if (contract.contractData) {
      amount = Number(contract.contractData.amount || 0) / 1e6;
      from = contract.contractData.owner_address || "";
      to = contract.contractData.to_address || "";
    }
    if (contract.contractRet) {
      tokenSymbol = contract.contractRet.tokenInfo?.tokenSymbol || "TRX";
      if (contract.contractRet.amount) amount = Number(contract.contractRet.amount) / 1e6;
    }

    return {
      hash: txHash, amount, tokenSymbol, from, to,
      network: "TRON", usdValue: 0,
      status: data.confirmed ? "confirmed" : "pending",
    };
  } catch { return null; }
}

async function fetchEvmTransaction(txHash: string, baseUrl: string, apiKey: string, symbol: string, network: string): Promise<BlockchainTransaction | null> {
  try {
    const url = `${baseUrl}/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.result) return null;
    const value = parseInt(data.result.value || "0", 16) / 1e18;
    return {
      hash: txHash, amount: value, tokenSymbol: symbol,
      from: data.result.from || "", to: data.result.to || "",
      network, usdValue: 0, status: "confirmed",
    };
  } catch { return null; }
}

async function fetchCryptoPrice(symbol: string): Promise<number> {
  const map: Record<string, string> = {
    TRX: "tron", ETH: "ethereum", BNB: "binancecoin", USDT: "tether",
    USDC: "usd-coin", BTC: "bitcoin", SOL: "solana", MATIC: "matic-network",
  };
  const id = map[symbol.toUpperCase()] ?? symbol.toLowerCase();
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data[id]?.usd ?? 0;
  } catch { return 0; }
}

function detectNetwork(txHash: string): string {
  if (txHash.startsWith("T")) return "TRON";
  if (txHash.startsWith("0x")) return "Ethereum";
  return "Unknown";
}

// ---------------------------------------------------------------------------
// Core verification logic
// ---------------------------------------------------------------------------

async function verifyTransaction(txHash: string, username: string, discordUserId?: string, discordUsername?: string) {
  const supabase = getSupabase();

  const { data: existingTx } = await supabase.from("transactions").select("*").eq("tx_hash", txHash).maybeSingle();
  if (existingTx && existingTx.status === "confirmed") {
    return { error: "This transaction was already verified — credits were already added.", status: 409 };
  }

  const { data: settingsData } = await supabase.from("settings").select("*");
  const settings: Record<string, string> = {};
  (settingsData || []).forEach((s: any) => { settings[s.key] = s.value; });
  const creditsPerUsd = parseFloat(settings["credits_per_usd"] || "1");

  const { data: walletsData } = await supabase.from("wallets").select("*");
  const validWallets: { name: string; address: string }[] = (walletsData || [])
    .filter((w: any) => w.address && w.address.trim().length > 0)
    .map((w: any) => ({ name: w.name, address: w.address.trim() }));

  const { data: apiKeysData } = await supabase.from("api_keys").select("*");
  const apiKeys: Record<string, string> = {};
  (apiKeysData || []).forEach((k: any) => { apiKeys[k.key_name] = k.key_value; });

  let txData: BlockchainTransaction | null = null;
  const detectedNetwork = detectNetwork(txHash);

  if (detectedNetwork === "TRON") {
    txData = await fetchTronTransaction(txHash);
  } else if (detectedNetwork === "Ethereum") {
    txData = await fetchEvmTransaction(txHash, "https://api.etherscan.io", apiKeys["etherscan"] || "", "ETH", "Ethereum");
  } else if (detectedNetwork === "BSC") {
    txData = await fetchEvmTransaction(txHash, "https://api.bscscan.com", apiKeys["bscscan"] || "", "BNB", "BSC");
  }

  if (!txData) {
    await supabase.from("transactions").upsert({
      tx_hash: txHash, username, discord_user_id: discordUserId, discord_username: discordUsername,
      amount_usd: 0, credits_added: 0, status: "failed", network: detectedNetwork,
    });
    return { error: "Could not find this transaction on the blockchain. Check the TX ID and try again.", status: 404 };
  }

  const sym = txData.tokenSymbol.toUpperCase();
  if (sym === "USDT" || sym === "USDC") {
    txData.usdValue = txData.amount;
  } else {
    const price = await fetchCryptoPrice(sym);
    txData.usdValue = txData.amount * price;
  }

  if (validWallets.length > 0 && txData.to) {
    const matchedWallet = validWallets.find((w) => w.address.toLowerCase() === txData.to.toLowerCase());
    if (!matchedWallet) {
      await supabase.from("transactions").upsert({
        tx_hash: txHash, username, discord_user_id: discordUserId, discord_username: discordUsername,
        amount_usd: txData.usdValue, credits_added: 0, status: "failed",
        network: txData.network, sender_address: txData.from, receiver_address: txData.to,
      });
      return { error: "Payment was sent to a wallet address that is not registered. Credits NOT added.", status: 400 };
    }
    txData.receiverWallet = matchedWallet.name;
  }

  if (txData.status !== "confirmed") {
    await supabase.from("transactions").upsert({
      tx_hash: txHash, username, discord_user_id: discordUserId, discord_username: discordUsername,
      amount_usd: txData.usdValue, credits_added: 0, status: "pending",
      network: txData.network, sender_address: txData.from, receiver_address: txData.to,
    });
    return { error: "Transaction is still pending on the blockchain. Wait for confirmations and try again.", status: 202 };
  }

  const creditsToAdd = Math.floor(txData.usdValue * creditsPerUsd);
  if (creditsToAdd <= 0) {
    await supabase.from("transactions").upsert({
      tx_hash: txHash, username, discord_user_id: discordUserId, discord_username: discordUsername,
      amount_usd: txData.usdValue, credits_added: 0, status: "failed",
      network: txData.network, sender_address: txData.from, receiver_address: txData.to,
    });
    return { error: "Payment amount is too small to add any credits.", status: 400 };
  }

  let user = null;
  if (discordUserId) {
    const { data } = await supabase.from("users").select("*").eq("discord_user_id", discordUserId).maybeSingle();
    user = data;
  }
  if (!user) {
    const { data } = await supabase.from("users").select("*").eq("username", username).maybeSingle();
    user = data;
  }
  if (!user) {
    const { data: newUser } = await supabase.from("users").insert({
      username, discord_user_id: discordUserId, discord_username: discordUsername,
    }).select("*").maybeSingle();
    user = newUser;
  }
  if (!user) return { error: "Failed to find or create user.", status: 500 };

  const updates: Record<string, string> = {};
  if (discordUserId && !user.discord_user_id) updates.discord_user_id = discordUserId;
  if (discordUsername && !user.discord_username) updates.discord_username = discordUsername;
  if (Object.keys(updates).length > 0) {
    await supabase.from("users").update(updates).eq("id", user.id);
  }

  const newCredits = (user.credits || 0) + creditsToAdd;
  await supabase.from("users").update({ credits: newCredits }).eq("id", user.id);

  await supabase.from("transactions").upsert({
    tx_hash: txHash, user_id: user.id, username, discord_user_id: discordUserId, discord_username: discordUsername,
    amount_usd: txData.usdValue, credits_added: creditsToAdd, status: "confirmed",
    network: txData.network, sender_address: txData.from, receiver_address: txData.to,
    confirmed_at: new Date().toISOString(),
  });

  return {
    success: true,
    message: `Payment confirmed! ${creditsToAdd} credits added to ${username}.`,
    txData, usdValue: txData.usdValue, creditsAdded: creditsToAdd,
    user: { ...user, credits: newCredits },
  };
}

// ---------------------------------------------------------------------------
// Discord signature verification
// ---------------------------------------------------------------------------

async function verifyDiscordSignature(body: string, signature: string, timestamp: string, publicKey: string): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey(
      "raw",
      hexToUint8(publicKey),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );
    const message = new TextEncoder().encode(timestamp + body);
    const sigBytes = hexToUint8(signature);
    return await webcrypto.subtle.verify("Ed25519", key, sigBytes, message);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

function hexToUint8(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Discord slash command registration
// ---------------------------------------------------------------------------

async function registerSlashCommands(botToken: string, appId: string, guildId: string): Promise<Response> {
  const commands = [
    { name: "verify", description: "Verify a crypto payment and add credits", options: [{ name: "txid", description: "The transaction ID", type: 3, required: true }] },
    { name: "balance", description: "Check your current credit balance" },
    { name: "wallets", description: "Show available wallet addresses" },
    { name: "help", description: "Show how to use the bot" },
  ];

  const url = guildId ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands` : `https://discord.com/api/v10/applications/${appId}/commands`;

  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const errText = await response.text();
    return new Response(JSON.stringify({ error: `Discord API error: ${response.status}`, detail: errText }), { status: 502 });
  }

  return new Response(JSON.stringify({ success: true, message: "Commands registered successfully." }), { status: 200 });
}

// ---------------------------------------------------------------------------
// Discord interaction handler
// ---------------------------------------------------------------------------

async function handleDiscordInteraction(body: any): Promise<Response> {
  const interactionType = body.type;
  const discordUser = body.member?.user ?? body.user;
  const supabase = getSupabase();

  if (interactionType === 1) return jsonResponse({ type: 1 });

  if (interactionType === 2) {
    const commandName = body.data?.name;
    const username = discordUser?.username ?? "unknown";
    const discordUserId = discordUser?.id;

    if (commandName === "help") {
      return jsonResponse({
        type: 4, data: { embeds: [{ title: "CryptoVerify Bot", description: "Use `/verify <txid>` to get credits.", color: 0x06b6d4 }] }
      });
    }

    if (commandName === "wallets") {
      const { data: walletsData } = await supabase.from("wallets").select("*");
      
      const validWallets = (walletsData || [])
        .filter((w: any) => w.address && w.address.trim().length > 0)
        .map((w: any) => {
          // Detect network automatically based on prefix
          const net = w.network || (w.address.startsWith("T") ? "TRON (TRC20)" : w.address.startsWith("0x") ? "Ethereum / BSC (ERC20/BEP20)" : "Unknown");
          
          return {
            name: `💳 ${w.name || "Wallet"}`,
            value: `🌐 Network: **${net}**\n\`\`\`\n${w.address.trim()}\n\`\`\``,
            inline: false,
          };
        });

      return jsonResponse({ 
        type: 4, 
        data: { 
          embeds: [{ 
            title: "Payment Wallets", 
            description: "Send your payment to the corresponding network. Hover over the address to copy it.",
            color: 0x3b82f6, 
            fields: validWallets.length ? validWallets : [{name: "Error", value: "No wallets set"}] 
          }] 
        } 
      });
    }

    if (commandName === "balance") {
      const { data: user } = await supabase.from("users").select("*").eq("discord_user_id", discordUserId).maybeSingle();
      return jsonResponse({ type: 4, data: { embeds: [{ title: "Balance", description: `You currently have **${user?.credits ?? 0}** credits.`, color: 0x10b981 }] } });
    }

    if (commandName === "verify") {
      const txHash = body.data?.options?.find((o: any) => o.name === "txid")?.value;
      if (!txHash) return jsonResponse({ type: 4, data: { content: "Please provide a TXID." } });
      const result = await verifyTransaction(txHash, username, discordUserId, username);
      if (result.success) {
        return jsonResponse({ type: 4, data: { embeds: [{ title: "Payment Confirmed", description: `+${result.creditsAdded} credits added!`, color: 0x10b981 }] } });
      } else {
        return jsonResponse({ type: 4, data: { embeds: [{ title: "Verification Failed", description: result.error, color: 0xef4444 }] } });
      }
    }
  }
  return jsonResponse({ type: 4, data: { content: "Unknown command." } });
}

function jsonResponse(data: any): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Main Node.js Express Server
// ---------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// Parse all as text first to validate Discord signature
app.use(express.text({ type: '*/*' }));

app.all('*', async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }

  try {
    const supabase = getSupabase();
    const urlPath = req.path;
    const rawBody = typeof req.body === 'string' ? req.body : "";
    let body: any = {};
    
    if (rawBody) {
      try { body = JSON.parse(rawBody); } catch (e) { /* Ignore parse error */ }
    }

    if (urlPath.endsWith("/setup") && req.method === "POST") {
      const { botToken, appId, guildId } = body;
      if (!botToken || !appId) return res.status(400).set(corsHeaders).json({ error: "Missing botToken or appId" });
      const response = await registerSlashCommands(botToken, appId, guildId || "");
      const text = await response.text();
      return res.status(response.status).set(corsHeaders).type("json").send(text);
    }

    if (urlPath.endsWith("/verify") && req.method === "POST") {
      const result = await verifyTransaction(body.txHash, body.username);
      return res.status((result as any).status ?? 200).set(corsHeaders).json(result);
    }

    if (req.method === "POST") {
      const { data: pubKeySetting } = await supabase.from("settings").select("value").eq("key", "discord_public_key").maybeSingle();
      const publicKey = pubKeySetting?.value || "";

      if (publicKey) {
        const signature = req.headers["x-signature-ed25519"] as string || "";
        const timestamp = req.headers["x-signature-timestamp"] as string || "";
        const valid = await verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
        if (!valid) {
          return res.status(401).set(corsHeaders).json({ error: "Invalid request signature" });
        }
      }

      const response = await handleDiscordInteraction(body);
      const text = await response.text();
      return res.status(response.status).set(corsHeaders).type("json").send(text);
    }

    return res.status(200).set(corsHeaders).json({ status: "ok", bot: "CryptoVerify Discord Bot (Node.js)" });

  } catch (err: any) {
    console.error("Main handler error:", err);
    return res.status(500).set(corsHeaders).json({ error: err.message || "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
