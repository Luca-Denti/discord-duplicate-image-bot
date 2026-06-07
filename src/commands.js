const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('dupstats')
        .setDescription('Show duplicate statistics for the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('dupimport')
        .setDescription('Scan message history and add only missing images to the database')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('duplogs')
        .setDescription('Show the latest detected duplicates')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Number of results (default: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        )
];

module.exports = { commands };
