import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware';
import { Database } from '../db/queries';
import { hashPassword, verifyPassword } from '../utils/crypto';
import type { User, AIConfig, UserPromptConfig } from '../types';

const user = new Hono<{ Bindings: CloudflareBindings }>();

user.use('*', authMiddleware);

user.get('/profile', async (c) => {
  try {
    const currentUser = c.get('user') as User;

    return c.json({
      success: true,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        remaining_quota: currentUser.remaining_quota,
        data_source: currentUser.data_source,
        has_ms_account: currentUser.ms_token !== null,
        has_ai_config: currentUser.ai_config !== null,
        ics_subscription_token: currentUser.ics_subscription_token,
        user_prompt_config: currentUser.user_prompt_config,
        passkeys: currentUser.passkeys.map(pk => ({
          id: pk.id,
          name: pk.name,
          created_at: pk.created_at
        })),
        is_admin: currentUser.is_admin
      }
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get profile' }, 500);
  }
});

user.post('/password', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;
    const { oldPassword, newPassword } = await c.req.json();

    if (!currentUser.password_hash) {
      return c.json({ error: 'No password set' }, 400);
    }

    const valid = await verifyPassword(oldPassword, currentUser.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid old password' }, 401);
    }

    if (newPassword.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const newHash = await hashPassword(newPassword);
    await db.updateUserPassword(currentUser.id, newHash);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update password' }, 500);
  }
});

user.post('/ai-config', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;
    const config: AIConfig = await c.req.json();

    await db.updateUserAIConfig(currentUser.id, config);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update AI config' }, 500);
  }
});

user.delete('/ai-config', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;

    await db.updateUserAIConfig(currentUser.id, null);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete AI config' }, 500);
  }
});

user.post('/prompt-config', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;
    const config: UserPromptConfig = await c.req.json();

    await db.updateUserPromptConfig(currentUser.id, config);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update prompt config' }, 500);
  }
});

user.post('/data-source', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;
    const { source } = await c.req.json();

    if (source !== 'ms' && source !== 'd1') {
      return c.json({ error: 'Invalid data source' }, 400);
    }

    if (source === 'ms' && !await db.decryptUserMSToken(currentUser)) {
      return c.json({ error: 'No Microsoft account linked' }, 400);
    }

    await db.updateUserDataSource(currentUser.id, source);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update data source' }, 500);
  }
});

user.post('/enable-ics', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;

    if (currentUser.data_source === 'ms' && currentUser.remaining_quota < 20) {
      return c.json({ error: 'Insufficient quota. Costs 20 quota to enable ICS for MS users.' }, 403);
    }

    if (currentUser.data_source === 'ms') {
      await db.updateUserQuota(currentUser.id, currentUser.remaining_quota - 20);
    }

    const token = await db.generateICSToken(currentUser.id);

    return c.json({ 
      success: true, 
      ics_url: `${new URL(c.req.url).origin}/ics/${token}`
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to enable ICS' }, 500);
  }
});

user.delete('/ms-account', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;

    if (currentUser.data_source === 'ms') {
      return c.json({ error: 'Cannot unbind while using MS as data source' }, 400);
    }

    await db.updateUserMSToken(currentUser.id, null);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to unbind MS account' }, 500);
  }
});

user.delete('/passkey/:id', async (c) => {
  try {
    const currentUser = c.get('user') as User;
    const db = c.get('db') as Database;
    const passkeyId = c.req.param('id');

    await db.removePasskey(currentUser.id, passkeyId);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to remove passkey' }, 500);
  }
});

export default user;
