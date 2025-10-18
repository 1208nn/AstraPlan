import type { MSToken, CalendarEvent } from '../types';

export class MicrosoftGraphService {
  constructor(
    private clientId: string,
    private clientSecret: string,
    private redirectUri: string
  ) {}

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'offline_access Calendars.ReadWrite User.Read',
      state
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  async getTokenFromCode(code: string): Promise<MSToken> {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get token');
    }

    const data = await response.json();
    const userInfo = await this.getUserInfo(data.access_token);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_id: userInfo.id,
      email: userInfo.mail || userInfo.userPrincipalName
    };
  }

  async refreshToken(refreshToken: string): Promise<MSToken> {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    const userInfo = await this.getUserInfo(data.access_token);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_id: userInfo.id,
      email: userInfo.mail || userInfo.userPrincipalName
    };
  }

  async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return await response.json();
  }

  async createEvent(token: MSToken, event: CalendarEvent): Promise<any> {
    const accessToken = await this.ensureValidToken(token);
    
    const msEvent = this.convertToMSEvent(event);
    
    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(msEvent)
    });

    if (!response.ok) {
      throw new Error('Failed to create event');
    }

    return await response.json();
  }

  async updateEvent(token: MSToken, eventId: string, updates: Partial<CalendarEvent>): Promise<any> {
    const accessToken = await this.ensureValidToken(token);
    
    const msEvent = this.convertToMSEvent(updates as CalendarEvent);
    
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/calendar/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(msEvent)
    });

    if (!response.ok) {
      throw new Error('Failed to update event');
    }

    return await response.json();
  }

  async deleteEvent(token: MSToken, eventId: string): Promise<void> {
    const accessToken = await this.ensureValidToken(token);
    
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/calendar/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to delete event');
    }
  }

  async getEvents(token: MSToken, startDate?: string, endDate?: string): Promise<any[]> {
    const accessToken = await this.ensureValidToken(token);
    
    let url = 'https://graph.microsoft.com/v1.0/me/calendar/events?$orderby=start/dateTime';
    
    if (startDate && endDate) {
      url += `&$filter=start/dateTime ge '${startDate}' and end/dateTime le '${endDate}'`;
    }
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to get events');
    }

    const data = await response.json();
    return data.value || [];
  }

  async searchEvents(token: MSToken, query: string): Promise<any[]> {
    const accessToken = await this.ensureValidToken(token);
    
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendar/events?$search="${query}"`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to search events');
    }

    const data = await response.json();
    return data.value || [];
  }

  private async ensureValidToken(token: MSToken): Promise<string> {
    if (token.expires_at > Date.now() + 300000) {
      return token.access_token;
    }
    
    const refreshed = await this.refreshToken(token.refresh_token);
    return refreshed.access_token;
  }

  private convertToMSEvent(event: CalendarEvent): any {
    return {
      subject: event.subject,
      body: {
        contentType: event.body_content_type || 'text',
        content: event.body_content || ''
      },
      start: {
        dateTime: event.start_datetime,
        timeZone: event.start_timezone || 'UTC'
      },
      end: {
        dateTime: event.end_datetime,
        timeZone: event.end_timezone || 'UTC'
      },
      location: event.location ? { displayName: event.location } : undefined,
      isAllDay: event.is_all_day || false,
      importance: event.importance || 'normal',
      sensitivity: event.sensitivity || 'normal',
      isReminderOn: event.is_reminder_on !== false,
      reminderMinutesBeforeStart: event.reminder_minutes_before || 15,
      categories: event.categories || [],
      attendees: event.attendees || []
    };
  }
}
