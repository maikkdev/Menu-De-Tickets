const { Client, GatewayIntentBits, Partials, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TICKET_ROLE_ID = 'ROL STAFF ID';
const TICKET_CATEGORY_ID = 'CATEGORIA ID';
const TRANSCRIPT_LOG_CHANNEL_ID = 'LOG CANAL ID';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const CATEGORY_NAMES = {
  soporte_tecnico: 'Soporte Técnico',
  compras: 'Compras',
  sugerencias: 'Sugerencias',
  reportar_usuario: 'Reportar Usuario',
  otro_no_mencionado: 'Otro No Mencionado',
};

client.once('ready', () => {
  console.log(`✅ Tickets Bot listo como ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild || !message.content.startsWith('!ticket')) return;

  const embed = new EmbedBuilder()
    .setTitle('🎫 Name | Tickets')
    .setDescription(
      'Bienvenido al sistema oficial de soporte de Name Serve.\n\n' +
      'Selecciona la categoría que mejor describa tu situación. Nuestro equipo de soporte te atenderá lo antes posible.\n\n' +
      '> Recuerda: Abusar del sistema de tickets puede resultar en sanciones.'
    )
    .setColor('#0099ff')
    .setImage('https://cdn.discordapp.com/attachments/1298130421569032192/1393832777581072414/iueWac-1.png')
    .setFooter({
      text: '© Server | Tickets',
      iconURL: 'https://'
    })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket-category')
    .setPlaceholder('Selecciona una categoría...')
    .addOptions(Object.entries(CATEGORY_NAMES).map(([value, label]) => ({
      label,
      description: `Consulta relacionada a: ${label}`,
      value,
      emoji: {
        soporte_tecnico: '🛠️',
        compras: '💳',
        sugerencias: '💡',
        reportar_usuario: '🚨',
        otro_no_mencionado: '🔒',
      }[value],
    })));

  const row = new ActionRowBuilder().addComponents(menu);
  await message.reply({ embeds: [embed], components: [row] });
});

async function sendTranscript(channel, user, categoryName, guild) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const transcript = messages
    .filter(m => !m.author.bot)
    .map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`)
    .reverse()
    .join('\n');

  const fileName = `transcript-${channel.id}.txt`;
  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, transcript || 'Sin mensajes.');

  const attachment = new AttachmentBuilder(filePath);
  const logChannel = guild.channels.cache.get(TRANSCRIPT_LOG_CHANNEL_ID);

  if (logChannel) {
    const embed = new EmbedBuilder()
      .setTitle('📄 Nuevo Transcript de Ticket')
      .setDescription(
        `**Usuario:** <@${user.id}> (${user.tag})\n` +
        `**Categoría:** ${categoryName}\n` +
        `**Canal:** #${channel.name}\n` +
        `**Ticket ID:** ${channel.id}`
      )
      .setColor('#2ecc71')
      .setTimestamp();

    await logChannel.send({ embeds: [embed], files: [attachment] });
  }

  fs.unlinkSync(filePath);
}

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket-category') {
    const category = interaction.values[0];
    const categoryName = CATEGORY_NAMES[category] || 'Ticket';

    const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.id}`);
    if (existing) {
      return interaction.reply({
        content: '❗ Ya tienes un ticket abierto. Usa el ticket existente.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.id}`,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      topic: `Ticket de ${interaction.user.tag} | Categoría: ${categoryName}`,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
        },
        {
          id: TICKET_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
        },
      ],
    });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket-claim').setLabel('Reclamar').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket-close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket Abierto - ${categoryName}`)
      .setDescription(
        `¡Hola <@${interaction.user.id}>! 👋\n\n` +
        `Has abierto un ticket en la categoría **${categoryName}**.\n\n` +
        `Un miembro del staff de **Server Name** te atenderá pronto.\n\n` +
        `Por favor, explica tu situación con el mayor detalle posible.`
      )
      .setColor('#0099ff')
      .setFooter({
        text: '© Server | Tickets',
        iconURL: 'https://'
      })
      .setTimestamp();

    await channel.send({ content: `<@${interaction.user.id}> <@&${TICKET_ROLE_ID}>`, embeds: [embed], components: [buttons] });
    await interaction.editReply({ content: `✅ ¡Tu ticket ha sido creado! ${channel}` });
  }

  if (interaction.isButton()) {
    const isStaff = interaction.member.roles.cache.has(TICKET_ROLE_ID);

    if (interaction.customId === 'ticket-claim') {
      if (!isStaff) return interaction.reply({ content: '❌ Solo el staff puede reclamar tickets.', ephemeral: true });

      const topic = interaction.channel.topic || '';
      if (topic.includes('Reclamado por')) {
        return interaction.reply({ content: '❗ Este ticket ya fue reclamado.', ephemeral: true });
      }

      await interaction.channel.setTopic(`${topic} | Reclamado por: <@${interaction.user.id}>`);

      const authorId = interaction.channel.permissionOverwrites.cache.find(po =>
        po.allow.has(PermissionFlagsBits.ViewChannel) &&
        po.id !== TICKET_ROLE_ID &&
        po.id !== interaction.guild.id
      )?.id;

      const newPerms = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: TICKET_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
        { id: authorId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
      ].filter(Boolean);

      await interaction.channel.permissionOverwrites.set(newPerms);

      const msg = await interaction.channel.messages.fetch({ limit: 10 }).then(msgs => msgs.find(m => m.components.length));
      if (msg) {
        const newRow = new ActionRowBuilder().addComponents(
          msg.components[0].components.map(comp =>
            comp.customId === 'ticket-claim'
              ? ButtonBuilder.from(comp).setDisabled(true)
              : ButtonBuilder.from(comp)
          )
        );
        await msg.edit({ components: [newRow] });
      }

      await interaction.reply({ content: `🎟️ Ticket reclamado por <@${interaction.user.id}>.`, ephemeral: false });
    }

    if (interaction.customId === 'ticket-transcript') {
      await interaction.deferReply({ ephemeral: true });
      const categoryName = interaction.channel.topic?.split('Categoría: ')[1]?.split('|')[0]?.trim() || 'Ticket';
      await sendTranscript(interaction.channel, interaction.user, categoryName, interaction.guild);
      await interaction.editReply({ content: '📄 Transcript enviado al canal de registros.' });
    }

    if (interaction.customId === 'ticket-close') {
      if (!isStaff) return interaction.reply({ content: '❌ Solo el staff puede cerrar los tickets.', ephemeral: true });

      await interaction.reply({ content: '✅ Este ticket se cerrará en 5 segundos...' });

      setTimeout(async () => {
        const categoryName = interaction.channel.topic?.split('Categoría: ')[1]?.split('|')[0]?.trim() || 'Ticket';
        await sendTranscript(interaction.channel, interaction.user, categoryName, interaction.guild);
        await interaction.channel.delete().catch(console.error);
      }, 5000);
    }
  }
});

client.login(process.env.TOKEN);
