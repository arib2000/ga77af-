import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import cron from 'node-cron';
import fs from 'fs';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const STATE_FILE = './posted.json';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { posted: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getEpicFreeGames() {
  const url = `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US`;
  const res = await fetch(url);
  const data = await res.json();

  const elements = data?.data?.Catalog?.searchStore?.elements || [];

  return elements
    .filter(e => e?.promotions?.promotionalOffers?.length)
    .map(e => {
      const slug = e.productSlug || e.urlSlug;
      return {
        id: e.id,
        title: e.title,
        url: `https://store.epicgames.com/p/${slug}`
      };
    });
}

async function postFreeGames() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const state = loadState();
  const games = await getEpicFreeGames();

  const newGames = games.filter(g => !state.posted.includes(g.id));

  for (const game of newGames) {
    await channel.send(`🎮 FREE NOW: **${game.title}**\n${game.url}`);
    state.posted.push(game.id);
  }

  saveState(state);
}

client.once('ready', async () => {
  console.log(`Bot ready: ${client.user.tag}`);

  await postFreeGames();

  cron.schedule('0 */6 * * *', async () => {
    await postFreeGames();
  });
});

client.login(TOKEN);
