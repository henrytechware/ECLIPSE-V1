'use strict';

/*
 * ============================================================
 * ECLIPSE WHATSAPP CHANNEL FOLLOWER
 * ============================================================
 */

const CHANNELS = [
  {
    name: 'MR. RYANS DOMAIN',
    jid: '120363421028376752@newsletter',
  },

  {
    name: 'NEMESIS PRIME TECH',
    jid: '120363428608179723@newsletter',
  },

  {
    name: 'MR RYAN',
    jid: '120363421028376752@newsletter',
  },
];

/*
 * Follow all configured WhatsApp Channels.
 */
async function followChannels(sock) {
  if (!sock) {
    throw new Error(
      'WhatsApp socket is missing.'
    );
  }

const inviteCode = '0029VbBCc1d3wtbGeD6i602V';

try {
  const metadata = await sock.newsletterMetadata(
    'invite',
    inviteCode
  );

  console.log('Channel name:', metadata?.name);
  console.log('Channel JID:', metadata?.id);
  console.log('Subscribers:', metadata?.subscribers);
} catch (error) {
  console.error('Failed to get channel metadata:', error);
}

  if (
    typeof sock.newsletterFollow !==
    'function'
  ) {
    console.warn(
      '[CHANNEL FOLLOWER] newsletterFollow() is not available in this Baileys version.'
    );

    return {
      supported: false,
      followed: [],
      failed: CHANNELS,
    };
  }

  const followed = [];
  const failed = [];

  for (const channel of CHANNELS) {
    try {

      await sock.newsletterFollow(
        channel.jid
      );

      followed.push(channel);

      console.log(
        `[CHANNEL FOLLOWER] Followed: ${channel.name}`
      );

    } catch (error) {

      failed.push({
        ...channel,
        error:
          error?.message ||
          String(error),
      });

      console.error(
        `[CHANNEL FOLLOWER] Failed: ${channel.name}`,
        error?.message ||
        error
      );
    }
  }

  return {
    supported: true,
    followed,
    failed,
  };
}

module.exports = {
  CHANNELS,
  followChannels,
};