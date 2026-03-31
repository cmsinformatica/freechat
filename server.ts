import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import multer from "multer";
import pdf from "pdf-parse";

dotenv.config();

interface ModelInfo {
  id: string;
  name: string;
  provider: 'groq' | 'openrouter';
  description: string;
}

interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  page?: number;
}

interface Document {
  id: string;
  name: string;
  uploadedAt: number;
  chunks: DocumentChunk[];
}

const documents: Document[] = [];
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({ dest: UPLOAD_DIR });

function extractTextFromPDF(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const dataBuffer = fs.readFileSync(filePath);
    pdf(dataBuffer)
      .then((data) => resolve(data.text))
      .catch(reject);
  });
}

function createChunks(text: string, documentId: string, chunkSize = 500): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  let pageNum = 1;
  
  for (const sentence of sentences) {
    if ((currentChunk.length + sentence.length > chunkSize) && currentChunk.length > 0) {
      chunks.push({
        id: `${documentId}-${chunks.length}`,
        documentId,
        content: currentChunk.trim(),
        page: pageNum
      });
      currentChunk = sentence;
      pageNum = Math.ceil(chunks.length * chunkSize / 1000) + 1;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      id: `${documentId}-${chunks.length}`,
      documentId,
      content: currentChunk.trim(),
      page: pageNum
    });
  }
  
  return chunks;
}

function searchContext(query: string, topK = 3): string {
  if (documents.length === 0) return '';
  
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  const allChunks = documents.flatMap(d => d.chunks);
  
  const scoredChunks = allChunks.map(chunk => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        score += 1;
        const count = (contentLower.match(new RegExp(word, 'g')) || []).length;
        score += count * 0.5;
      }
    }
    
    return { chunk, score };
  });
  
  const topChunks = scoredChunks
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  if (topChunks.length === 0) return '';
  
  return topChunks.map(s => s.chunk.content).join('\n\n');
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
    
    return response.ok;
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
  console.log('✅ Modelos válidos:', validatedModels.map(m => m.name).join(', '));
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

  app.get('/api/documents', (req, res) => {
    res.json({ documents: documents.map(d => ({ id: d.id, name: d.name, uploadedAt: d.uploadedAt })) });
  });

  app.delete('/api/documents/:id', (req, res) => {
    const docId = req.params.id;
    const index = documents.findIndex(d => d.id === docId);
    if (index !== -1) {
      documents.splice(index, 1);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Documento não encontrado' });
    }
  });

  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const filePath = req.file.path;
      const text = await extractTextFromPDF(filePath);
      
      const documentId = Date.now().toString();
      const chunks = createChunks(text, documentId);
      
      const doc: Document = {
        id: documentId,
        name: req.file.originalname,
        uploadedAt: Date.now(),
        chunks
      };
      
      documents.push(doc);
      
      fs.unlinkSync(filePath);
      
      res.json({ 
        success: true, 
        document: { id: doc.id, name: doc.name, chunks: chunks.length }
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const { messages, model, provider, intent, stream = true, useRag = true } = req.body;

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
      const lastMessage = messages[messages.length - 1]?.content || '';
      
      let enrichedMessages = [...messages];
      
      if (useRag && documents.length > 0) {
        const context = searchContext(lastMessage);
        
        if (context) {
          const systemPrompt = `Você é um assistente de IA. Use o contexto abaixo para responder as perguntas. Se a resposta não estiver no contexto, responda normalmente baseado em seu conhecimento.

Contexto relevante dos documentos:
${context}

---`;

          enrichedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
          ];
        }
      }

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
          messages: enrichedMessages,
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
            messages: enrichedMessages,
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
    console.log(`📡 ${validatedModels.length} modelos validados e prontos!`);
    console.log(`📚 RAG: ${documents.length} documentos carregados\n`);
  });
}

startServer();