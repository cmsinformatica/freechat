# FreeAI Chat

Chatbot gratuito usando modelos de IA do OpenRouter e Groq.

## Executar Localmente

**Pré-requisitos:** Node.js

1. Instalar dependências: `npm install`
2. Configurar as chaves de API em `.env`:
   - `OPENROUTER_API_KEY` (obtenha em https://openrouter.ai/settings)
   - `GROQ_API_KEY` (obtenha em https://console.groq.com/keys)
3. Executar: `npm run dev`

## Modelos Disponíveis

- **OpenRouter**: Llama 3.3, DeepSeek R1, Qwen3, NVIDIA Nemotron, StepFun, MiniMax, OpenAI GPT-Oss
- **Groq**: Llama 3.3, Llama 3.1, Mixtral, Llama Vision

## Configuração

Edite `src/lib/modelConfig.ts` para adicionar ou remover modelos disponíveis.