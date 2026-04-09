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
