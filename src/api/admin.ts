import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../auth/middleware';
import { Database } from '../db/queries';
import { generateInviteCode } from '../utils/helpers';

const admin = new Hono<{ Bindings: CloudflareBindings }>();

admin.use('*', authMiddleware);
admin.use('*', adminMiddleware);

admin.post('/invite-codes', async (c) => {
  try {
    const db = c.get('db') as Database;
    const { quota = 30 } = await c.req.json();

    const code = generateInviteCode();
    await db.createInviteCode(code, quota);

    return c.json({ success: true, code, quota });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to create invite code' }, 500);
  }
});

admin.get('/invite-codes', async (c) => {
  try {
    const db = c.get('db') as Database;
    const codes = await db.getAllInviteCodes();

    return c.json({ success: true, codes });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get invite codes' }, 500);
  }
});

admin.patch('/invite-codes/:code', async (c) => {
  try {
    const db = c.get('db') as Database;
    const code = c.req.param('code');
    const { quota } = await c.req.json();

    await db.updateInviteCodeQuota(code, quota);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update invite code' }, 500);
  }
});

admin.delete('/invite-codes/:code', async (c) => {
  try {
    const db = c.get('db') as Database;
    const code = c.req.param('code');

    await db.disableInviteCode(code);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to disable invite code' }, 500);
  }
});

export default admin;
