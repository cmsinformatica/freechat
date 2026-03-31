import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

interface ModelInfo {
  id: string;
  name: string;
  provider: 'groq' | 'openrouter';
  description: string;
}

const OPENROUTER_MODELS: ModelInfo[] = [
  { id: 'openrouter/free', name: 'Auto Router', provider: 'openrouter', description: 'Seleciona melhor automaticamente' },
];

const GROQ_MODELS: ModelInfo[] = [
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq', description: 'Rápido' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-Oss 20B', provider: 'groq', description: 'Leve' },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', provider: 'groq', description: 'Potente' },
  { id: 'groq/compound', name: 'Compound', provider: 'groq', description: 'Agente IA' },
];

let availableModels = [...OPENROUTER_MODELS, ...GROQ_MODELS];
let validatedModels: ModelInfo[] = [];

async function validateModel(model: ModelInfo): Promise<boolean> {
  try {
    const apiKey = model.provider === 'groq' 
      ? process.env.GROQ_API_KEY 
      : process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
      console.log(`⚠️ ${model.name}: API key não encontrada para ${model.provider}`);
      return false;
    }
    
    const baseUrl = model.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(model.provider === 'openrouter' ? {
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'FreeAI Chat'
        } : {})
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: 'hi' }],
        stream: false
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ ${model.name}: ${response.status} - ${error.substring(0, 100)}`);
      return false;
    }
    
    return true;
  } catch (error: any) {
    console.log(`❌ ${model.name}: ${error.message}`);
    return false;
  }
}

async function validateAllModels() {
  console.log('🔄 Validando modelos...');
  
  const results = await Promise.all(availableModels.map(async (model) => {
    const isValid = await validateModel(model);
    return { model, isValid };
  }));

  validatedModels = results.filter(r => r.isValid).map(r => r.model);
  const failedModels = results.filter(r => !r.isValid).map(r => r.model.name);
  
  console.log('✅ Modelos válidos:', validatedModels.map(m => m.name).join(', '));
  if (failedModels.length > 0) {
    console.log('❌ Modelos falharam:', failedModels.join(', '));
  }
}

function getModelByIntent(intent: string): { primary: ModelInfo; fallback: ModelInfo } {
  const modelMap: Record<string, { primary: ModelInfo; fallback: ModelInfo }> = {
    general: {
      primary: validatedModels.find(m => m.id === 'llama-3.1-8b-instant') || validatedModels[0],
      fallback: validatedModels.find(m => m.id === 'openrouter/free') || validatedModels[1] || validatedModels[0],
    },
    reasoning: {
      primary: validatedModels.find(m => m.id === 'llama-3.1-8b-instant') || validatedModels[0],
      fallback: validatedModels.find(m => m.id === 'qwen/qwen3-32b') || validatedModels[1] || validatedModels[0],
    },
    code: {
      primary: validatedModels.find(m => m.id === 'qwen/qwen3-32b') || validatedModels[0],
      fallback: validatedModels.find(m => m.id === 'llama-3.1-8b-instant') || validatedModels[1] || validatedModels[0],
    },
    writing: {
      primary: validatedModels.find(m => m.id === 'llama-3.1-8b-instant') || validatedModels[0],
      fallback: validatedModels.find(m => m.id === 'openai/gpt-oss-20b') || validatedModels[1] || validatedModels[0],
    },
    docs: {
      primary: validatedModels.find(m => m.id === 'llama-3.1-8b-instant') || validatedModels[0],
      fallback: validatedModels.find(m => m.id === 'qwen/qwen3-32b') || validatedModels[1] || validatedModels[0],
    },
    multilingual: {
      primary: validatedModels.find(m => m.id === 'llama-3.1-8b-instant') || validatedModels[0],
      fallback: validatedModels.find(m => m.id === 'qwen/qwen3-32b') || validatedModels[1] || validatedModels[0],
    },
  };
  
  return modelMap[intent] || modelMap.general;
}

async function startServer() {
  await validateAllModels();

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  app.get('/api/models', (req, res) => {
    res.json({ models: validatedModels });
  });

  app.post("/api/chat", async (req, res) => {
    const { messages, model, provider, intent, stream = true } = req.body;

    let selectedModel = validatedModels.find(m => m.id === model);
    
    if (!selectedModel) {
      const models = getModelByIntent(intent || 'general');
      selectedModel = models.primary;
    }

    if (!selectedModel) {
      return res.status(500).json({ error: "Nenhum modelo disponível" });
    }

    const apiKey = selectedModel.provider === 'groq' 
      ? process.env.GROQ_API_KEY 
      : process.env.OPENROUTER_API_KEY;

    const baseUrl = selectedModel.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

    if (!apiKey) {
      return res.status(500).json({ error: `API Key for ${selectedModel.provider} not configured.` });
    }

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(selectedModel.provider === 'openrouter' ? {
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'FreeAI Chat'
          } : {})
        },
        body: JSON.stringify({
          model: selectedModel.id,
          messages,
          stream,
        }),
      });

      if (!response.ok) {
        const fallbackModels = getModelByIntent(intent || 'general');
        const fallbackModel = fallbackModels.fallback;
        
        const fallbackResponse = await fetch(baseUrl.replace(selectedModel.provider === 'groq' ? 'groq' : 'openrouter', fallbackModel.provider === 'groq' ? 'groq' : 'openrouter'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${fallbackModel.provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY}`,
            ...(fallbackModel.provider === 'openrouter' ? {
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
              'X-Title': 'FreeAI Chat'
            } : {})
          },
          body: JSON.stringify({
            model: fallbackModel.id,
            messages,
            stream,
          }),
        });

        if (!fallbackResponse.ok) {
          const errorData = await fallbackResponse.json();
          return res.status(fallbackResponse.status).json({ error: errorData.error || 'Modelo indisponível', model: fallbackModel.name });
        }
        
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          const reader = fallbackResponse.body?.getReader();
          if (!reader) throw new Error("No reader available");
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
          res.end();
        } else {
          const data = await fallbackResponse.json();
          res.json({ ...data, model: fallbackModel });
        }
        return;
      }

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } else {
        const data = await response.json();
        res.json({ ...data, model: selectedModel });
      }
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🟢 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📡 ${validatedModels.length} modelos validados e prontos!\n`);
  });
}

startServer();