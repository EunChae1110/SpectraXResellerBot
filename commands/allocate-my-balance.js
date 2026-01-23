const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const queries = require('../db/queries');
const { hasRole, parseBalanceDeltas, formatBalanceDelta } = require('../utils');
const { PRODUCT_SLUGS, PRODUCT_LABELS } = require('../db/schema');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allocate-my-balance')
    .setDescription('使用自己的余额分配给其他经销商')
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

    const isOwner = hasRole(interaction, config.ownerRoleId);
    const isMarketManager = hasRole(interaction, config.marketManagerRoleId);
    if (!isOwner && !isMarketManager) {
      return interaction.reply({ content: '权限不足。', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('user', true);
    const productSlug = interaction.options.getString('product', true);
    const { deltas, error } = parseBalanceDeltas(interaction.options);
    let monitorMessage = `指令 /allocate-my-balance 发起者 <@${interaction.user.id}> 目标 <@${targetUser.id}> 产品 ${productSlug} 数量 ${formatBalanceDelta(deltas)}`;

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

      const senderReseller = await queries.getResellerByDiscordAndProduct(db, interaction.user.id, product.id);
      if (!senderReseller) {
        await interaction.reply({ content: '你尚未绑定此产品市场管理身份。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：发送者未绑定经销商`);
        return;
      }

      const targetReseller = await queries.getResellerByDiscordAndProduct(db, targetUser.id, product.id);
      if (!targetReseller) {
        await interaction.reply({ content: '目标用户尚未绑定经销商身份。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：目标未绑定经销商`);
        return;
      }

      await db.withTransaction(async (client) => {
        await queries.ensureResellerBalance(client, senderReseller.id, product.id);
        const senderBalance = await queries.getResellerBalance(client, senderReseller.id, product.id);

        const insufficient = Object.entries(deltas).find(([key, value]) => (senderBalance?.[key] || 0) < value);
        if (insufficient) {
          throw new Error('余额不足');
        }

        await queries.decrementBalances(client, senderReseller.id, product.id, deltas);
        await queries.ensureResellerBalance(client, targetReseller.id, product.id);
        await queries.incrementBalances(client, targetReseller.id, product.id, deltas);
      });

      await interaction.reply({
        content: `已成功分配余额给 ${targetUser}：${formatBalanceDelta(deltas)}。`,
        flags: MessageFlags.Ephemeral,
      });
      await logMonitor(`${monitorMessage} - 成功：${product.slug} ${formatBalanceDelta(deltas)}`);
    } catch (error) {
      const message = error.message === '余额不足' ? '余额不足，无法分配。' : '处理失败，请稍后再试。';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：${error.message}`);
    }
  },
};
