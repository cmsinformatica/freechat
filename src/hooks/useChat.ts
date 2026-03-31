import { useState, useEffect, useCallback } from 'react';
import { classifyIntent, MODELS, type ModelInfo } from '../lib/router';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  intent?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export function useChat() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('freeai_chat_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const saved = localStorage.getItem('freeai_current_session');
    return saved || null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messages = sessions.find(s => s.id === currentSessionId)?.messages || [];
  const currentSession = sessions.find(s => s.id === currentSessionId);

  useEffect(() => {
    localStorage.setItem('freeai_chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('freeai_current_session', currentSessionId);
    }
  }, [currentSessionId]);

  const createNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Nova conversa',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setCurrentModel(null);
    setError(null);
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setError(null);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [currentSessionId, sessions]);

  const generateTitle = (firstMessage: string): string => {
    const truncated = firstMessage.slice(0, 40);
    return firstMessage.length > 40 ? truncated + '...' : truncated;
  };

  const sendMessage = useCallback(async (content: string, attachment?: { name: string; content: string }) => {
    if (!content.trim() && !attachment) return;

    if (!currentSessionId) {
      createNewSession();
    }

    const fullContent = attachment 
      ? `[Arquivo: ${attachment.name}]\n\n${attachment.content}\n\n---\n\n${content}`
      : content;

    const intent = classifyIntent(content || attachment?.content || '');
    const selectedModel = MODELS[intent].primary;
    setCurrentModel(selectedModel);

    const newUserMessage: Message = { 
      role: 'user', 
      content: attachment ? `${content}\n\n📎 ${attachment.name}` : content 
    };

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: [...session.messages, newUserMessage],
          updatedAt: Date.now()
        };
      }
      return session;
    }));

    setIsLoading(true);
    setError(null);

    const assistantMessage: Message = { 
      role: 'assistant', 
      content: '', 
      model: selectedModel.name, 
      provider: selectedModel.provider,
      intent
    };

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: [...session.messages, assistantMessage]
        };
      }
      return session;
    }));

    try {
      const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];
      const apiMessages = currentMessages.map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user', content: fullContent });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel.id,
          provider: selectedModel.provider,
          intent,
          stream: true
        }),
      });

      if (!response.ok) {
        const fallbackModel = MODELS[intent].fallback;
        setCurrentModel(fallbackModel);
        
        const fallbackResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            model: fallbackModel.id,
            provider: fallbackModel.provider,
            intent,
            stream: true
          }),
        });

        if (!fallbackResponse.ok) {
          const errorData = await fallbackResponse.json();
          throw new Error(errorData.error || 'Falha ao conectar com os provedores de IA');
        }
        
        handleStream(fallbackResponse, fallbackModel);
      } else {
        handleStream(response, selectedModel);
      }
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  }, [currentSessionId, sessions, createNewSession]);

  const handleStream = async (response: Response, model: ModelInfo) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let accumulatedContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(dataStr);
            const content = data.choices[0]?.delta?.content || '';
            accumulatedContent += content;
            
            setSessions(prev => prev.map(session => {
              if (session.id === currentSessionId) {
                const messages = [...session.messages];
                if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
                  messages[messages.length - 1] = {
                    ...messages[messages.length - 1],
                    content: accumulatedContent,
                    model: model.name,
                    provider: model.provider
                  };
                }
                return { ...session, messages };
              }
              return session;
            }));
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    setIsLoading(false);

    const session = sessions.find(s => s.id === currentSessionId);
    if (session && session.messages.length > 0) {
      const firstUserMessage = session.messages.find(m => m.role === 'user');
      if (firstUserMessage && session.title === 'Nova conversa') {
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            return { ...s, title: generateTitle(firstUserMessage.content) };
          }
          return s;
        }));
      }
    }
  };

  const clearChat = useCallback(() => {
    if (currentSessionId) {
      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return { ...session, messages: [], title: 'Nova conversa' };
        }
        return session;
      }));
    }
    setCurrentModel(null);
    setError(null);
  }, [currentSessionId]);

  return { 
    messages, 
    sessions,
    currentSessionId,
    isLoading, 
    currentModel, 
    error, 
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    clearChat 
  };
}