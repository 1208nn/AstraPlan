import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware';
import { Database } from '../db/queries';
import { CalendarService } from '../services/calendar';
import { MicrosoftGraphService } from '../services/microsoft';
import type { User } from '../types';

const calendar = new Hono<{ Bindings: CloudflareBindings }>();

calendar.use('*', authMiddleware);

calendar.get('/events', async (c) => {
  try {
    const user = c.get('user') as User;
    const db = c.get('db') as Database;
    const startDate = c.req.query('start');
    const endDate = c.req.query('end');

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );
    const calendarService = new CalendarService(db, msService);

    const events = await calendarService.getEvents(user, startDate, endDate);

    return c.json({ success: true, events });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to get events' }, 500);
  }
});

calendar.post('/events', async (c) => {
  try {
    const user = c.get('user') as User;
    const db = c.get('db') as Database;
    const event = await c.req.json();

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );
    const calendarService = new CalendarService(db, msService);

    const created = await calendarService.createEvent(user, event);

    return c.json({ success: true, event: created });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to create event' }, 500);
  }
});

calendar.patch('/events/:id', async (c) => {
  try {
    const user = c.get('user') as User;
    const db = c.get('db') as Database;
    const eventId = c.req.param('id');
    const updates = await c.req.json();

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );
    const calendarService = new CalendarService(db, msService);

    await calendarService.updateEvent(user, eventId, updates);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update event' }, 500);
  }
});

calendar.delete('/events/:id', async (c) => {
  try {
    const user = c.get('user') as User;
    const db = c.get('db') as Database;
    const eventId = c.req.param('id');

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );
    const calendarService = new CalendarService(db, msService);

    await calendarService.deleteEvent(user, eventId);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to delete event' }, 500);
  }
});

export default calendar;
