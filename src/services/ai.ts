import type { AIConfig, CalendarEvent, ChatMessage, AIResponse, UserPromptConfig } from '../types';

export class AIService {
  async chat(
    config: AIConfig,
    messages: ChatMessage[],
    existingEvents: CalendarEvent[],
    userPromptConfig: UserPromptConfig | null,
    aiBinding?: any
  ): Promise<AIResponse> {
    const systemPrompt = this.buildSystemPrompt(existingEvents, userPromptConfig);
    
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    let response: string;

    if (config.provider === 'cloudflare' && aiBinding) {
      response = await this.callCloudflareAI(aiBinding, fullMessages);
    } else {
      response = await this.callOpenAICompatible(config, fullMessages);
    }

    return this.parseAIResponse(response);
  }

  private buildSystemPrompt(events: CalendarEvent[], config: UserPromptConfig | null): string {
    const now = new Date().toISOString();
    
    let prompt = `You are a calendar management assistant. Current time: ${now}

Your task is to help users manage their calendar by creating, updating, deleting, or querying events based on natural language or image inputs.

IMPORTANT: Analyze the existing calendar events to avoid duplicates. If the user sends the same request multiple times, recognize it and don't create duplicate events.

Current calendar events:
${JSON.stringify(events, null, 2)}

`;

    if (config) {
      prompt += `User's default settings:
`;
      if (config.fixed_fields.default_location) {
        prompt += `- Default location: ${config.fixed_fields.default_location}\n`;
      }
      if (config.fixed_fields.default_duration) {
        prompt += `- Default duration: ${config.fixed_fields.default_duration} minutes\n`;
      }
      if (config.fixed_fields.default_reminder) {
        prompt += `- Default reminder: ${config.fixed_fields.default_reminder} minutes before\n`;
      }
      if (config.fixed_fields.timezone) {
        prompt += `- Timezone: ${config.fixed_fields.timezone}\n`;
      }
      if (config.custom_instructions) {
        prompt += `\nUser's custom instructions:\n${config.custom_instructions}\n`;
      }
      prompt += '\n';
    }

    prompt += `You must respond with a JSON object in the following format:
{
  "action": "create" | "update" | "delete" | "query" | "none",
  "events": [/* array of event objects for create/update */],
  "event_ids": [/* array of event IDs for update/delete */],
  "message": "A helpful message to the user",
  "query_result": {/* optional: structured query results */}
}

Event object format:
{
  "subject": "Event title",
  "body_content": "Description",
  "start_datetime": "ISO 8601 datetime",
  "end_datetime": "ISO 8601 datetime",
  "location": "Location name",
  "is_all_day": false,
  "is_reminder_on": true,
  "reminder_minutes_before": 15,
  "importance": "normal",
  "categories": []
}

Guidelines:
- Always use ISO 8601 format for datetime (YYYY-MM-DDTHH:mm:ss.000Z)
- Apply user's default settings when information is missing
- Check for duplicate events before creating
- For ambiguous requests, ask for clarification
- For updates, identify the event by matching subject, time, or location
- For deletions, find events matching the description
- For queries, provide structured information from the calendar
- When user sends a screenshot, extract the event information from it

Respond ONLY with valid JSON.`;

    return prompt;
  }

  private async callCloudflareAI(ai: any, messages: ChatMessage[]): Promise<string> {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    });

    return response.response || '';
  }

  private async callOpenAICompatible(config: AIConfig, messages: ChatMessage[]): Promise<string> {
    const baseUrl = config.baseUrl || this.getDefaultBaseUrl(config.provider);
    const model = config.model || this.getDefaultModel(config.provider);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private getDefaultBaseUrl(provider: string): string {
    const urls: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      google: 'https://generativelanguage.googleapis.com/v1beta',
      github: 'https://models.inference.ai.azure.com',
      zju: 'https://chat.zju.edu.cn/api/ai/v1'
    };
    return urls[provider] || '';
  }

  private getDefaultModel(provider: string): string {
    const models: Record<string, string> = {
      openai: 'gpt-4',
      google: 'gemini-pro',
      github: 'gpt-4o',
      zju: 'qwen3',
      cloudflare: '@cf/meta/llama-3.1-8b-instruct'
    };
    return models[provider] || 'gpt-4';
  }

  private parseAIResponse(response: string): AIResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        action: parsed.action || 'none',
        events: parsed.events || [],
        event_ids: parsed.event_ids || [],
        message: parsed.message || 'Processed successfully',
        query_result: parsed.query_result
      };
    } catch (error) {
      return {
        action: 'none',
        events: [],
        event_ids: [],
        message: response
      };
    }
  }

  async analyzeImage(config: AIConfig, imageData: string, prompt: string): Promise<string> {
    if (config.provider === 'openai' || config.provider === 'github') {
      return await this.analyzeImageWithVision(config, imageData, prompt);
    } else if (config.provider === 'google') {
      return await this.analyzeImageWithGemini(config, imageData, prompt);
    } else if (config.provider === 'cloudflare') {
      return await this.analyzeImageWithCloudflare(config, imageData, prompt);
    }
    
    return 'Image analysis not supported with current AI provider. Please use OpenAI, GitHub Models, Google Gemini, or Cloudflare.';
  }

  private async analyzeImageWithVision(config: AIConfig, imageData: string, prompt: string): Promise<string> {
    const baseUrl = config.baseUrl || this.getDefaultBaseUrl(config.provider);
    const model = config.provider === 'github' ? 'gpt-4o' : 'gpt-4-vision-preview';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageData } }
            ]
          }
        ],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async analyzeImageWithGemini(config: AIConfig, imageData: string, prompt: string): Promise<string> {
    const baseUrl = config.baseUrl || this.getDefaultBaseUrl(config.provider);
    const model = config.model || 'gemini-1.5-pro';
    const apiKey = config.apiKey;

    // Extract base64 data and mime type
    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid image data format');
    }
    const mimeType = matches[1];
    const base64Data = matches[2];

    const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private async analyzeImageWithCloudflare(config: AIConfig, imageData: string, prompt: string): Promise<string> {
    // Extract base64 data
    const matches = imageData.match(/^data:[^;]+;base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid image data format');
    }
    const base64Data = matches[1];

    // Convert base64 to array buffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        image: Array.from(bytes)
      })
    });

    if (!response.ok) {
      throw new Error(`Cloudflare Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result?.description || data.result?.response || '';
  }
}
