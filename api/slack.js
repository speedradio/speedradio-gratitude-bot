import { verifySlackRequest, parseSlashCommand } from '../lib/slack-verify.js';
import { db } from '../lib/db.js';
import { buildThanksMessage, buildLeaderboardMessage, buildBalanceMessage } from '../lib/messages.js';
import { postToSlack, resolveUserIdsFromMentions } from '../lib/slack-client.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  // Read raw body for signature verification
  const rawBody = await getRawBody(req);
  const isValid = verifySlackRequest(req.headers, rawBody, process.env.SLACK_SIGNING_SECRET);
  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  const body = new URLSearchParams(rawBody.toString());
  const payload = parseSlashCommand(body);

  const { command, text, user_id, user_name, channel_id } = payload;

  try {
    let slashResponse;
    if (command === '/thanks') {
      slashResponse = await handleThanks({ text, user_id, user_name });
    } else if (command === '/gratitude-board') {
      slashResponse = await handleLeaderboard({ user_id });
    } else if (command === '/my-karma') {
      slashResponse = await handleBalance({ user_id });
    } else {
      slashResponse = {
        response_type: 'ephemeral',
        text: `Unknown command: ${command || '(empty)'}`,
      };
    }
    return res.status(200).json(slashResponse);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `❌ Something went wrong: ${err.message}`,
    });
  }
}

async function handleThanks({ text, user_id, user_name }) {
  // Parse: /thanks @alice @bob for fixing the deploy
  const mentionRegex = /<@([A-Z0-9]+)(?:\|[^>]+)?>/g;
  const plainMentionRegex = /(^|\s)@([a-z0-9._-]+)/gi;
  const recipients = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    recipients.push(match[1]);
  }

  if (recipients.length === 0) {
    const plainMentions = Array.from(text.matchAll(plainMentionRegex), m => m[2]);
    if (plainMentions.length > 0) {
      const { resolvedUserIds, unresolvedMentions } = await resolveUserIdsFromMentions(plainMentions);
      if (resolvedUserIds.length > 0) {
        recipients.push(...resolvedUserIds);
        console.info('Resolved plain @mentions in /thanks', {
          sender_id: user_id,
          sender_name: user_name,
          text,
          plain_mentions: plainMentions,
          resolved_user_ids: resolvedUserIds,
          unresolved_mentions: unresolvedMentions,
        });
      }
    }
  }

  if (recipients.length === 0) {
    const plainMentions = Array.from(text.matchAll(plainMentionRegex), m => m[2]);
    console.warn('Invalid /thanks command: missing recipient mention', {
      sender_id: user_id,
      sender_name: user_name,
      text,
      plain_mentions: plainMentions,
    });
    const hasPlainMention = plainMentions.length > 0;
    return {
      response_type: 'ephemeral',
      text: hasPlainMention
        ? '❌ I can see `@name` text, but Slack did not send a resolvable user mention. Please select a teammate from Slack mention autocomplete (so it becomes a true mention), then try again.'
        : '❌ Please mention at least one person. Usage: `/thanks @alice for saving the deploy! 🚀`',
    };
  }

  // Remove self-thanks
  const filteredRecipients = recipients.filter(r => r !== user_id);
  if (filteredRecipients.length === 0) {
    return {
      response_type: 'ephemeral',
      text: "😅 You can't thank yourself! Try thanking a teammate.",
    };
  }

  // Check karma balance
  const sender = await db.getOrCreateUser(user_id, user_name);
  const karmaPerPerson = 1;
  const totalCost = filteredRecipients.length * karmaPerPerson;

  if (sender.karma_balance < totalCost) {
    return {
      response_type: 'ephemeral',
      text: `💸 You don't have enough karma to send! Balance: *${sender.karma_balance}* karma. You need *${totalCost}*.`,
    };
  }

  const gratitudeChannel = process.env.GRATITUDE_CHANNEL_ID;
  if (!gratitudeChannel) {
    return {
      response_type: 'ephemeral',
      text: '❌ This workspace is missing the GRATITUDE_CHANNEL_ID setting. Ask an admin to configure the bot on the server.',
    };
  }

  // Extract the reason (text after all mentions)
  const reason = text
    .replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/g, '')
    .replace(/(^|\s)@[a-z0-9._-]+/gi, ' ')
    .replace(/^\s*(for\s+)?/i, '')
    .trim();

  for (const recipientId of filteredRecipients) {
    await db.getOrCreateUser(recipientId);
    await db.recordThanks({
      sender_id: user_id,
      recipient_id: recipientId,
      reason,
      karma_given: karmaPerPerson,
    });
  }

  // Deduct sender karma
  await db.deductKarma(user_id, totalCost);
  await db.incrementGiven(user_id, totalCost);

  const updatedSender = await db.getOrCreateUser(user_id);

  const message = buildThanksMessage({
    sender_id: user_id,
    sender_name: user_name,
    recipients: filteredRecipients,
    reason,
    karma_balance: updatedSender.karma_balance,
  });

  await postToSlack(gratitudeChannel, message);

  return {
    response_type: 'ephemeral',
    text: `✅ Posted to <#${gratitudeChannel}> — thanks for spreading gratitude!`,
  };
}

async function handleLeaderboard({ user_id }) {
  const topUsers = await db.getLeaderboard(10);
  const currentUser = await db.getOrCreateUser(user_id);
  return buildLeaderboardMessage(topUsers, currentUser, user_id);
}

async function handleBalance({ user_id }) {
  const user = await db.getOrCreateUser(user_id);
  return buildBalanceMessage(user);
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
