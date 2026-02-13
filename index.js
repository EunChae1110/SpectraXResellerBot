require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
} = require('discord.js');

const db = require('./db');

const config = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  ownerRoleId: process.env.DISCORD_OWNER_ROLE_ID,
  marketManagerRoleId: process.env.DISCORD_MARKET_MANAGER_ROLE_ID,
  monitorChannelId: process.env.DISCORD_MONITOR_CHANNEL_ID,
};

if (!config.token || !config.guildId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_GUILD_ID in environment.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if (command?.data && command?.execute) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`Command file ${filePath} missing data or execute.`);
  }
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = client.commands.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body });
  console.log(`Registered ${body.length} guild commands.`);
}

async function logMonitor(message, options = {}) {
  if (!config.monitorChannelId) return;
  try {
    const channel = await client.channels.fetch(config.monitorChannelId);
    if (channel && channel.isTextBased()) {
      await channel.send({ content: message, ...options });
    }
  } catch (error) {
    console.error('Failed to log monitor message:', error);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, { db, config, logMonitor });
  } catch (error) {
    console.error(error);
    const message = { content: '指令执行出现错误，请稍后再试。', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message);
    } else {
      await interaction.reply(message);
    }
  }
});

client.login(config.token);
