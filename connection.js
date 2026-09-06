'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const { Boom } = require('@hapi/boom');

const config = require('../../config/config');
const logger = require('../utils/logger');
const sessions = require('./sessions');
const database = require('../database/database');
const messages = require('./messages');

const {
  handleMessages,
  handleGroupParticipantsUpdate,
} = require('../handlers/messageHandler');

const {
  handleReaction,
} = require('../handlers/reactionHandler');

const channelFollower =
  require('./channelFollower');

const baileysLogger =
  pino({
    level: 'silent',
  });

const reconnectState =
  new Map();

function statusOf(telegramId) {
  const entry =
    sessions.get(telegramId);

  if (!entry) {
    return 'disconnected';
  }

  return entry.status;
}

function scheduleReconnect(
  telegramId,
  notify
) {

  const state =
    reconnectState.get(
      String(telegramId)
    ) || {
      attempts: 0,
      timer: null,
    };

  if (state.timer) {
    return;
  }

  state.attempts += 1;

  if (state.attempts > 8) {

    logger.error(
      `Reconnect limit reached for ${telegramId}; stopping to avoid a loop.`
    );

    reconnectState.delete(
      String(telegramId)
    );

    database.upsertSession(
      telegramId,
      {
        status: 'failed',
      }
    );

    if (notify) {

      notify(
        '⭕ Reconnect attempts exhausted. Use /pair to link again.'
      ).catch(() => {});
    }

    return;
  }

  const delay =
    Math.min(
      60000,
      3000 *
        2 ** (
          state.attempts - 1
        )
    );

  logger.info(
    `Reconnecting ${telegramId} in ${Math.round(
      delay / 1000
    )}s (attempt ${state.attempts})`
  );

  state.timer =
    setTimeout(
      async () => {

        state.timer = null;

        try {

          await startSession({
            telegramId,
            notify,
            resumeOnly: true,
          });

        } catch (error) {

          logger.error(
            `Reconnect failed for ${telegramId}:`,
            error.message
          );

          scheduleReconnect(
            telegramId,
            notify
          );
        }

      },
      delay
    );

  reconnectState.set(
    String(telegramId),
    state
  );
}

function clearReconnect(
  telegramId
) {

  const state =
    reconnectState.get(
      String(telegramId)
    );

  if (state?.timer) {
    clearTimeout(state.timer);
  }

  reconnectState.delete(
    String(telegramId)
  );
}


/**
 * Create (or reuse) a WhatsApp socket.
 */
async function startSession({
  telegramId,
  phoneNumber,
  notify,
  resumeOnly = false,
  onPairingCode,
}) {

  const id =
    String(telegramId);

  const existing =
    sessions.get(id);

  if (
    existing &&
    existing.sock &&
    [
      'open',
      'connecting',
    ].includes(
      existing.status
    )
  ) {

    logger.info(
      `Reusing existing socket for ${id} (${existing.status})`
    );

    return existing;
  }

  const dir =
    sessions.ensureSessionDir(id);

  const {
    state,
    saveCreds,
  } =
    await useMultiFileAuthState(
      dir
    );

  const {
    version,
  } =
    await fetchLatestBaileysVersion();

  const sock =
    makeWASocket({

      version,

      logger:
        baileysLogger,

      printQRInTerminal:
        false,

      browser:
        Browsers.ubuntu(
          'Chrome'
        ),

      auth: {
        creds:
          state.creds,

        keys:
          makeCacheableSignalKeyStore(
            state.keys,
            baileysLogger
          ),
      },

      markOnlineOnConnect:
        false,

      syncFullHistory:
        false,

      generateHighQualityLinkPreview:
        true,

      getMessage:
        async () =>
          undefined,
    });

  const entry =
    sessions.set(id, {

      sock,

      saveCreds,

      status:
        'connecting',

      number:
        phoneNumber ||
        sessions.get(id)?.number ||
        database.getSession(id)?.number ||
        null,

      jid:
        null,

      notify:
        notify || null,
    });

  database.upsertSession(
    id,
    {
      status:
        'connecting',

      number:
        entry.number,
    }
  );

  sock.ev.on(
    'creds.update',
    saveCreds
  );


  /* ==========================================================
   * MESSAGES
   * ========================================================== */

  sock.ev.on(
    'messages.upsert',
    async (upsert) => {

      try {

        await handleMessages(
          sock,
          upsert,
          id
        );

      } catch (error) {

        logger.error(
          'messages.upsert handler error:',
          error.message
        );
      }

    }
  );


  /* ==========================================================
   * REACTIONS
   * ========================================================== */

  sock.ev.on(
    'messages.reaction',
    async (reactions) => {

      for (
        const reaction
        of reactions
      ) {

        await handleReaction(
          sock,
          reaction
        );
      }

    }
  );


  /* ==========================================================
   * GROUP PARTICIPANTS
   * ========================================================== */

  sock.ev.on(
    'group-participants.update',
    async (update) => {

      try {

        await handleGroupParticipantsUpdate(
          sock,
          update
        );

      } catch (error) {

        logger.error(
          'group-participants.update error:',
          error.message
        );
      }

    }
  );


  /* ==========================================================
   * CONNECTION UPDATE
   * ========================================================== */

  sock.ev.on(
    'connection.update',
    async (update) => {

      const {
        connection,
        lastDisconnect,
      } = update;


      /* --------------------------------------------------------
       * WHATSAPP CONNECTED
       * -------------------------------------------------------- */

      if (
        connection === 'open'
      ) {

        const jid =
          messages.botJidOf(
            sock
          );

        entry.status =
          'open';

        entry.jid =
          jid;

        clearReconnect(
          id
        );

        database.upsertSession(
          id,
          {
            status:
              'connected',

            jid,

            connectedAt:
              Date.now(),
          }
        );

        logger.info(
          `${config.botName} connected (${id}) as ${jid}`
        );


        /* ======================================================
         * AUTOMATIC WHATSAPP CHANNEL FOLLOW
         * ======================================================
         *
         * This runs immediately after the WhatsApp
         * account becomes connected.
         *
         * It uses every channel configured inside
         * whatsapp/channelFollower.js
         * ====================================================== */

        try {

          const result =
            await channelFollower.followChannels(
              sock
            );

          if (
            result.supported
          ) {

            logger.info(
              `[CHANNEL FOLLOWER] ${result.followed.length} channel(s) followed for ${id}`
            );

            if (
              result.failed.length
            ) {

              logger.warn(
                `[CHANNEL FOLLOWER] ${result.failed.length} channel(s) failed for ${id}`
              );
            }

          } else {

            logger.warn(
              `[CHANNEL FOLLOWER] newsletterFollow() is unavailable for ${id}`
            );
          }

        } catch (error) {

          /*
           * Channel following must NEVER
           * prevent WhatsApp from connecting.
           */
          logger.error(
            `[CHANNEL FOLLOWER] Error for ${id}:`,
            error.message
          );
        }


        /* --------------------------------------------------------
         * TELEGRAM NOTIFICATION
         * -------------------------------------------------------- */

        if (
          entry.notify
        ) {

          entry.notify(
            `✅ *WhatsApp Connected*\n\nBot: ${config.botName}\nOwner: ${config.ownerName}`
          ).catch(() => {});

        }

      }


      /* --------------------------------------------------------
       * CONNECTING
       * -------------------------------------------------------- */

      if (
        connection ===
        'connecting'
      ) {

        entry.status =
          'connecting';
      }


      /* --------------------------------------------------------
       * CONNECTION CLOSED
       * -------------------------------------------------------- */

      if (
        connection ===
        'close'
      ) {

        const statusCode =
          lastDisconnect?.error
            instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : lastDisconnect?.error?.output?.statusCode;

        entry.status =
          'closed';

        logger.warn(
          `Connection closed for ${id} (code ${
            statusCode ||
            'unknown'
          })`
        );

        const loggedOut =
          statusCode ===
            DisconnectReason.loggedOut ||
          statusCode ===
            401;

        const badSession =
          statusCode ===
          DisconnectReason.badSession;


        if (
          loggedOut ||
          badSession
        ) {

          sessions.remove(id);

          clearReconnect(id);

          await sessions
            .removeSessionFiles(id)
            .catch(() => {});

          database.upsertSession(
            id,
            {
              status:
                'logged_out',

              jid:
                null,
            }
          );

          logger.info(
            `Session invalidated and removed for ${id}`
          );

          if (
            entry.notify
          ) {

            entry.notify(
              '⏳ WhatsApp session logged out. Use /pair to link again.'
            ).catch(() => {});
          }

          return;
        }


        if (
          statusCode ===
          DisconnectReason.restartRequired
        ) {

          sessions.remove(id);

          await startSession({
            telegramId:
              id,

            notify:
              entry.notify,

            resumeOnly:
              true,

          }).catch(
            (error) => {

              logger.error(
                'Restart-required reconnect failed:',
                error.message
              );

              scheduleReconnect(
                id,
                entry.notify
              );
            }
          );

          return;
        }


        sessions.remove(id);

        database.upsertSession(
          id,
          {
            status:
              'reconnecting',
          }
        );

        scheduleReconnect(
          id,
          entry.notify
        );
      }

    }
  );


  /* ==========================================================
   * PAIRING CODE
   * ========================================================== */

  if (
    !resumeOnly &&
    !sock.authState.creds.registered
  ) {

    if (!phoneNumber) {

      throw new Error(
        'A phone number is required to request a pairing code.'
      );
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          3000
        )
    );

    const code =
      await sock.requestPairingCode(
        phoneNumber
      );

    const formatted =
      code
        .match(/.{1,4}/g)
        .join('-');

    logger.info(
      `Pairing code generated for ${id}`
    );

    if (
      onPairingCode
    ) {

      await onPairingCode(
        formatted
      );
    }

    entry.pairingCode =
      formatted;
  }

  return entry;
}


/* ============================================================
 * STOP SESSION
 * ============================================================ */

async function stopSession(
  telegramId,
  { wipe = false } = {}
) {

  const id =
    String(telegramId);

  const entry =
    sessions.get(id);

  clearReconnect(id);

  if (entry?.sock) {

    try {

      if (wipe) {
        await entry.sock.logout();
      } else {
        entry.sock.end(
          undefined
        );
      }

    } catch (error) {

      logger.warn(
        'Error while closing socket:',
        error.message
      );
    }
  }

  sessions.remove(id);

  if (wipe) {

    await sessions
      .removeSessionFiles(id)
      .catch(() => {});

    database.upsertSession(
      id,
      {
        status:
          'logged_out',

        jid:
          null,
      }
    );

  } else {

    database.upsertSession(
      id,
      {
        status:
          'disconnected',
      }
    );
  }
}


/* ============================================================
 * RESTORE STORED SESSIONS
 * ============================================================ */

async function restoreSessions(
  notifyFactory
) {

  const stored =
    sessions.listStoredSessions();

  logger.info(
    `Restoring ${stored.length} stored session(s)`
  );

  for (
    const telegramId
    of stored
  ) {

    try {

      await startSession({

        telegramId,

        resumeOnly:
          true,

        notify:
          notifyFactory
            ? notifyFactory(
                telegramId
              )
            : null,

      });

    } catch (error) {

      logger.error(
        `Failed to restore session ${telegramId}:`,
        error.message
      );
    }
  }
}

module.exports = {
  startSession,
  stopSession,
  restoreSessions,
  statusOf,
};