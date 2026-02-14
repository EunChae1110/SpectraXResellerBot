const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const queries = require('../db/queries');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check-key')
    .setDescription('查询授权码信息')
    .addStringOption((option) =>
      option.setName('key').setDescription('授权码').setRequired(true)
    ),
  async execute(interaction, { db, logMonitor }) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '请在服务器内使用此指令。', flags: MessageFlags.Ephemeral });
    }

    const key = interaction.options.getString('key', true).trim();
    const monitorMessage = `指令 /check-key 发起者 <@${interaction.user.id}> key=${key.substring(0, 20)}...`;

    try {
      const row = await queries.getProductKeyByKey(db, key);
      if (!row) {
        await interaction.reply({ content: '未找到该授权码。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：未找到`);
        return;
      }

      const productLabel = row.product_name || row.product_slug || '未知';
      const status = row.is_used ? '已使用' : '未使用';
      const statusColor = row.is_used ? 0xed4245 : 0x57f287;

      const usedInfo = row.is_used
        ? [
            row.used_user_email != null && `邮箱：${row.used_user_email}`,
            row.used_user_username != null && `用户名：${row.used_user_username}`,
            `使用时间：<t:${Math.floor(new Date(row.used_at).getTime() / 1000)}:F>`,
          ]
            .filter(Boolean)
            .join('\n')
        : '-';

      const expiresInfo = row.expires_at
        ? `<t:${Math.floor(new Date(row.expires_at).getTime() / 1000)}:F>`
        : '永久';

      const embed = new EmbedBuilder()
        .setTitle('授权码信息')
        .setColor(statusColor)
        .setTimestamp(new Date())
        .addFields(
          { name: '产品', value: productLabel, inline: true },
          { name: '时长', value: row.duration || '-', inline: true },
          { name: '等级', value: row.tier || '-', inline: true },
          { name: '状态', value: status, inline: true },
          { name: '到期时间', value: expiresInfo, inline: true },
          { name: '创建时间', value: `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:F>`, inline: true },
          { name: '使用信息', value: usedInfo, inline: false }
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 成功：${row.product_slug} ${status}`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '处理失败，请稍后再试。', flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：系统错误`);
    }
  },
};
