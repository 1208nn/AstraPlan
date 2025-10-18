import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware';
import { Database } from '../db/queries';
import { AIService } from '../services/ai';
import { CalendarService } from '../services/calendar';
import { MicrosoftGraphService } from '../services/microsoft';
import type { User, ChatRequest } from '../types';

const chat = new Hono<{ Bindings: CloudflareBindings }>();

chat.use('*', authMiddleware);

chat.post('/', async (c) => {
  try {
    const user = c.get('user') as User;
    const db = c.get('db') as Database;
    const { message, image, history = [] }: ChatRequest = await c.req.json();

    let aiConfig = await db.decryptUserAIConfig(user);
    const hasOwnAI = aiConfig !== null;

    if (!hasOwnAI) {
      if (user.remaining_quota <= 0) {
        return c.json({ error: 'Quota exceeded. Please add your own AI API key.' }, 403);
      }

      if (c.env.SHARED_AI_API_KEY) {
        aiConfig = {
          provider: 'cloudflare',
          apiKey: c.env.SHARED_AI_API_KEY,
          baseUrl: c.env.SHARED_AI_BASE_URL,
          model: c.env.SHARED_AI_MODEL
        };
      } else {
        aiConfig = {
          provider: 'cloudflare',
          apiKey: '',
          model: '@cf/meta/llama-3.1-8b-instruct'
        };
      }
    }

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );
    const calendarService = new CalendarService(db, msService);
    const aiService = new AIService();

    const existingEvents = await calendarService.getEvents(user);

    let finalMessage = message;
    if (image) {
      const imageAnalysis = await aiService.analyzeImage(aiConfig, image, 
        'Extract event information from this image. Include: title, date, time, location, and any other relevant details.');
      finalMessage = `${message}\n\nImage content: ${imageAnalysis}`;
    }

    history.push({ role: 'user', content: finalMessage });

    const aiResponse = await aiService.chat(
      aiConfig,
      history,
      existingEvents,
      user.user_prompt_config,
      aiConfig.provider === 'cloudflare' ? c.env.AI : undefined
    );

    if (!hasOwnAI) {
      const decremented = await db.decrementUserQuota(user.id);
      if (!decremented) {
        return c.json({ error: 'Failed to decrement quota' }, 500);
      }
    }

    if (aiResponse.action === 'create' && aiResponse.events) {
      for (const event of aiResponse.events) {
        const isDuplicate = existingEvents.some(existing => 
          existing.subject.toLowerCase() === event.subject.toLowerCase() &&
          existing.start_datetime === event.start_datetime
        );

        if (!isDuplicate) {
          await calendarService.createEvent(user, event);
        }
      }
    } else if (aiResponse.action === 'update' && aiResponse.event_ids && aiResponse.events) {
      for (let i = 0; i < aiResponse.event_ids.length; i++) {
        const eventId = aiResponse.event_ids[i];
        const updates = aiResponse.events[i];
        if (updates) {
          await calendarService.updateEvent(user, eventId, updates);
        }
      }
    } else if (aiResponse.action === 'delete' && aiResponse.event_ids) {
      for (const eventId of aiResponse.event_ids) {
        await calendarService.deleteEvent(user, eventId);
      }
    }

    const updatedUser = await db.getUserById(user.id);

    return c.json({
      success: true,
      response: aiResponse.message,
      action: aiResponse.action,
      events: aiResponse.events,
      query_result: aiResponse.query_result,
      remaining_quota: updatedUser?.remaining_quota || 0
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Chat processing failed' }, 500);
  }
});

export default chat;
