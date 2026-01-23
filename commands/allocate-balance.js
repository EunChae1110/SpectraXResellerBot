const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const queries = require('../db/queries');
const { hasRole, parseBalanceDeltas, formatBalanceDelta } = require('../utils');
const { PRODUCT_SLUGS, PRODUCT_LABELS } = require('../db/schema');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allocate-balance')
    .setDescription('给经销商分配余额')
    .addUserOption((option) => option.setName('user').setDescription('目标用户').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('product')
        .setDescription('产品')
        .setRequired(true)
        .addChoices(
          { name: PRODUCT_LABELS[PRODUCT_SLUGS.FIVEM], value: PRODUCT_SLUGS.FIVEM },
          { name: PRODUCT_LABELS[PRODUCT_SLUGS.GTA_V], value: PRODUCT_SLUGS.GTA_V }
        )
    )
    .addIntegerOption((option) => option.setName('day').setDescription('天卡数量').setRequired(false))
    .addIntegerOption((option) => option.setName('week').setDescription('周卡数量').setRequired(false))
    .addIntegerOption((option) => option.setName('month').setDescription('月卡数量').setRequired(false))
    .addIntegerOption((option) => option.setName('lifetime').setDescription('永久卡数量').setRequired(false)),
  async execute(interaction, { db, config, logMonitor }) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '请在服务器内使用此指令。', flags: MessageFlags.Ephemeral });
    }

    if (!hasRole(interaction, config.ownerRoleId)) {
      return interaction.reply({ content: '权限不足。', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user', true);
    const productSlug = interaction.options.getString('product', true);
    const { deltas, error } = parseBalanceDeltas(interaction.options);
    let monitorMessage = `指令 /allocate-balance 发起者 <@${interaction.user.id}> 目标 <@${targetUser.id}> 产品 ${productSlug} 数量 ${formatBalanceDelta(deltas)}`;

    if (error) {
      await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：参数错误`);
      return;
    }

    try {
      const product = await queries.getProductBySlug(db, productSlug);
      if (!product) {
        await interaction.reply({ content: '找不到对应产品。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：产品不存在`);
        return;
      }

      const reseller = await queries.getResellerByDiscordAndProduct(db, targetUser.id, product.id);
      if (!reseller) {
        await interaction.reply({ content: '该用户尚未绑定经销商身份。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：未绑定经销商`);
        return;
      }

      await queries.ensureResellerBalance(db, reseller.id, product.id);
      await queries.incrementBalances(db, reseller.id, product.id, deltas);

      await interaction.reply({
        content: `已为 ${targetUser} 分配余额：${formatBalanceDelta(deltas)}。`,
        flags: MessageFlags.Ephemeral,
      });
      await logMonitor(`${monitorMessage} - 成功：${product.slug} ${formatBalanceDelta(deltas)}`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '处理失败，请稍后再试。', flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：系统错误`);
    }
  },
};
