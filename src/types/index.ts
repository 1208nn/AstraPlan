export interface User {
  id: number;
  username: string | null;
  invite_code: string;
  remaining_quota: number;
  registered_at: string | null;
  last_used_at: string | null;
  passkeys: Passkey[];
  password_hash: string | null;
  ai_config: AIConfig | null;
  ms_token: MSToken | null;
  ics_subscription_token: string | null;
  user_prompt_config: UserPromptConfig | null;
  data_source: 'ms' | 'd1';
  is_admin: number;
  created_at: string;
}

export interface Passkey {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  credentialDeviceType?: string;
  credentialBackedUp?: boolean;
  name?: string;
  created_at: string;
}

export interface AIConfig {
  provider: 'cloudflare' | 'google' | 'github' | 'zju' | 'openai' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface MSToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
  email: string;
}

export interface UserPromptConfig {
  fixed_fields: {
    default_location?: string;
    default_duration?: number;
    default_reminder?: number;
    timezone?: string;
  };
  custom_instructions?: string;
}

export interface CalendarEvent {
  id: string;
  user_id?: number;
  subject: string;
  body_content?: string;
  body_content_type?: string;
  start_datetime: string;
  start_timezone?: string;
  end_datetime: string;
  end_timezone?: string;
  location?: string;
  is_all_day?: boolean;
  importance?: string;
  sensitivity?: string;
  is_cancelled?: boolean;
  is_reminder_on?: boolean;
  reminder_minutes_before?: number;
  recurrence?: any;
  attendees?: any[];
  categories?: string[];
  created_datetime?: string;
  last_modified_datetime?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ChatRequest {
  message: string;
  image?: string;
  history?: ChatMessage[];
}

export interface AIResponse {
  action: 'create' | 'update' | 'delete' | 'query' | 'none';
  events?: CalendarEvent[];
  event_ids?: string[];
  message: string;
  query_result?: any;
}
