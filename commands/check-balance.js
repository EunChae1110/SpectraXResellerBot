const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const queries = require('../db/queries');

module.exports = {
  data: new SlashCommandBuilder().setName('check-balance').setDescription('查看自己的经销商余额'),
  async execute(interaction, { db, logMonitor }) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '请在服务器内使用此指令。', flags: MessageFlags.Ephemeral });
    }

    const discordId = interaction.user.id;
    let monitorMessage = `指令 /check-balance 发起者 <@${discordId}>`;

    try {
      const rows = await queries.getResellerBalancesByDiscordId(db, discordId);
      if (!rows.length) {
        await interaction.reply({ content: '你尚未绑定经销商身份。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：未绑定经销商`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('经销商余额')
        .setDescription(`用户：<@${discordId}>`)
        .setColor(0x5865f2)
        .setTimestamp(new Date());

      const summaryParts = [];

      for (const row of rows) {
        const day = row.day || 0;
        const week = row.week || 0;
        const month = row.month || 0;
        const lifetime = row.lifetime || 0;
        const productName = row.product_name || row.product_slug || row.product_id;

        embed.addFields({
          name: productName,
          value: `day: ${day}\nweek: ${week}\nmonth: ${month}\nlifetime: ${lifetime}`,
          inline: true,
        });

        summaryParts.push(
          `${row.product_slug || row.product_id} day=${day} week=${week} month=${month} lifetime=${lifetime}`
        );
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 成功：${summaryParts.join(' | ')}`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '处理失败，请稍后再试。', flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：系统错误`);
    }
  },
};
