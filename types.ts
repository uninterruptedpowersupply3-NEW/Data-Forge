export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatMLEntry {
  chatml: string;
  messages: ChatMessage[];
}

export type ModelId = string;