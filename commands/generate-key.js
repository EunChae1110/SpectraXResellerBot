const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { randomUUID } = require('crypto');
const queries = require('../db/queries');
const { LICENSE_MASKS, PRODUCT_SLUGS, PRODUCT_LABELS } = require('../db/schema');
const {
  hasRole,
  parseSingleDuration,
  generateKeyFromMask,
  computeExpiresAt,
} = require('../utils');

const MAX_KEYS_PER_COMMAND = 100;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generate_key')
    .setDescription('生成授权码')
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
    const productSlug = interaction.options.getString('product', true);
    const { type, count, error } = parseSingleDuration(interaction.options);

    let monitorMessage = `指令 /generate_key 发起者 <@${interaction.user.id}> 产品 ${productSlug} 数量 ${type} x${count}`;

    if (error) {
      await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：参数错误`);
      return;
    }

    if (count > MAX_KEYS_PER_COMMAND) {
      await interaction.reply({
        content: `单次最多生成 ${MAX_KEYS_PER_COMMAND} 个授权码。`,
        flags: MessageFlags.Ephemeral,
      });
      await logMonitor(`${monitorMessage} - 失败：超过数量限制`);
      return;
    }

    try {
      const product = await queries.getProductBySlug(db, productSlug);
      if (!product) {
        await interaction.reply({ content: '找不到对应产品。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：产品不存在`);
        return;
      }

      const reseller = await queries.getResellerByDiscordAndProduct(db, interaction.user.id, product.id);
      const resellerList = await queries.getResellersByDiscordId(db, interaction.user.id);

      if (!reseller) {
        if (resellerList.length > 0) {
          await interaction.reply({ content: '产品不匹配，无法生成授权码。', flags: MessageFlags.Ephemeral });
          await logMonitor(`${monitorMessage} - 失败：产品不匹配`);
          return;
        }
        if (!isOwner) {
          await interaction.reply({ content: '你尚未绑定经销商身份。', flags: MessageFlags.Ephemeral });
          await logMonitor(`${monitorMessage} - 失败：未绑定经销商`);
          return;
        }
      }

      const mask = LICENSE_MASKS[product.slug] || LICENSE_MASKS[productSlug];
      if (!mask) {
        await interaction.reply({ content: '该产品无法生成授权码。', flags: MessageFlags.Ephemeral });
        await logMonitor(`${monitorMessage} - 失败：缺少授权码模板`);
        return;
      }
      const keys = [];
      const productId = reseller ? reseller.product_id : product.id;

      await db.withTransaction(async (client) => {
        if (reseller) {
          await queries.ensureResellerBalance(client, reseller.id, productId);
          const balance = await queries.getResellerBalance(client, reseller.id, productId);
          if ((balance?.[type] || 0) < count) {
            throw new Error('余额不足');
          }
          await queries.decrementBalances(client, reseller.id, productId, { [type]: count });
        }

        for (let i = 0; i < count; i += 1) {
          const key = generateKeyFromMask(mask);
          const id = randomUUID();
          const durationLabel = type;
          const expiresAt = computeExpiresAt(type, 1);
          const tier = type === 'lifetime' ? 'premium' : 'regular';
          const generatedBy = reseller ? reseller.user_id : null;
          await queries.insertProductKey(client, {
            id,
            productId,
            key,
            tier,
            duration: durationLabel,
            isUsed: false,
            usedBy: null,
            usedAt: null,
            generatedBy,
            expiresAt,
          });
          keys.push(key);
        }
      });

      const txtContent = keys.join('\n');
      const buffer = Buffer.from(txtContent, 'utf-8');
      const fileName = `keys_${productSlug}_${type}_${count}.txt`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });
      const monitorAttachment = new AttachmentBuilder(Buffer.from(txtContent, 'utf-8'), { name: fileName });

      await interaction.reply({
        content: `已生成授权码（${PRODUCT_LABELS[productSlug]}，${type} x${count}），详见附件：`,
        files: [attachment],
        flags: MessageFlags.Ephemeral,
      });

      await logMonitor(`${monitorMessage} - 成功：${product.slug} ${type} x${count}`, {
        files: [monitorAttachment],
      });
    } catch (error) {
      const message = error.message === '余额不足' ? '余额不足，无法生成授权码。' : '处理失败，请稍后再试。';
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      await logMonitor(`${monitorMessage} - 失败：${error.message}`);
    }
  },
};
