import crypto from 'crypto';

/**
 * Verifies that a request genuinely came from Slack
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(headers, rawBody, signingSecret) {
  const timestamp = headers['x-slack-request-timestamp'];
  const slackSignature = headers['x-slack-signature'];

  if (!timestamp || !slackSignature) return false;

  // Reject requests older than 5 minutes (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBaseString = `v0:${timestamp}:${rawBody.toString()}`;
  const mySignature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBaseString)
    .digest('hex')}`;

  const theirs = Buffer.from(String(Array.isArray(slackSignature) ? slackSignature[0] : slackSignature), 'utf8');
  const mine = Buffer.from(mySignature, 'utf8');
  if (theirs.length !== mine.length) return false;
  return crypto.timingSafeEqual(mine, theirs);
}

export function parseSlashCommand(body) {
  return {
    command: body.get('command'),
    text: body.get('text') || '',
    user_id: body.get('user_id'),
    user_name: body.get('user_name'),
    channel_id: body.get('channel_id'),
    team_id: body.get('team_id'),
    response_url: body.get('response_url'),
  };
}
