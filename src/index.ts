import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import auth from './api/auth';
import chat from './api/chat';
import calendar from './api/calendar';
import user from './api/user';
import admin from './api/admin';
import { Database } from './db/queries';
import { CalendarService } from './services/calendar';
import { MicrosoftGraphService } from './services/microsoft';

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use('*', cors({
  origin: '*',
  credentials: true,
}));

app.route('/api/auth', auth);
app.route('/api/chat', chat);
app.route('/api/calendar', calendar);
app.route('/api/user', user);
app.route('/api/admin', admin);

app.get('/ics/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);
    
    const user = await db.getUserByICSToken(token);
    if (!user) {
      return c.text('Invalid subscription token', 404);
    }

    const startDate = c.req.query('start');
    const endDate = c.req.query('end');

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );
    const calendarService = new CalendarService(db, msService);

    const ics = await calendarService.generateICS(user, startDate, endDate);

    return c.text(ics, 200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="calendar.ics"'
    });
  } catch (error) {
    return c.text('Failed to generate calendar', 500);
  }
});

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '1.0.0' });
});

app.get('*', serveStatic({ root: './' }));
app.get('*', serveStatic({ path: './index.html' }));

export default app;
