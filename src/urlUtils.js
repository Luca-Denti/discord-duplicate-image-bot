const DISCORD_ATTACHMENT_HOSTS = new Set([
    'cdn.discordapp.com',
    'media.discordapp.net'
]);

function getStableImageIdentity(imageUrl) {
    if (typeof imageUrl !== 'string' || !imageUrl) return null;

    try {
        const parsed = new URL(imageUrl);

        if (
            DISCORD_ATTACHMENT_HOSTS.has(parsed.hostname.toLowerCase()) &&
            parsed.pathname.startsWith('/attachments/')
        ) {
            return `discord-attachment:${parsed.pathname}`;
        }

        return parsed.href;
    } catch {
        return imageUrl;
    }
}

function imageUrlsMatch(firstUrl, secondUrl) {
    const firstIdentity = getStableImageIdentity(firstUrl);
    const secondIdentity = getStableImageIdentity(secondUrl);

    return Boolean(firstIdentity && secondIdentity && firstIdentity === secondIdentity);
}

module.exports = {
    getStableImageIdentity,
    imageUrlsMatch
};
