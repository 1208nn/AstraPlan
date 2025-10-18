import { Context } from 'hono';
import { verifyJWT } from '../utils/crypto';
import { Database } from '../db/queries';
import type { User } from '../types';

export interface AuthContext {
  user: User;
  db: Database;
}

export async function authMiddleware(c: Context, next: () => Promise<void>) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);
    const user = await db.getUserById(payload.userId);

    if (!user || !user.username) {
      return c.json({ error: 'User not found' }, 401);
    }

    c.set('user', user);
    c.set('db', db);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export async function adminMiddleware(c: Context, next: () => Promise<void>) {
  const user = c.get('user') as User;
  
  if (!user || !user.is_admin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
}
