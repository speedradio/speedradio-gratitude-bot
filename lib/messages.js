/**
 * Slack Block Kit message builders
 * Uses rich formatting, emoji "animations" (sequences), and visual flair
 */

const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];
const CONFETTI = ['🎉', '✨', '🎊', '💫', '⭐', '🌟', '🎈', '🏆'];
const THANKS_GIFS = [
  'https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif',
  'https://media.giphy.com/media/26gsjCZpPolPr3sBy/giphy.gif',
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
];

function randomConfetti(count = 5) {
  return Array.from({ length: count }, () => CONFETTI[Math.floor(Math.random() * CONFETTI.length)]).join(' ');
}

function rankEmoji(rank) {
  return MEDAL_EMOJIS[rank - 1] || `*${rank}.*`;
}

/**
 * Build the animated /thanks message
 */
export function buildThanksMessage({ sender_id, sender_name, recipients, reason, karma_balance }) {
  const recipientMentions = recipients.map(r => `<@${r}>`).join(', ');
  const confetti = randomConfetti(6);
  const hasReason = reason && reason.length > 0;

  const blocks = [
    // Animated header with confetti
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${confetti}\n\n*🙌 A wave of gratitude just landed!*\n\n${confetti}`,
      },
    },
    { type: 'divider' },
    // Main thank-you card
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${sender_id}> is sending *huge thanks* to ${recipientMentions} ✨${hasReason ? `\n\n> 💬 _"${reason}"_` : ''}`,
      },
    },
    { type: 'divider' },
    // Stats footer
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `💰 <@${sender_id}> has *${karma_balance}* karma remaining this month  •  🏅 Keep giving to climb the leaderboard!  •  \`/gratitude-board\` to see rankings`,
        },
      ],
    },
  ];

  // Rotating GIF for extra flair (1 in 3 chance)
  if (Math.random() < 0.33) {
    const gif = THANKS_GIFS[Math.floor(Math.random() * THANKS_GIFS.length)];
    blocks.splice(2, 0, {
      type: 'image',
      image_url: gif,
      alt_text: 'Celebration!',
    });
  }

  return {
    text: `🙌 ${sender_name} thanked ${recipientMentions}${hasReason ? ` — "${reason}"` : ''}`,
    blocks,
    unfurl_links: false,
  };
}

/**
 * Build the /gratitude-board leaderboard message
 */
export function buildLeaderboardMessage(topUsers, currentUser, viewingUserId) {
  if (!topUsers || topUsers.length === 0) {
    return {
      text: '📊 No gratitude given yet this month. Be the first! Use `/thanks @someone`',
      response_type: 'ephemeral',
    };
  }

  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const daysLeft = daysLeftInMonth();

  // Build leaderboard rows
  const rows = topUsers.map((user, i) => {
    const rank = i + 1;
    const medal = rankEmoji(rank);
    const champion = user.is_champion ? ' 👑' : '';
    const isViewer = user.user_id === viewingUserId ? ' ← _you_' : '';
    const name = user.user_name ? `<@${user.user_id}>` : `<@${user.user_id}>`;

    return `${medal}  ${name}${champion}   •   📤 *${user.karma_given}* given   📥 *${user.karma_received}* received   ⚡ *${user.combined_score}* total${isViewer}`;
  });

  const viewerRank = topUsers.findIndex(u => u.user_id === viewingUserId) + 1;
  const viewerInTop = viewerRank > 0;
  const viewerLine = viewerInTop
    ? ''
    : `\n\n_Your rank: not yet in top 10. Balance: *${currentUser.karma_balance}* karma — start giving!_`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🏆 Gratitude Leaderboard — ${monthName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_${daysLeft} day${daysLeft !== 1 ? 's' : ''} left this month • Ranked by karma given + received_`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: rows.join('\n\n') + viewerLine,
      },
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Use \`/thanks @name reason\` to give karma  •  \`/my-karma\` to check your balance`,
        },
      ],
    },
  ];

  return {
    text: `🏆 ${monthName} Leaderboard`,
    blocks,
    response_type: 'ephemeral',
  };
}

/**
 * Build /my-karma balance message
 */
export function buildBalanceMessage(user) {
  const bar = karmaBar(user.karma_balance, 50);
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💰 Your Karma Summary*\n\n${bar}\n\n*Balance:* ${user.karma_balance}/50 remaining\n*Given this month:* ${user.karma_given} ✨\n*Received this month:* ${user.karma_received} 💌\n*Leaderboard score:* ${user.karma_given + user.karma_received} ⚡`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Karma resets on the 1st of each month  •  Winner = highest *given + received* combined`,
        },
      ],
    },
  ];

  return { blocks, response_type: 'ephemeral', text: `Your karma balance: ${user.karma_balance}/50` };
}

/**
 * Build the monthly winner announcement
 */
export function buildWinnerMessage(winner) {
  const now = new Date();
  // Previous month name
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });

  const confetti = randomConfetti(8);

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🏆 ${prevMonth} Gratitude Champion!`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${confetti}\n\n*Drumroll please...* 🥁🥁🥁\n\n${confetti}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👑 *<@${winner.user_id}> is our ${prevMonth} Gratitude Champion!*\n\n📤 *${winner.karma_given}* karma given\n📥 *${winner.karma_received}* karma received\n⚡ *${winner.combined_score}* combined score\n\nThey will wear the 👑 badge until next month's winner is crowned.\n\n_A new month begins — everyone gets 50 fresh karma to give. Keep spreading the love!_ 💛`,
      },
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Karma reset • New month begins now • \`/thanks @name reason\` to start giving` },
      ],
    },
  ];

  return {
    text: `🏆 ${prevMonth} Gratitude Champion: <@${winner.user_id}>! 👑`,
    blocks,
  };
}

// --- Helpers ---

function daysLeftInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

function karmaBar(current, max) {
  const filled = Math.round((current / max) * 10);
  const empty = 10 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pct = Math.round((current / max) * 100);
  return `\`[${bar}] ${pct}%\``;
}
