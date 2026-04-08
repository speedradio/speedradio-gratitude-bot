/**
 * Database layer using Vercel KV (Redis)
 * Keys:
 *   user:{user_id}           → { user_id, user_name, karma_balance, karma_given, karma_received, is_champion }
 *   thanks:{id}              → { sender_id, recipient_id, reason, karma_given, created_at }
 *   leaderboard              → sorted set (score = karma_given + karma_received)
 *   all_users                → set of all user_ids
 *   monthly_winner           → user_id of current month's winner
 */

import { kv } from '@vercel/kv';

const STARTING_KARMA = 50;

export const db = {
  async getOrCreateUser(userId, userName = null) {
    const key = `user:${userId}`;
    let user = await kv.get(key);

    if (!user) {
      user = {
        user_id: userId,
        user_name: userName || userId,
        karma_balance: STARTING_KARMA,
        karma_given: 0,
        karma_received: 0,
        is_champion: false,
        created_at: new Date().toISOString(),
      };
      await kv.set(key, user);
      await kv.sadd('all_users', userId);
    } else if (userName && user.user_name !== userName) {
      user.user_name = userName;
      await kv.set(key, user);
    }

    return user;
  },

  async recordThanks({ sender_id, recipient_id, reason, karma_given }) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const thanks = { id, sender_id, recipient_id, reason, karma_given, created_at: new Date().toISOString() };

    await kv.set(`thanks:${id}`, thanks);

    // Update recipient
    const recipientKey = `user:${recipient_id}`;
    const recipient = await kv.get(recipientKey);
    if (recipient) {
      recipient.karma_received = (recipient.karma_received || 0) + karma_given;
      await kv.set(recipientKey, recipient);
    }

    // Update leaderboard scores
    await this._updateLeaderboardScore(sender_id);
    await this._updateLeaderboardScore(recipient_id);

    return thanks;
  },

  async deductKarma(userId, amount) {
    const key = `user:${userId}`;
    const user = await kv.get(key);
    if (user) {
      user.karma_balance = Math.max(0, (user.karma_balance || 0) - amount);
      await kv.set(key, user);
    }
  },

  async incrementGiven(userId, amount) {
    const key = `user:${userId}`;
    const user = await kv.get(key);
    if (user) {
      user.karma_given = (user.karma_given || 0) + amount;
      await kv.set(key, user);
      await this._updateLeaderboardScore(userId);
    }
  },

  async _updateLeaderboardScore(userId) {
    const user = await kv.get(`user:${userId}`);
    if (user) {
      const score = (user.karma_given || 0) + (user.karma_received || 0);
      await kv.zadd('leaderboard', { score, member: userId });
    }
  },

  async getLeaderboard(limit = 10) {
    // Get top users by combined score (descending)
    const entries = await kv.zrange('leaderboard', 0, limit - 1, { rev: true, withScores: true });

    const users = [];
    for (let i = 0; i < entries.length; i += 2) {
      const userId = entries[i];
      const score = entries[i + 1];
      const user = await kv.get(`user:${userId}`);
      if (user) {
        users.push({ ...user, combined_score: score, rank: users.length + 1 });
      }
    }
    return users;
  },

  async getUserRank(userId) {
    const rank = await kv.zrevrank('leaderboard', userId);
    return rank !== null ? rank + 1 : null;
  },

  async getMonthlyWinner() {
    const entries = await kv.zrange('leaderboard', 0, 0, { rev: true, withScores: true });
    if (!entries || entries.length < 2) return null;

    const userId = entries[0];
    const score = entries[1];
    if (score === 0) return null;

    const user = await kv.get(`user:${userId}`);
    return user ? { ...user, combined_score: score } : null;
  },

  async setMonthlyWinner(userId) {
    // Clear previous champion badge
    const allUsers = await kv.smembers('all_users');
    for (const uid of allUsers) {
      const user = await kv.get(`user:${uid}`);
      if (user && user.is_champion) {
        user.is_champion = false;
        await kv.set(`user:${uid}`, user);
      }
    }
    // Set new champion
    const winner = await kv.get(`user:${userId}`);
    if (winner) {
      winner.is_champion = true;
      await kv.set(`user:${userId}`, winner);
    }
    await kv.set('monthly_winner', userId);
  },

  async resetMonthlyKarma() {
    const allUsers = await kv.smembers('all_users');
    for (const userId of allUsers) {
      const user = await kv.get(`user:${userId}`);
      if (user) {
        user.karma_balance = STARTING_KARMA;
        user.karma_given = 0;
        user.karma_received = 0;
        await kv.set(`user:${userId}`, user);
      }
    }
    // Reset leaderboard
    await kv.del('leaderboard');
  },
};
