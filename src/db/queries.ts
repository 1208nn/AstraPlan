import type { D1Database } from '@cloudflare/workers-types';
import type { User, CalendarEvent, Passkey, AIConfig, MSToken, UserPromptConfig } from '../types';

export class Database {
  constructor(private db: D1Database, private encryptionKey: string) {}

  async getUserById(id: number): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return result ? this.parseUser(result) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    return result ? this.parseUser(result) : null;
  }

  async getUserByInviteCode(code: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE invite_code = ?').bind(code).first();
    return result ? this.parseUser(result) : null;
  }

  async createInviteCode(code: string, quota: number, isAdmin: boolean = false): Promise<void> {
    await this.db.prepare(
      'INSERT INTO users (invite_code, remaining_quota, is_admin) VALUES (?, ?, ?)'
    ).bind(code, quota, isAdmin ? 1 : 0).run();
  }

  async registerUser(
    inviteCode: string,
    username: string,
    passwordHash: string,
    isMSUser: boolean
  ): Promise<User | null> {
    const quota = isMSUser ? 30 : 10;
    const now = new Date().toISOString();
    
    const result = await this.db.prepare(`
      UPDATE users 
      SET username = ?, password_hash = ?, registered_at = ?, remaining_quota = ?,
          data_source = ?
      WHERE invite_code = ? AND username IS NULL
    `).bind(username, passwordHash, now, quota, isMSUser ? 'ms' : 'd1', inviteCode).run();

    if (result.success) {
      return await this.getUserByUsername(username);
    }
    return null;
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, userId).run();
  }

  async updateUserQuota(userId: number, quota: number): Promise<void> {
    await this.db.prepare('UPDATE users SET remaining_quota = ? WHERE id = ?')
      .bind(quota, userId).run();
  }

  async decrementUserQuota(userId: number): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE users 
      SET remaining_quota = remaining_quota - 1, last_used_at = ?
      WHERE id = ? AND remaining_quota > 0
    `).bind(new Date().toISOString(), userId).run();
    return result.success && (result.meta?.changes ?? 0) > 0;
  }

  async updateUserAIConfig(userId: number, config: AIConfig | null): Promise<void> {
    const { encrypt } = await import('../utils/crypto');
    const encrypted = config ? await encrypt(JSON.stringify(config), this.encryptionKey) : null;
    await this.db.prepare('UPDATE users SET ai_config = ? WHERE id = ?')
      .bind(encrypted, userId).run();
  }

  async updateUserMSToken(userId: number, token: MSToken | null): Promise<void> {
    const { encrypt } = await import('../utils/crypto');
    const encrypted = token ? await encrypt(JSON.stringify(token), this.encryptionKey) : null;
    await this.db.prepare('UPDATE users SET ms_token = ? WHERE id = ?')
      .bind(encrypted, userId).run();
  }

  async updateUserPromptConfig(userId: number, config: UserPromptConfig): Promise<void> {
    await this.db.prepare('UPDATE users SET user_prompt_config = ? WHERE id = ?')
      .bind(JSON.stringify(config), userId).run();
  }

  async updateUserDataSource(userId: number, source: 'ms' | 'd1'): Promise<void> {
    await this.db.prepare('UPDATE users SET data_source = ? WHERE id = ?')
      .bind(source, userId).run();
  }

  async generateICSToken(userId: number): Promise<string> {
    const { generateToken } = await import('../utils/crypto');
    const token = generateToken();
    await this.db.prepare('UPDATE users SET ics_subscription_token = ? WHERE id = ?')
      .bind(token, userId).run();
    return token;
  }

  async getUserByICSToken(token: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE ics_subscription_token = ?')
      .bind(token).first();
    return result ? this.parseUser(result) : null;
  }

  async addPasskey(userId: number, passkey: Passkey): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    
    const passkeys = user.passkeys || [];
    passkeys.push(passkey);
    
    await this.db.prepare('UPDATE users SET passkeys = ? WHERE id = ?')
      .bind(JSON.stringify(passkeys), userId).run();
  }

  async removePasskey(userId: number, passkeyId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    
    const passkeys = (user.passkeys || []).filter(pk => pk.id !== passkeyId);
    
    await this.db.prepare('UPDATE users SET passkeys = ? WHERE id = ?')
      .bind(JSON.stringify(passkeys), userId).run();
  }

  async createEvent(userId: number, event: CalendarEvent): Promise<CalendarEvent> {
    const { generateUUID, getCurrentTimestamp } = await import('../utils/helpers');
    const id = event.id || generateUUID();
    const now = getCurrentTimestamp();

    await this.db.prepare(`
      INSERT INTO calendar_events (
        id, user_id, subject, body_content, body_content_type,
        start_datetime, start_timezone, end_datetime, end_timezone,
        location, is_all_day, importance, sensitivity,
        is_reminder_on, reminder_minutes_before,
        recurrence, attendees, categories,
        created_datetime, last_modified_datetime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, event.subject, event.body_content || '', event.body_content_type || 'text',
      event.start_datetime, event.start_timezone || 'UTC',
      event.end_datetime, event.end_timezone || 'UTC',
      event.location || '', event.is_all_day ? 1 : 0,
      event.importance || 'normal', event.sensitivity || 'normal',
      event.is_reminder_on ? 1 : 0, event.reminder_minutes_before || 15,
      JSON.stringify(event.recurrence || null),
      JSON.stringify(event.attendees || []),
      JSON.stringify(event.categories || []),
      now, now
    ).run();

    return { ...event, id };
  }

  async updateEvent(userId: number, eventId: string, updates: Partial<CalendarEvent>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    const fields: (keyof CalendarEvent)[] = [
      'subject', 'body_content', 'body_content_type', 'start_datetime', 'start_timezone',
      'end_datetime', 'end_timezone', 'location', 'is_all_day', 'importance',
      'sensitivity', 'is_reminder_on', 'reminder_minutes_before'
    ];

    fields.forEach(field => {
      if (updates[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });

    if (updates.recurrence !== undefined) {
      sets.push('recurrence = ?');
      values.push(JSON.stringify(updates.recurrence));
    }
    if (updates.attendees !== undefined) {
      sets.push('attendees = ?');
      values.push(JSON.stringify(updates.attendees));
    }
    if (updates.categories !== undefined) {
      sets.push('categories = ?');
      values.push(JSON.stringify(updates.categories));
    }

    sets.push('last_modified_datetime = ?');
    values.push(new Date().toISOString());

    values.push(eventId, userId);

    await this.db.prepare(`
      UPDATE calendar_events 
      SET ${sets.join(', ')}
      WHERE id = ? AND user_id = ?
    `).bind(...values).run();
  }

  async deleteEvent(userId: number, eventId: string): Promise<void> {
    await this.db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?')
      .bind(eventId, userId).run();
  }

  async getEvent(userId: number, eventId: string): Promise<CalendarEvent | null> {
    const result = await this.db.prepare(
      'SELECT * FROM calendar_events WHERE id = ? AND user_id = ?'
    ).bind(eventId, userId).first();
    return result ? this.parseEvent(result) : null;
  }

  async getEvents(userId: number, startDate?: string, endDate?: string): Promise<CalendarEvent[]> {
    let query = 'SELECT * FROM calendar_events WHERE user_id = ? AND is_cancelled = 0';
    const params: any[] = [userId];

    if (startDate) {
      query += ' AND end_datetime >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND start_datetime <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY start_datetime ASC';

    const result = await this.db.prepare(query).bind(...params).all();
    return (result.results || []).map(r => this.parseEvent(r));
  }

  async getAllInviteCodes(): Promise<Array<{ invite_code: string; remaining_quota: number; username: string | null; registered_at: string | null }>> {
    const result = await this.db.prepare(
      'SELECT invite_code, remaining_quota, username, registered_at FROM users ORDER BY created_at DESC'
    ).all();
    return result.results as any[];
  }

  async updateInviteCodeQuota(inviteCode: string, quota: number): Promise<void> {
    await this.db.prepare('UPDATE users SET remaining_quota = ? WHERE invite_code = ?')
      .bind(quota, inviteCode).run();
  }

  async disableInviteCode(inviteCode: string): Promise<void> {
    await this.db.prepare('UPDATE users SET remaining_quota = 0 WHERE invite_code = ?')
      .bind(inviteCode).run();
  }

  private parseUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      invite_code: row.invite_code,
      remaining_quota: row.remaining_quota,
      registered_at: row.registered_at,
      last_used_at: row.last_used_at,
      passkeys: row.passkeys ? JSON.parse(row.passkeys) : [],
      password_hash: row.password_hash,
      ai_config: null, // Decrypt on demand
      ms_token: null, // Decrypt on demand
      ics_subscription_token: row.ics_subscription_token,
      user_prompt_config: row.user_prompt_config ? JSON.parse(row.user_prompt_config) : null,
      data_source: row.data_source,
      is_admin: row.is_admin,
      created_at: row.created_at
    };
  }

  private parseEvent(row: any): CalendarEvent {
    return {
      id: row.id,
      user_id: row.user_id,
      subject: row.subject,
      body_content: row.body_content,
      body_content_type: row.body_content_type,
      start_datetime: row.start_datetime,
      start_timezone: row.start_timezone,
      end_datetime: row.end_datetime,
      end_timezone: row.end_timezone,
      location: row.location,
      is_all_day: row.is_all_day === 1,
      importance: row.importance,
      sensitivity: row.sensitivity,
      is_cancelled: row.is_cancelled === 1,
      is_reminder_on: row.is_reminder_on === 1,
      reminder_minutes_before: row.reminder_minutes_before,
      recurrence: row.recurrence ? JSON.parse(row.recurrence) : null,
      attendees: row.attendees ? JSON.parse(row.attendees) : [],
      categories: row.categories ? JSON.parse(row.categories) : [],
      created_datetime: row.created_datetime,
      last_modified_datetime: row.last_modified_datetime
    };
  }

  async decryptUserAIConfig(user: User): Promise<AIConfig | null> {
    const row = await this.db.prepare('SELECT ai_config FROM users WHERE id = ?').bind(user.id).first();
    if (!row || !row.ai_config) return null;
    
    const { decrypt } = await import('../utils/crypto');
    try {
      const decrypted = await decrypt(row.ai_config as string, this.encryptionKey);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  async decryptUserMSToken(user: User): Promise<MSToken | null> {
    const row = await this.db.prepare('SELECT ms_token FROM users WHERE id = ?').bind(user.id).first();
    if (!row || !row.ms_token) return null;
    
    const { decrypt } = await import('../utils/crypto');
    try {
      const decrypted = await decrypt(row.ms_token as string, this.encryptionKey);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }
}
