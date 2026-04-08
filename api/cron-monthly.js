import { db } from '../lib/db.js';
import { buildWinnerMessage } from '../lib/messages.js';
import { postToSlack } from '../lib/slack-client.js';

export default async function handler(req, res) {
  // Protect with a secret token
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const winner = await db.getMonthlyWinner();
    const gratitudeChannel = process.env.GRATITUDE_CHANNEL_ID;

    if (winner) {
      const message = buildWinnerMessage(winner);
      await postToSlack(gratitudeChannel, message);

      // Mark winner in DB
      await db.setMonthlyWinner(winner.user_id);
    } else {
      await postToSlack(gratitudeChannel, {
        text: '📊 *End of Month* — Not enough activity this month to crown a winner. Keep spreading gratitude! 🌟',
      });
    }

    // Reset karma balances for new month
    await db.resetMonthlyKarma();

    res.status(200).json({ ok: true, winner: winner?.user_id || null });
  } catch (err) {
    console.error('Cron error:', err);
    res.status(500).json({ error: err.message });
  }
}
