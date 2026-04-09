const SLACK_API = 'https://slack.com/api';

/** chat.postMessage does not accept response_type (slash-command only); strip it if present. */
export async function postToSlack(channel, message) {
  const { response_type: _ignored, ...rest } = message;
  const payload = {
    channel,
    ...rest,
  };

  const response = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
  return data;
}

export async function getUserInfo(userId) {
  const response = await fetch(`${SLACK_API}/users.info?user=${userId}`, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  });
  const data = await response.json();
  return data.ok ? data.user : null;
}

/**
 * Resolve plain @mentions (e.g., "alice") to Slack user IDs.
 * Tries username + display name matches for active human users.
 */
export async function resolveUserIdsFromMentions(mentions = []) {
  const requested = Array.from(
    new Set(
      mentions
        .map(m => String(m || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (requested.length === 0) {
    return { resolvedUserIds: [], unresolvedMentions: [] };
  }

  const response = await fetch(`${SLACK_API}/users.list?limit=1000`, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  });
  const data = await response.json();
  if (!data.ok || !Array.isArray(data.members)) {
    throw new Error(`Slack API error: ${data.error || 'users_list_failed'}`);
  }

  const nameToUserId = new Map();
  for (const member of data.members) {
    if (!member || member.deleted || member.is_bot || member.id === 'USLACKBOT') continue;

    const candidates = [
      member.name,
      member.profile?.display_name,
      member.profile?.display_name_normalized,
      member.profile?.real_name,
      member.profile?.real_name_normalized,
    ]
      .map(v => String(v || '').trim().toLowerCase())
      .filter(Boolean);

    for (const candidate of candidates) {
      if (!nameToUserId.has(candidate)) {
        nameToUserId.set(candidate, member.id);
      }
    }
  }

  const resolvedUserIds = [];
  const unresolvedMentions = [];
  for (const mention of requested) {
    const userId = nameToUserId.get(mention);
    if (userId) {
      resolvedUserIds.push(userId);
    } else {
      unresolvedMentions.push(mention);
    }
  }

  return { resolvedUserIds: Array.from(new Set(resolvedUserIds)), unresolvedMentions };
}
