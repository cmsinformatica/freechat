import { useState, useRef, useEffect } from 'react';
import { useChat } from './hooks/useChat';
import { cn } from './lib/utils';
import { getAllAvailableModels, type ModelInfo } from './lib/modelConfig';
import { 
  Send, 
  Plus, 
  Bot, 
  User, 
  Cpu, 
  Zap, 
  RotateCcw, 
  Trash2, 
  Github,
  Info,
  ChevronRight,
  Terminal,
  Paperclip,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Upload,
  File
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { motion, AnimatePresence } from 'motion/react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function App() {
  const { messages, sessions, currentSessionId, isLoading, currentModel, error, clearChat, createNewSession, selectSession, deleteSession, sendMessage } = useChat();
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [showModelTester, setShowModelTester] = useState(false);
  const [testingModel, setTestingModel] = useState<ModelInfo | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });
  const [documents, setDocuments] = useState<{ id: string; name: string; chunks?: number }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocuments(data.documents);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        setDocuments(prev => [...prev, { id: data.document.id, name: data.document.name, chunks: data.document.chunks }]);
      } else {
        alert('Erro ao fazer upload: ' + data.error);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Erro ao fazer upload do arquivo');
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || isLoading || isReadingFile) return;
    sendMessage(input, attachment || undefined);
    setInput('');
    setAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    try {
      let content = '';
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          text += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        content = text;
      } else if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
      } else {
        content = await file.text();
      }

      setAttachment({ name: file.name, content });
    } catch (err) {
      console.error('Error reading file:', err);
      alert('Erro ao ler o arquivo. Por favor, tente outro formato.');
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const testModel = async (model: ModelInfo) => {
    setTestingModel(model);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          model: model.id,
          provider: model.provider,
          stream: false
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices?.[0]?.message?.content) {
          setTestResult({ success: true, message: 'Modelo funcionando!' });
        } else {
          setTestResult({ success: false, message: 'Resposta vazia' });
        }
      } else {
        const error = await response.json();
        setTestResult({ success: false, message: error.error || 'Erro na API' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTestingModel(null);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans selection:bg-[var(--text-primary)] selection:text-[var(--bg-primary)]">
      <aside className="hidden md:flex flex-col w-64 border-r border-[var(--text-primary)] bg-[var(--bg-primary)]">
        <div className="p-4 border-bottom border-[var(--text-primary)]">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-[var(--text-primary)] rounded flex items-center justify-center">
              <Bot className="text-[var(--bg-primary)] w-5 h-5" />
            </div>
            <h1 className="font-serif italic text-xl tracking-tight">FreeAI Chat</h1>
          </div>
          
          <button 
            onClick={createNewSession}
            className="w-full flex items-center gap-2 px-3 py-2 border border-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-primary)] transition-colors duration-200 text-sm font-medium"
          >
            <Plus size={16} />
            Nova Conversa
          </button>
          
          <button 
            onClick={() => setShowDocuments(!showDocuments)}
            className="w-full flex items-center gap-2 px-3 py-2 mt-2 border border-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-primary)] transition-colors duration-200 text-sm font-medium"
          >
            <FileText size={16} />
            Documentos ({documents.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-[11px] font-serif italic opacity-50 uppercase tracking-widest mb-2">Conversas</div>
          {sessions.length === 0 ? (
            <div className="text-xs opacity-40 italic">Nenhuma conversa ainda...</div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div 
                  key={session.id}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-[var(--text-primary)]/5 transition-colors",
                    currentSessionId === session.id 
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)]" 
                      : "truncate"
                  )}
                  onClick={() => selectSession(session.id)}
                >
                  <span className="truncate flex-1">{session.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500 hover:text-white transition-all",
                      currentSessionId === session.id && "text-[var(--bg-primary)]"
                    )}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[var(--text-primary)] space-y-4">
          {showDocuments && (
            <div className="space-y-2">
              <div className="text-[11px] font-serif italic opacity-50 uppercase tracking-widest">Arquivos</div>
              
              <input
                type="file"
                ref={uploadInputRef}
                onChange={handleUpload}
                accept=".pdf"
                className="hidden"
              />
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--text-primary)] text-[var(--bg-primary)] text-sm font-medium hover:opacity-80 disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                Upload PDF
              </button>
              
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-2 bg-[var(--bg-secondary)] border border-[var(--text-primary)]/10 text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <File size={12} />
                    <span className="truncate">{doc.name}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-1 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              
              {documents.length === 0 && (
                <div className="text-xs opacity-40 italic">Nenhum documento</div>
              )}
            </div>
          )}
          
          <div className="flex items-center justify-between text-[10px] font-mono opacity-60 uppercase tracking-tighter">
            <span>Status: Online</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" />
              Pool de API Pronto
            </span>
          </div>
          <div className="flex gap-4 opacity-60">
            <a href="#" className="hover:opacity-100 transition-opacity"><Github size={18} /></a>
            <a href="#" className="hover:opacity-100 transition-opacity"><Info size={18} /></a>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        <header className="h-14 border-b border-[var(--text-primary)] flex items-center justify-between px-6 bg-[var(--bg-primary)]/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-6 h-6 bg-[var(--text-primary)] rounded flex items-center justify-center">
              <Bot className="text-[var(--bg-primary)] w-4 h-4" />
            </div>
            <span className="text-xs font-mono tracking-widest uppercase opacity-60">
              {currentModel ? `Ativo: ${currentModel.name}` : 'Pronto para entrada'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-2 hover:bg-[var(--text-primary)]/10 rounded transition-colors"
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button 
              onClick={() => setShowModelTester(!showModelTester)}
              className="text-[10px] font-mono uppercase tracking-widest flex items-center gap-1 hover:opacity-60"
            >
              <Cpu size={12} />
              Testar
            </button>
            {currentModel && (
              <div className="flex items-center gap-2 px-2 py-1 bg-[var(--text-primary)] text-[var(--bg-primary)] text-[10px] font-mono uppercase tracking-widest">
                <Zap size={10} className="text-yellow-400" />
                {currentModel.provider}
              </div>
            )}
            <button 
              onClick={clearChat}
              className="md:hidden p-2 hover:bg-[var(--text-primary)]/10 rounded transition-colors"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
            {messages.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <h2 className="text-4xl font-serif italic tracking-tight">Como posso ajudar hoje?</h2>
                  <p className="text-sm opacity-60 max-w-md mx-auto">
                    Roteamento inteligente entre modelos gratuitos do OpenRouter e Groq para o melhor desempenho.
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                  {[
                    { icon: <Terminal size={16} />, label: "Escreva um script Python para análise de dados", intent: "code" },
                    { icon: <Zap size={16} />, label: "Explique o emaranhamento quântico de forma simples", intent: "reasoning" },
                    { icon: <Plus size={16} />, label: "Rascunhe um e-mail profissional para um cliente", intent: "writing" },
                    { icon: <ChevronRight size={16} />, label: "Resuma este texto longo para mim", intent: "docs" },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(item.label)}
                      className="flex items-center gap-3 p-4 border border-[var(--text-primary)]/20 hover:border-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-all text-left text-sm group"
                    >
                      <span className="opacity-40 group-hover:opacity-100 transition-opacity">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((msg, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-4 group",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 bg-[var(--text-primary)] flex-shrink-0 flex items-center justify-center mt-1">
                        <Bot className="text-[var(--bg-primary)] w-5 h-5" />
                      </div>
                    )}
                    
                    <div className={cn(
                      "max-w-[85%] space-y-2",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "p-4 text-sm leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-[var(--text-primary)] text-[var(--bg-primary)]" 
                          : "bg-[var(--bg-secondary)] border border-[var(--text-primary)]/10 shadow-sm"
                      )}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:italic">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeRaw, rehypeHighlight]}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>

                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-tighter opacity-40">
                          <span>{msg.model}</span>
                          <span className="w-1 h-1 bg-[var(--text-primary)] rounded-full" />
                          <span>{msg.provider}</span>
                          {msg.intent && (
                            <>
                              <span className="w-1 h-1 bg-[var(--text-primary)] rounded-full" />
                              <span>Intenção: {msg.intent}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 border border-[var(--text-primary)] flex-shrink-0 flex items-center justify-center mt-1">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </motion.div>
                ))}
                
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-[var(--text-primary)] flex-shrink-0 flex items-center justify-center animate-pulse">
                      <Bot className="text-[var(--bg-primary)] w-5 h-5" />
                    </div>
                    <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--text-primary)]/10 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[var(--text-primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-[var(--text-primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-[var(--text-primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-3">
                    <Trash2 size={16} />
                    {error}
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        <div className="p-6 bg-[var(--bg-primary)]">
          <div className="max-w-3xl mx-auto relative">
            <AnimatePresence>
              {attachment && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full mb-4 left-0 right-0"
                >
                  <div className="bg-[var(--bg-secondary)] border border-[var(--text-primary)] p-3 shadow-[4px_4px_0px_0px_var(--text-primary)] flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText size={16} className="flex-shrink-0" />
                      <span className="text-xs truncate font-mono">{attachment.name}</span>
                    </div>
                    <button 
                      onClick={() => setAttachment(null)}
                      className="p-1 hover:bg-[var(--text-primary)]/10 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form 
              onSubmit={handleSubmit}
              className="relative border border-[var(--text-primary)] bg-[var(--bg-secondary)] shadow-[4px_4px_0px_0px_var(--text-primary)] focus-within:shadow-[6px_6px_0px_0px_var(--text-primary)] transition-all"
            >
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isReadingFile}
                  className="p-4 text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] transition-colors"
                >
                  {isReadingFile ? (
                    <div className="w-5 h-5 border-2 border-[var(--text-primary)]/20 border-t-[var(--text-primary)] rounded-full animate-spin" />
                  ) : (
                    <Paperclip size={20} />
                  )}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".txt,.md,.js,.ts,.tsx,.json,.pdf,.docx"
                />
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 p-4 pl-0 bg-transparent outline-none resize-none text-sm min-h-[56px] max-h-48"
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachment) || isLoading || isReadingFile}
                  className={cn(
                    "p-4 transition-all",
                    (input.trim() || attachment) && !isLoading && !isReadingFile
                      ? "text-[var(--text-primary)] hover:scale-110" 
                      : "text-[var(--text-primary)]/20 cursor-not-allowed"
                  )}
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
            <p className="mt-4 text-[10px] text-center opacity-40 font-mono uppercase tracking-widest">
              O FreeAI Chat utiliza modelos gratuitos do OpenRouter e Groq. As respostas podem variar em qualidade.
            </p>
          </div>
        </div>
      </main>

      {showModelTester && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-primary)] border border-[var(--text-primary)] max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-[8px_8px_0px_0px_var(--text-primary)]">
            <div className="p-4 border-b border-[var(--text-primary)] flex items-center justify-between">
              <h3 className="font-serif italic text-lg">Testar Modelos</h3>
              <button onClick={() => setShowModelTester(false)} className="hover:bg-[var(--text-primary)]/10 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              {testResult && (
                <div className={cn(
                  "p-3 border text-sm flex items-center gap-2",
                  testResult.success ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                )}>
                  {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {testingModel?.name}: {testResult.message}
                </div>
              )}
              
              <div className="space-y-2">
                <div className="text-[11px] font-serif italic opacity-50 uppercase tracking-widest">OpenRouter</div>
                {getAllAvailableModels().filter(m => m.provider === 'openrouter').map((model) => (
                  <div key={model.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] border border-[var(--text-primary)]/10">
                    <div>
                      <div className="font-medium text-sm">{model.name}</div>
                      <div className="text-xs opacity-50">{model.description}</div>
                      <div className="text-[10px] font-mono opacity-40">{model.id}</div>
                    </div>
                    <button
                      onClick={() => testModel(model)}
                      disabled={testingModel?.id === model.id}
                      className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-primary)] text-xs font-mono hover:opacity-80 disabled:opacity-50"
                    >
                      {testingModel?.id === model.id ? <Loader2 className="animate-spin" size={14} /> : 'Testar'}
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="space-y-2">
                <div className="text-[11px] font-serif italic opacity-50 uppercase tracking-widest">Groq</div>
                {getAllAvailableModels().filter(m => m.provider === 'groq').map((model) => (
                  <div key={model.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] border border-[var(--text-primary)]/10">
                    <div>
                      <div className="font-medium text-sm">{model.name}</div>
                      <div className="text-xs opacity-50">{model.description}</div>
                      <div className="text-[10px] font-mono opacity-40">{model.id}</div>
                    </div>
                    <button
                      onClick={() => testModel(model)}
                      disabled={testingModel?.id === model.id}
                      className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-primary)] text-xs font-mono hover:opacity-80 disabled:opacity-50"
                    >
                      {testingModel?.id === model.id ? <Loader2 className="animate-spin" size={14} /> : 'Testar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}