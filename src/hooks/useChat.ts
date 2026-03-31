import { useState, useEffect, useCallback } from 'react';
import { classifyIntent, MODELS, type ModelInfo } from '../lib/router';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  intent?: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('freeai_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('freeai_chat_history', JSON.stringify(messages));
  }, [messages]);

  const sendMessage = useCallback(async (content: string, attachment?: { name: string; content: string }) => {
    if (!content.trim() && !attachment) return;

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
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsLoading(true);
    setError(null);

    const assistantMessage: Message = { 
      role: 'assistant', 
      content: '', 
      model: selectedModel.name, 
      provider: selectedModel.provider,
      intent
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
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
  }, [messages]);

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
            
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.content = accumulatedContent;
                lastMessage.model = model.name;
                lastMessage.provider = model.provider;
              }
              return newMessages;
            });
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }
    setIsLoading(false);
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentModel(null);
    setError(null);
    localStorage.removeItem('freeai_chat_history');
  };

  return { messages, sendMessage, isLoading, currentModel, error, clearChat };
}