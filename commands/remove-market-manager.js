const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const queries = require('../db/queries');
const { hasRole } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-market-manager')
    .setDescription('移除市场经理权限')
    .addUserOption((option) => option.setName('user').setDescription('目标用户').setRequired(true))
    .addStringOption((option) => option.setName('email').setDescription('注册邮箱').setRequired(true)),
  async execute(interaction, { db, config, logMonitor }) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '请在服务器内使用此指令。', flags: MessageFlags.Ephemeral });
    }

    if (!hasRole(interaction, config.ownerRoleId)) {
      return interaction.reply({ content: '权限不足。', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user', true);
    const email = interaction.options.getString('email', true).trim().toLowerCase();

    let monitorMessage = `指令 /remove-market-manager 发起者 <@${interaction.user.id}> 目标 <@${targetUser.id}> 邮箱 ${email}`;

    try {
      const userRecord = await queries.getUserByEmail(db, email);
      if (!userRecord) {
        await interaction.reply({ content: '找不到该邮箱的用户。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：邮箱不存在`);
        return;
      }

      const resellers = await queries.getResellersByUserId(db, userRecord.id);
      if (!resellers.length) {
        await interaction.reply({ content: '该用户不是经销商。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：非经销商`);
        return;
      }

      const bound = resellers.find((reseller) => reseller.discord_id);
      if (!bound) {
        await interaction.reply({ content: '该账号尚未绑定。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：未绑定`);
        return;
      }

      await queries.updateResellerDiscordId(db, userRecord.id, null);
      await queries.setMarketManager(db, userRecord.id, false);

      try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        if (member && config.marketManagerRoleId) {
          await member.roles.remove(config.marketManagerRoleId);
        }
      } catch (error) {
        console.error('Failed to remove market manager role:', error);
      }

      await interaction.reply({ content: `已移除 ${targetUser} 的市场经理权限。`, flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 成功：product_id=${resellers.map((item) => item.product_id).join(',')}`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '处理失败，请稍后再试。', flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：系统错误`);
    }
  },
};
