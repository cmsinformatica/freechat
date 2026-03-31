import { getAvailableModels, type ModelInfo, type Intent } from './modelConfig';

export { ModelInfo };

export const MODELS = getAvailableModels();

export function classifyIntent(text: string): Intent {
  const lowerText = text.toLowerCase();
  
  if (
    lowerText.includes('code') || 
    lowerText.includes('codigo') || 
    lowerText.includes('código') || 
    lowerText.includes('função') || 
    lowerText.includes('funcao') || 
    lowerText.includes('debug') || 
    lowerText.includes('python') || 
    lowerText.includes('javascript') ||
    lowerText.includes('typescript') ||
    lowerText.includes('react') ||
    lowerText.includes('html') ||
    lowerText.includes('css') ||
    lowerText.includes('sql')
  ) return 'code';

  if (
    lowerText.includes('solve') || 
    lowerText.includes('resolva') || 
    lowerText.includes('math') || 
    lowerText.includes('matematica') || 
    lowerText.includes('matemática') || 
    lowerText.includes('logic') || 
    lowerText.includes('logica') || 
    lowerText.includes('lógica') || 
    lowerText.includes('reason') || 
    lowerText.includes('raciocinio') || 
    lowerText.includes('raciocínio') || 
    lowerText.includes('why') ||
    lowerText.includes('por que') ||
    lowerText.includes('calculate') ||
    lowerText.includes('calcule')
  ) return 'reasoning';

  if (
    lowerText.includes('write') || 
    lowerText.includes('escreva') || 
    lowerText.includes('essay') || 
    lowerText.includes('redação') || 
    lowerText.includes('redacao') || 
    lowerText.includes('story') || 
    lowerText.includes('historia') || 
    lowerText.includes('história') || 
    lowerText.includes('poem') || 
    lowerText.includes('poema') || 
    lowerText.includes('creative') ||
    lowerText.includes('criativo') ||
    lowerText.includes('email') ||
    lowerText.includes('e-mail')
  ) return 'writing';

  if (
    lowerText.includes('summarize') || 
    lowerText.includes('resuma') || 
    lowerText.includes('extract') || 
    lowerText.includes('extraia') || 
    lowerText.includes('document') || 
    lowerText.includes('documento') || 
    lowerText.includes('long') || 
    lowerText.includes('longo') || 
    lowerText.includes('pdf')
  ) return 'docs';

  if (
    lowerText.includes('traduz') || 
    lowerText.includes('translate') || 
    lowerText.includes('portuguese') || 
    lowerText.includes('portugues') || 
    lowerText.includes('português') || 
    lowerText.includes('spanish') || 
    lowerText.includes('espanhol') || 
    lowerText.includes('french') ||
    lowerText.includes('frances') ||
    lowerText.includes('francês')
  ) return 'multilingual';

  return 'general';
}