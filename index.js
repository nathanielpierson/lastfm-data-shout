require('dotenv').config();

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!LASTFM_API_KEY) {
  console.error('Missing LASTFM_API_KEY in .env');
  process.exit(1);
}

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

async function getArtistPlayCount(username, artistName) {
  const { data } = await axios.get(LASTFM_BASE, {
    params: {
      method: 'artist.getInfo',
      artist: artistName,
      username,
      api_key: LASTFM_API_KEY,
      format: 'json',
    },
  });
  if (data.error) throw new Error(data.message || `Last.fm API error: ${data.error}`);
  const artist = data.artist;
  if (!artist) throw new Error('Artist not found.');
  const userplaycount = artist.stats?.userplaycount;
  if (userplaycount === undefined) throw new Error('No play count for this user/artist.');
  return { artistName: artist.name, playCount: parseInt(userplaycount, 10) };
}

const artistPlaysCommand = new SlashCommandBuilder()
  .setName('artistplays')
  .setDescription("Look up a Last.fm user's play count for an artist")
  .addStringOption((opt) =>
    opt.setName('username').setDescription('Last.fm username').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('artist').setDescription('Artist name').setRequired(true)
  )
  .toJSON();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST().setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [artistPlaysCommand],
  });
  console.log('Slash command registered: /artistplays');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'artistplays') return;

  const username = interaction.options.getString('username');
  const artist = interaction.options.getString('artist');

  await interaction.deferReply();

  try {
    const { artistName, playCount } = await getArtistPlayCount(username, artist);
    await interaction.editReply(
      `**${username}** has **${playCount.toLocaleString()}** plays for **${artistName}**.`
    );
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Something went wrong.';
    await interaction.editReply(`Couldn't get play count: ${message}`);
  }
});

client.login(DISCORD_TOKEN);
