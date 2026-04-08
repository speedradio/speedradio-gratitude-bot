import { verifySlackRequest, parseSlashCommand } from '../lib/slack-verify.js';
import { db } from '../lib/db.js';
import { buildThanksMessage, buildLeaderboardMessage, buildBalanceMessage } from '../lib/messages.js';
import { postToSlack } from '../lib/slack-client.js';

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

  // Acknowledge Slack immediately (must respond within 3s)
  res.status(200).json({ response_type: 'ephemeral', text: '⏳ Processing...' });

  try {
    if (command === '/thanks') {
      await handleThanks({ text, user_id, user_name, channel_id });
    } else if (command === '/gratitude-board') {
      await handleLeaderboard({ user_id, channel_id });
    } else if (command === '/my-karma') {
      await handleBalance({ user_id, channel_id });
    }
  } catch (err) {
    console.error('Handler error:', err);
    await postToSlack(channel_id, { text: `❌ Something went wrong: ${err.message}` });
  }
}

async function handleThanks({ text, user_id, user_name, channel_id }) {
  // Parse: /thanks @alice @bob for fixing the deploy
  const mentionRegex = /<@([A-Z0-9]+)(?:\|[^>]+)?>/g;
  const recipients = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    recipients.push(match[1]);
  }

  if (recipients.length === 0) {
    await postToSlack(channel_id, {
      text: '❌ Please mention at least one person. Usage: `/thanks @alice for saving the deploy! 🚀`',
      response_type: 'ephemeral',
    });
    return;
  }

  // Remove self-thanks
  const filteredRecipients = recipients.filter(r => r !== user_id);
  if (filteredRecipients.length === 0) {
    await postToSlack(channel_id, { text: "😅 You can't thank yourself! Try thanking a teammate.", response_type: 'ephemeral' });
    return;
  }

  // Check karma balance
  const sender = await db.getOrCreateUser(user_id, user_name);
  const karmaPerPerson = 1;
  const totalCost = filteredRecipients.length * karmaPerPerson;

  if (sender.karma_balance < totalCost) {
    await postToSlack(channel_id, {
      text: `💸 You don't have enough karma to send! Balance: *${sender.karma_balance}* karma. You need *${totalCost}*.`,
      response_type: 'ephemeral',
    });
    return;
  }

  // Extract the reason (text after all mentions)
  const reason = text.replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/g, '').replace(/^\s*(for\s+)?/i, '').trim();

  // Process each recipient
  const recipientData = [];
  for (const recipientId of filteredRecipients) {
    const recipient = await db.getOrCreateUser(recipientId);
    await db.recordThanks({
      sender_id: user_id,
      recipient_id: recipientId,
      reason,
      karma_given: karmaPerPerson,
    });
    const updated = await db.getOrCreateUser(recipientId);
    recipientData.push({ id: recipientId, karma_received: updated.karma_received });
  }

  // Deduct sender karma
  await db.deductKarma(user_id, totalCost);
  await db.incrementGiven(user_id, totalCost);

  const updatedSender = await db.getOrCreateUser(user_id);

  // Post animated thank-you to gratitude channel
  const gratitudeChannel = process.env.GRATITUDE_CHANNEL_ID;
  const message = buildThanksMessage({
    sender_id: user_id,
    sender_name: user_name,
    recipients: filteredRecipients,
    reason,
    karma_balance: updatedSender.karma_balance,
  });

  await postToSlack(gratitudeChannel, message);
}

async function handleLeaderboard({ user_id, channel_id }) {
  const topUsers = await db.getLeaderboard(10);
  const currentUser = await db.getOrCreateUser(user_id);
  const message = buildLeaderboardMessage(topUsers, currentUser, user_id);
  await postToSlack(channel_id, message);
}

async function handleBalance({ user_id, channel_id }) {
  const user = await db.getOrCreateUser(user_id);
  const message = buildBalanceMessage(user);
  await postToSlack(channel_id, message);
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
