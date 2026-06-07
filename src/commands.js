const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('dupconfig')
        .setDescription('Configura le impostazioni del bot per il rilevamento duplicati')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option
                .setName('threshold')
                .setDescription('Soglia Hamming distance (default: 8)')
                .setMinValue(0)
                .setMaxValue(32)
        )
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Azione su duplicato')
                .addChoices(
                    { name: 'Solo notifica', value: 'notify' },
                    { name: 'Elimina messaggio', value: 'delete' },
                    { name: 'Timeout utente', value: 'timeout' }
                )
        )
        .addChannelOption(option =>
            option
                .setName('ignore_channel')
                .setDescription('Canale da ignorare')
        ),

    new SlashCommandBuilder()
        .setName('dupstats')
        .setDescription('Mostra statistiche duplicati nel server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('dupimport')
        .setDescription('Forza re-importazione immagini esistenti')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption(option =>
            option
                .setName('full')
                .setDescription('Importazione completa (ignora progresso precedente)')
        ),

    new SlashCommandBuilder()
        .setName('duplogs')
        .setDescription('Mostra ultimi duplicati rilevati')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Numero di risultati (default: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        )
];

module.exports = { commands };