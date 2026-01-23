const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const queries = require('../db/queries');
const { hasRole } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gain-market-manager')
    .setDescription('赋予市场经理权限')
    .addUserOption((option) => option.setName('user').setDescription('目标用户').setRequired(true))
    .addStringOption((option) => option.setName('email').setDescription('注册邮箱').setRequired(true)),
  async execute(interaction, { db, config, logMonitor }) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '请在服务器内使用此指令。', flags: MessageFlags.Ephemeral });
    }

    if (!hasRole(interaction, config.ownerRoleId)) {
      await interaction.reply({ content: '权限不足，仅限Owner操作。', flags: MessageFlags.Ephemeral });
      await logMonitor(`指令 /gain-market-manager 失败：无Owner权限 <@${interaction.user.id}>`);
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const email = interaction.options.getString('email', true).trim().toLowerCase();

    let monitorMessage = `指令 /gain-market-manager 发起者 <@${interaction.user.id}> 目标 <@${targetUser.id}> 邮箱 ${email}`;

    try {
      const userRecord = await queries.getUserByEmail(db, email);
      if (!userRecord) {
        await interaction.reply({ content: '找不到该邮箱的用户。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：邮箱不存在`);
        return;
      }

      const resellers = await queries.getResellersByUserId(db, userRecord.id);
      if (!resellers.length) {
        await interaction.reply({ content: '该用户不是经销商，请先到官网登记。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：非经销商`);
        return;
      }

      const isMarketManager = resellers.some((reseller) => reseller.is_market_manager === true);
      if (!isMarketManager) {
        await interaction.reply({ content: 'This account is not market manager', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：非市场经理`);
        return;
      }

      const alreadyBound = resellers.find((reseller) => reseller.discord_id);
      if (alreadyBound) {
        await interaction.reply({ content: '该账号已绑定。', flags: MessageFlags.Ephemeral });
        await logMonitor(
          `${monitorMessage} - 失败：已绑定 ${alreadyBound.discord_id ? `<@${alreadyBound.discord_id}>` : '未知'}`
        );
        return;
      }

      await queries.updateResellerDiscordId(db, userRecord.id, targetUser.id); 

      for (const reseller of resellers) {
        await queries.ensureResellerBalance(db, reseller.id, reseller.product_id);
      }

      try {
        const member = await interaction.guild.members.fetch(targetUser.id);
        if (member && config.marketManagerRoleId) {
          await member.roles.add(config.marketManagerRoleId);
        }
      } catch (error) {
        console.error('Failed to add market manager role:', error);
      }

      await interaction.reply({ content: `已为 ${targetUser} 开通市场经理权限。`, flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 成功：product_id=${resellers.map((item) => item.product_id).join(',')}`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '处理失败，请稍后再试。', flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：系统错误`);
    }
  },
};
