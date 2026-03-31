export type Intent = 'general' | 'reasoning' | 'code' | 'writing' | 'docs' | 'multilingual';

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'groq' | 'openrouter';
  description: string;
}

export interface ModelGroup {
  primary: ModelInfo;
  fallback: ModelInfo;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'openrouter/free', name: 'Auto Router', provider: 'openrouter', description: 'Seleciona melhor automaticamente' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', description: 'Rápido' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-Oss 20B', provider: 'groq', description: 'Leve' },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', provider: 'groq', description: 'Potente' },
  { id: 'groq/compound', name: 'Compound', provider: 'groq', description: 'Agente IA' },
];

function findModel(id: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === id);
}

export function getAvailableModels(): Record<Intent, ModelGroup> {
  return {
    general: {
      primary: findModel('openrouter/free')!,
      fallback: findModel('llama-3.1-8b-instant')!,
    },
    reasoning: {
      primary: findModel('openrouter/free')!,
      fallback: findModel('groq/compound')!,
    },
    code: {
      primary: findModel('openrouter/free')!,
      fallback: findModel('qwen/qwen3-32b')!,
    },
    writing: {
      primary: findModel('openrouter/free')!,
      fallback: findModel('llama-3.1-8b-instant')!,
    },
    docs: {
      primary: findModel('openrouter/free')!,
      fallback: findModel('qwen/qwen3-32b')!,
    },
    multilingual: {
      primary: findModel('openrouter/free')!,
      fallback: findModel('qwen/qwen3-32b')!,
    },
  };
}

export function isModelAvailable(id: string): boolean {
  return AVAILABLE_MODELS.some(m => m.id === id);
}

export function getAllAvailableModels(): ModelInfo[] {
  return AVAILABLE_MODELS;
}