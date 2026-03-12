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

async function getWeeklyArtistPlayCount(username, artistName) {
  const { data } = await axios.get(LASTFM_BASE, {
    params: {
      method: 'user.getTopArtists',
      user: username,
      period: '7day',
      limit: 300,
      api_key: LASTFM_API_KEY,
      format: 'json',
    },
  });
  if (data.error) throw new Error(data.message || `Last.fm API error: ${data.error}`);
  const artists = data.topartists?.artist;
  if (!artists || !Array.isArray(artists)) return null;

  const target = artists.find(
    (a) => typeof a.name === 'string' && a.name.toLowerCase() === artistName.toLowerCase()
  );
  if (!target) return null;

  const plays = parseInt(target.playcount, 10);
  return Number.isNaN(plays) ? null : plays;
}

async function getAlbumPlayCount(username, artistName, albumName) {
  const { data } = await axios.get(LASTFM_BASE, {
    params: {
      method: 'album.getInfo',
      artist: artistName,
      album: albumName,
      username,
      api_key: LASTFM_API_KEY,
      format: 'json',
    },
  });
  if (data.error) throw new Error(data.message || `Last.fm API error: ${data.error}`);
  const album = data.album;
  if (!album) throw new Error('Album not found.');
  const userplaycount = album.userplaycount;
  if (userplaycount === undefined) throw new Error('No play count for this user/album.');
  const artistField = album.artist;
  const resolvedArtistName =
    typeof artistField === 'string' ? artistField : artistField?.name || artistName;
  return {
    artistName: resolvedArtistName,
    albumName: album.name,
    playCount: parseInt(userplaycount, 10),
  };
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

const albumPlaysCommand = new SlashCommandBuilder()
  .setName('albumplays')
  .setDescription("Look up a Last.fm user's play count for an album")
  .addStringOption((opt) =>
    opt.setName('username').setDescription('Last.fm username').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('artist').setDescription('Artist name').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('album').setDescription('Album name').setRequired(true)
  )
  .toJSON();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST().setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [artistPlaysCommand, albumPlaysCommand],
  });
  console.log('Slash commands registered: /artistplays, /albumplays');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  await interaction.deferReply();

  try {
    if (commandName === 'artistplays') {
      const username = interaction.options.getString('username');
      const artist = interaction.options.getString('artist');
      const { artistName, playCount } = await getArtistPlayCount(username, artist);
      let weeklySuffix = '';
      try {
        const weeklyPlays = await getWeeklyArtistPlayCount(username, artistName);
        if (weeklyPlays != null) {
          weeklySuffix = ` (+**${weeklyPlays.toLocaleString()}** listens since last week)`;
        }
      } catch {
        // Ignore weekly errors and just send the base message
      }
      await interaction.editReply(
        `**${username}** has **${playCount.toLocaleString()}** plays of **${artistName}**.${weeklySuffix}`
      );
    } else if (commandName === 'albumplays') {
      const username = interaction.options.getString('username');
      const artist = interaction.options.getString('artist');
      const album = interaction.options.getString('album');
      const { artistName, albumName, playCount } = await getAlbumPlayCount(
        username,
        artist,
        album
      );
      await interaction.editReply(
        `**${username}** has **${playCount.toLocaleString()}** plays of songs from the album **${albumName}** by **${artistName}**.`
      );
    }
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Something went wrong.';
    await interaction.editReply(`Couldn't get play count: ${message}`);
  }
});

client.login(DISCORD_TOKEN);
