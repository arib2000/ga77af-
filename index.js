import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import cron from "node-cron";
import * as cheerio from "cheerio";
import fs from "fs";

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// كل قداش يشيّك (كل 3 ساعات)
const CRON_EXPR = "*/1 * * * *";

// ملف بسيط ضد التكرار (يرجع يصفّر كي تعمل redeploy)
const STATE_FILE = "./posted.json";
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return { posted: [] }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ---------- EPIC FREE GAMES ---------- */
async function getEpicFreeGames() {
  // Endpoint معروف يخدم JSON للـ free games
  const url =
    "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Epic HTTP ${res.status}`);
  const data = await res.json();

  const elements = data?.data?.Catalog?.searchStore?.elements || [];
  return elements
    .filter((e) => e?.promotions?.promotionalOffers?.length)
    .map((e) => {
      const slug = e.productSlug || e.urlSlug || e.offerMappings?.[0]?.pageSlug;
      return {
        id: `epic-${e.id}`,
        title: e.title,
        url: slug ? `https://store.epicgames.com/p/${slug}` : "https://store.epicgames.com/free-games",
        store: "Epic",
      };
    });
}

/* ---------- STEAM FREE PROMOTIONS (SteamDB) ---------- */
async function getSteamFreePromos() {
  const url = "https://steamdb.info/upcoming/free/"; // Free promotions :contentReference[oaicite:1]{index=1}
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`SteamDB HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const promos = [];
  $("table tbody tr").each((_, tr) => {
    const link = $(tr).find('a[href^="/app/"]').first();
    const href = link.attr("href"); // /app/12345/
    const appid = href?.split("/").filter(Boolean)?.[1];
    if (!appid) return;

    const tds = $(tr).find("td");
    const name = $(tds[1]).text().trim() || `App ${appid}`;
    const type = $(tds[2]).text().trim() || "Promo";
    const ends = $(tds[4]).text().trim() || "";

    promos.push({
      id: `steam-${appid}-${type}-${ends}`,
      title: name,
      url: `https://store.steampowered.com/app/${appid}/`,
      store: `Steam (${type})`,
    });
  });

  return promos;
}

async function postNewFreeStuff() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel?.isTextBased()) throw new Error("CHANNEL_ID invalid / not a text channel");

  const state = loadState();

  const [epic, steam] = await Promise.all([
    getEpicFreeGames(),
    getSteamFreePromos(),
  ]);

  const all = [...epic, ...steam];

  const fresh = all.filter((x) => !state.posted.includes(x.id));
  if (!fresh.length) {
    console.log("No new freebies.");
    return;
  }

  for (const item of fresh.slice(0, 10)) {
    const embed = new EmbedBuilder()
      .setTitle(item.title)
      .setURL(item.url)
      .setDescription(`🎁 **Free now** on **${item.store}**`);

    await channel.send({ embeds: [embed] });
    state.posted.push(item.id);
  }

  state.posted = state.posted.slice(-300);
  saveState(state);

  console.log(`Posted ${fresh.length} new freebies.`);
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // أول check وقت يبدأ
  try { await postNewFreeStuff(); } catch (e) { console.error(e); }

  // ومن بعد بالكرون
  cron.schedule(CRON_EXPR, async () => {
    try { await postNewFreeStuff(); } catch (e) { console.error(e); }
  });
});

client.login(TOKEN);
