import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Inicialización "Lazy" del cliente de Supabase para evitar BOOT_ERROR
let supabaseInstance: any = null;
function getSupabase() {
  if (!supabaseInstance) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. Configure them in Supabase.");
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
// Core verification logic (shared by Discord and dashboard)
// ---------------------------------------------------------------------------

async function verifyTransaction(txHash: string, username: string, discordUserId?: string, discordUsername?: string) {
  const supabase = getSupabase();

  // Duplicate check
  const { data: existingTx } = await supabase
    .from("transactions").select("*").eq("tx_hash", txHash).maybeSingle();
  if (existingTx && existingTx.status === "confirmed") {
    return { error: "This transaction was already verified — credits were already added.", status: 409 };
  }

  // Settings
  const { data: settingsData } = await supabase.from("settings").select("*");
  const settings: Record<string, string> = {};
  (settingsData || []).forEach((s: any) => { settings[s.key] = s.value; });
  const creditsPerUsd = parseFloat(settings["credits_per_usd"] || "1");

  // Wallets — check against ALL configured wallet addresses
  const { data: walletsData } = await supabase.from("wallets").select("*");
  const validWallets: { name: string; address: string }[] = (walletsData || [])
    .filter((w: any) => w.address && w.address.trim().length > 0)
    .map((w: any) => ({ name: w.name, address: w.address.trim() }));

  // API keys
  const { data: apiKeysData } = await supabase.from("api_keys").select("*");
  const apiKeys: Record<string, string> = {};
  (apiKeysData || []).forEach((k: any) => { apiKeys[k.key_name] = k.key_value; });

  // Fetch from blockchain
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

  // USD price
  const sym = txData.tokenSymbol.toUpperCase();
  if (sym === "USDT" || sym === "USDC") {
    txData.usdValue = txData.amount;
  } else {
    const price = await fetchCryptoPrice(sym);
    txData.usdValue = txData.amount * price;
  }

  // Receiver check — match against any configured wallet
  if (validWallets.length > 0 && txData.to) {
    const matchedWallet = validWallets.find(
      (w) => w.address.toLowerCase() === txData.to.toLowerCase()
    );
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

  // Find or create user
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

  // Update discord info if missing
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
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8(publicKey),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );
    const message = new TextEncoder().encode(timestamp + body);
    const sigBytes = hexToUint8(signature);
    return await crypto.subtle.verify("Ed25519", key, sigBytes, message);
  } catch {
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
    {
      name: "verify",
      description: "Verify a crypto payment and add credits to your account",
      options: [{
        name: "txid",
        description: "The transaction ID (TX hash) from Binance or your crypto app",
        type: 3,
        required: true,
      }],
    },
    {
      name: "balance",
      description: "Check your current credit balance",
    },
    {
      name: "wallets",
      description: "Show the available wallet addresses for payments",
    },
    {
      name: "help",
      description: "Show how to use the bot",
    },
  ];

  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const errText = await response.text();
    return new Response(JSON.stringify({ error: `Discord API error: ${response.status}`, detail: errText }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, message: "Slash commands registered successfully." }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Discord interaction handler
// ---------------------------------------------------------------------------

async function handleDiscordInteraction(body: any): Promise<Response> {
  const interactionType = body.type;
  const discordUser = body.member?.user ?? body.user;
  const supabase = getSupabase();

  // PING (type 1) — must respond with type 1
  if (interactionType === 1) {
    return jsonResponse({ type: 1 });
  }

  // APPLICATION_COMMAND (type 2)
  if (interactionType === 2) {
    const commandName = body.data?.name;
    const username = discordUser?.username ?? "unknown";
    const discordUserId = discordUser?.id;

    if (commandName === "help") {
      return jsonResponse({
        type: 4,
        data: {
          embeds: [{
            title: "CryptoVerify Bot — Help",
            description: "Verify crypto payments and get credits automatically (1 USD = 1 credit).",
            color: 0x06b6d4,
            fields: [
              { name: "/wallets", value: "Show the available wallet addresses to send payments to." },
              { name: "/verify `txid`", value: "Paste a transaction ID from Binance or any crypto app. The bot checks the blockchain and adds credits if confirmed." },
              { name: "/balance", value: "Check your current credit balance." },
              { name: "/help", value: "Show this help message." },
            ],
            footer: { text: "Supports TRON (TRC20), Ethereum (ERC20), and BSC (BEP20)" },
          }],
        },
      });
    }

    if (commandName === "wallets") {
      const { data: walletsData } = await supabase.from("wallets").select("*");
      
      const validWallets = (walletsData || [])
        .filter((w: any) => w.address && w.address.trim().length > 0)
        .map((w: any) => {
          // Detectar la red automáticamente según el prefijo si no viene explícita
          const net = w.network || (w.address.startsWith("T") ? "TRON (TRC20)" : w.address.startsWith("0x") ? "Ethereum / BSC (ERC20/BEP20)" : "Crypto");
          return {
            name: `💳 ${w.name || "Wallet"}`,
            value: `🌐 Network: **${net}**\n\`${w.address.trim()}\``,
            inline: false,
          };
        });

      if (validWallets.length === 0) {
        return jsonResponse({
          type: 4,
          data: {
            embeds: [{
              title: "Payment Wallets",
              description: "There are currently no payment addresses configured.",
              color: 0x64748b,
            }],
          },
        });
      }

      return jsonResponse({
        type: 4,
        data: {
          embeds: [{
            title: "Payment Wallets",
            description: "Send your cryptocurrency payments to the corresponding network address below. Once sent, use `/verify <txid>` to get your credits.",
            color: 0x3b82f6,
            fields: validWallets,
          }],
        },
      });
    }

    if (commandName === "balance") {
      let user = null;
      if (discordUserId) {
        const { data } = await supabase.from("users").select("*").eq("discord_user_id", discordUserId).maybeSingle();
        user = data;
      }
      if (!user) {
        const { data } = await supabase.from("users").select("*").eq("username", username).maybeSingle();
        user = data;
      }

      const credits = user?.credits ?? 0;
      return jsonResponse({
        type: 4,
        data: {
          embeds: [{
            title: "Credit Balance",
            description: user
              ? `You currently have **${credits} credits**.`
              : `You don't have an account yet. Use \`/verify\` to make your first payment and create one automatically.`,
            color: credits > 0 ? 0x10b981 : 0x64748b,
          }],
        },
      });
    }

    if (commandName === "verify") {
      const txHash = body.data?.options?.find((o: any) => o.name === "txid")?.value;
      if (!txHash) {
        return jsonResponse({
          type: 4,
          data: { content: "Please provide a transaction ID. Usage: `/verify txid:<your-tx-id>`" },
        });
      }

      const result = await verifyTransaction(txHash, username, discordUserId, username);

      if (result.success) {
        const td = result.txData as BlockchainTransaction;
        return jsonResponse({
          type: 4,
          data: {
            embeds: [{
              title: "Payment Confirmed",
              description: result.message,
              color: 0x10b981,
              fields: [
                { name: "Amount", value: `${td.amount} ${td.tokenSymbol}`, inline: true },
                { name: "USD Value", value: `$${(result.usdValue ?? 0).toFixed(2)}`, inline: true },
                { name: "Credits Added", value: `+${result.creditsAdded}`, inline: true },
                { name: "Network", value: td.network, inline: true },
                { name: "New Balance", value: `${result.user?.credits ?? 0} credits`, inline: true },
                { name: "Wallet", value: td.receiverWallet || "Any", inline: true },
                { name: "TX Hash", value: `\`${txHash.slice(0, 20)}...\`` },
              ],
              footer: { text: "Payment verified on-chain" },
            }],
          },
        });
      } else {
        const color = result.status === 202 ? 0xf59e0b : 0xef4444;
        return jsonResponse({
          type: 4,
          data: {
            embeds: [{
              title: result.status === 202 ? "Payment Pending" : "Verification Failed",
              description: result.error,
              color,
            }],
          },
        });
      }
    }
  }

  return jsonResponse({ type: 4, data: { content: "Unknown command." } });
}

function jsonResponse(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    
    // Setup route: POST /setup to register slash commands
    const url = new URL(req.url);
    if (url.pathname.endsWith("/setup") && req.method === "POST") {
      const body = await req.json();
      const { botToken, appId, guildId } = body;
      if (!botToken || !appId) {
        return new Response(JSON.stringify({ error: "Bot token and App ID are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await registerSlashCommands(botToken, appId, guildId || "");
    }

    // Manual verify route: POST /verify (used by dashboard)
    if (url.pathname.endsWith("/verify") && req.method === "POST") {
      const body = await req.json();
      const result = await verifyTransaction(body.txHash, body.username);
      return new Response(JSON.stringify(result), {
        status: (result as any).status ?? 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Discord interaction (POST to base URL)
    if (req.method === "POST") {
      const rawBody = await req.text();
      const body = JSON.parse(rawBody);

      // Verify Discord signature if public key is configured
      const { data: pubKeySetting } = await supabase
        .from("settings").select("value").eq("key", "discord_public_key").maybeSingle();
      const publicKey = pubKeySetting?.value || "";

      if (publicKey) {
        const signature = req.headers.get("x-signature-ed25519") || "";
        const timestamp = req.headers.get("x-signature-timestamp") || "";
        const valid = await verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
        if (!valid) {
          return new Response(JSON.stringify({ error: "Invalid request signature" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return await handleDiscordInteraction(body);
    }

    // GET — health check
    return new Response(JSON.stringify({ status: "ok", bot: "CryptoVerify Discord Bot" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Main handler error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});