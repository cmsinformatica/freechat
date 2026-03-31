import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import multer from "multer";

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
  page: number;
  tokens: number;
}

interface Document {
  id: string;
  name: string;
  uploadedAt: number;
  totalPages: number;
  totalTokens: number;
  chunks: DocumentChunk[];
}

const documents: Document[] = [];
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({ 
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE }
});

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function calculateSimilarity(query: string, chunk: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const chunkWords = chunk.toLowerCase().split(/\s+/);
  
  let score = 0;
  let matches = 0;
  
  for (const word of queryWords) {
    if (chunkWords.includes(word)) {
      matches++;
      const position = chunkWords.indexOf(word);
      score += (chunkWords.length - position) / chunkWords.length;
    }
  }
  
  if (queryWords.length > 0) {
    return (matches / queryWords.length) * 0.7 + (score / queryWords.length) * 0.3;
  }
  
  return 0;
}

function searchContext(query: string, topK = 5): { content: string; sources: { name: string; page: number }[] } {
  if (documents.length === 0) {
    return { content: '', sources: [] };
  }
  
  const allChunks = documents.flatMap(d => d.chunks.map(c => ({
    ...c,
    documentName: d.name
  })));
  
  const scoredChunks = allChunks.map(chunk => ({
    chunk,
    score: calculateSimilarity(query, chunk.content)
  }));
  
  const topChunks = scoredChunks
    .filter(s => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  if (topChunks.length === 0) {
    return { content: '', sources: [] };
  }
  
  const content = topChunks.map(c => c.chunk.content).join('\n\n---\n\n');
  const sources = topChunks.map(c => ({
    name: c.chunk.documentName,
    page: c.chunk.page
  }));
  
  return { content, sources };
}

function createChunksFromText(text: string, documentId: string, documentName: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const chunkSize = 1000;
  const overlap = 100;
  
  let start = 0;
  let chunkIndex = 0;
  
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    
    if (end < text.length && end < text.lastIndexOf('.', end)) {
      end = text.lastIndexOf('.', end) + 1;
    }
    
    const content = text.slice(start, end).trim();
    
    if (content.length > 50) {
      chunks.push({
        id: `${documentId}-${chunkIndex}`,
        documentId,
        content,
        page: chunkIndex + 1,
        tokens: estimateTokens(content)
      });
    }
    
    start = end - overlap;
    chunkIndex++;
  }
  
  return chunks;
}

async function extractTextFromPDF(filePath: string): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjs.getDocument({ data }).promise;
  
  let fullText = '';
  const totalPages = pdf.numPages;
  
  const batchSize = 10;
  for (let i = 1; i <= totalPages; i += batchSize) {
    const batchEnd = Math.min(i + batchSize - 1, totalPages);
    console.log(`  📄 Extraindo páginas ${i}-${batchEnd} de ${totalPages}...`);
    
    for (let pageNum = i; pageNum <= batchEnd; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .filter(str => str.trim())
        .join(' ');
      
      if (pageText.trim()) {
        fullText += pageText + '\n\n';
      }
    }
  }
  
  return { text: fullText, pages: totalPages };
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
    res.json({ 
      documents: documents.map(d => ({ 
        id: d.id, 
        name: d.name, 
        pages: d.totalPages,
        tokens: d.totalTokens,
        chunks: d.chunks.length,
        uploadedAt: d.uploadedAt 
      })) 
    });
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

      const fileSize = req.file.size;
      if (fileSize > MAX_FILE_SIZE) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
      }

      const filePath = req.file.path;
      const fileName = req.file.originalname;
      
      console.log(`📄 Processando: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
      
      const { text, pages } = await extractTextFromPDF(filePath);
      
      console.log(`✅ Texto extraído: ${text.length} caracteres, ${pages} páginas`);
      
      const documentId = Date.now().toString();
      const chunks = createChunksFromText(text, documentId, fileName);
      
      const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);
      
      console.log(`📊 Criados ${chunks.length} chunks (${totalTokens} tokens)`);
      
      const doc: Document = {
        id: documentId,
        name: fileName,
        uploadedAt: Date.now(),
        totalPages: pages,
        totalTokens,
        chunks
      };
      
      documents.push(doc);
      
      fs.unlinkSync(filePath);
      
      res.json({ 
        success: true, 
        document: { 
          id: doc.id, 
          name: doc.name, 
          pages: doc.totalPages,
          tokens: doc.totalTokens,
          chunks: chunks.length 
        }
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
      let ragContext = null;
      
      if (useRag && documents.length > 0) {
        const { content: context, sources } = searchContext(lastMessage, 5);
        
        if (context) {
          ragContext = { sources };
          
          const systemPrompt = `Você é um assistente de IA. Use APENAS o contexto abaixo para responder as perguntas.

Se a resposta NÃO estiver no contexto, responda que não sabe com base no documento.

Contexto relevante:
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
          res.json({ ...data, model: fallbackModel, ragContext });
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
        res.json({ ...data, model: selectedModel, ragContext });
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