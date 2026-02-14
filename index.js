import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const STEAMDB_URL = "https://steamdb.info/upcoming/free/";

async function getFreeGames() {
  const res = await fetch(STEAMDB_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  const games = [];

  $("table tbody tr").each((_, row) => {
    const link = $(row).find('a[href^="/app/"]').first();
    const href = link.attr("href");
    if (!href) return;

    const appid = href.split("/")[2];
    const name = link.text().trim();

    games.push({
      id: appid,
      name,
      url: `https://store.steampowered.com/app/${appid}/`,
    });
  });

  return games;
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID);
  const games = await getFreeGames();

  for (const game of games.slice(0, 5)) {
    const embed = new EmbedBuilder()
      .setTitle(game.name)
      .setURL(game.url)
      .setDescription("🔥 Free on Steam (limited time)");

    await channel.send({ embeds: [embed] });
  }
});

client.login(TOKEN);
