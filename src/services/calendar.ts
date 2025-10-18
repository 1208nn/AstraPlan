import type { CalendarEvent, User, MSToken } from '../types';
import { Database } from '../db/queries';
import { MicrosoftGraphService } from './microsoft';

export class CalendarService {
  constructor(
    private db: Database,
    private msService: MicrosoftGraphService
  ) {}

  async getEvents(user: User, startDate?: string, endDate?: string): Promise<CalendarEvent[]> {
    if (user.data_source === 'ms') {
      const token = await this.db.decryptUserMSToken(user);
      if (!token) throw new Error('No Microsoft token found');
      
      const msEvents = await this.msService.getEvents(token, startDate, endDate);
      return msEvents.map(e => this.convertFromMSEvent(e));
    } else {
      return await this.db.getEvents(user.id, startDate, endDate);
    }
  }

  async createEvent(user: User, event: CalendarEvent): Promise<CalendarEvent> {
    if (user.data_source === 'ms') {
      const token = await this.db.decryptUserMSToken(user);
      if (!token) throw new Error('No Microsoft token found');
      
      const msEvent = await this.msService.createEvent(token, event);
      return this.convertFromMSEvent(msEvent);
    } else {
      return await this.db.createEvent(user.id, event);
    }
  }

  async updateEvent(user: User, eventId: string, updates: Partial<CalendarEvent>): Promise<void> {
    if (user.data_source === 'ms') {
      const token = await this.db.decryptUserMSToken(user);
      if (!token) throw new Error('No Microsoft token found');
      
      await this.msService.updateEvent(token, eventId, updates);
    } else {
      await this.db.updateEvent(user.id, eventId, updates);
    }
  }

  async deleteEvent(user: User, eventId: string): Promise<void> {
    if (user.data_source === 'ms') {
      const token = await this.db.decryptUserMSToken(user);
      if (!token) throw new Error('No Microsoft token found');
      
      await this.msService.deleteEvent(token, eventId);
    } else {
      await this.db.deleteEvent(user.id, eventId);
    }
  }

  async searchEvents(user: User, query: string): Promise<CalendarEvent[]> {
    if (user.data_source === 'ms') {
      const token = await this.db.decryptUserMSToken(user);
      if (!token) throw new Error('No Microsoft token found');
      
      const msEvents = await this.msService.searchEvents(token, query);
      return msEvents.map(e => this.convertFromMSEvent(e));
    } else {
      const allEvents = await this.db.getEvents(user.id);
      return allEvents.filter(e => 
        e.subject.toLowerCase().includes(query.toLowerCase()) ||
        e.body_content?.toLowerCase().includes(query.toLowerCase()) ||
        e.location?.toLowerCase().includes(query.toLowerCase())
      );
    }
  }

  async generateICS(user: User, startDate?: string, endDate?: string): Promise<string> {
    const events = await this.getEvents(user, startDate, endDate);
    return this.eventsToICS(events);
  }

  private convertFromMSEvent(msEvent: any): CalendarEvent {
    return {
      id: msEvent.id,
      subject: msEvent.subject,
      body_content: msEvent.body?.content || '',
      body_content_type: msEvent.body?.contentType || 'text',
      start_datetime: msEvent.start?.dateTime || msEvent.start,
      start_timezone: msEvent.start?.timeZone || 'UTC',
      end_datetime: msEvent.end?.dateTime || msEvent.end,
      end_timezone: msEvent.end?.timeZone || 'UTC',
      location: msEvent.location?.displayName || '',
      is_all_day: msEvent.isAllDay || false,
      importance: msEvent.importance || 'normal',
      sensitivity: msEvent.sensitivity || 'normal',
      is_cancelled: msEvent.isCancelled || false,
      is_reminder_on: msEvent.isReminderOn !== false,
      reminder_minutes_before: msEvent.reminderMinutesBeforeStart || 15,
      attendees: msEvent.attendees || [],
      categories: msEvent.categories || [],
      created_datetime: msEvent.createdDateTime,
      last_modified_datetime: msEvent.lastModifiedDateTime
    };
  }

  private eventsToICS(events: CalendarEvent[]): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AstraPlan//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    for (const event of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${event.id}`);
      lines.push(`DTSTAMP:${this.formatICSDate(new Date())}`);
      
      if (event.is_all_day) {
        lines.push(`DTSTART;VALUE=DATE:${this.formatICSDateOnly(new Date(event.start_datetime))}`);
        lines.push(`DTEND;VALUE=DATE:${this.formatICSDateOnly(new Date(event.end_datetime))}`);
      } else {
        lines.push(`DTSTART:${this.formatICSDate(new Date(event.start_datetime))}`);
        lines.push(`DTEND:${this.formatICSDate(new Date(event.end_datetime))}`);
      }
      
      lines.push(`SUMMARY:${this.escapeICS(event.subject)}`);
      
      if (event.body_content) {
        lines.push(`DESCRIPTION:${this.escapeICS(event.body_content)}`);
      }
      
      if (event.location) {
        lines.push(`LOCATION:${this.escapeICS(event.location)}`);
      }
      
      if (event.is_reminder_on && event.reminder_minutes_before) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(`TRIGGER:-PT${event.reminder_minutes_before}M`);
        lines.push('END:VALARM');
      }
      
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  private formatICSDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  private formatICSDateOnly(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  private escapeICS(text: string): string {
    return text.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  }
}
