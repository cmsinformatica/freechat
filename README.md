# FreeAI Chat

Chatbot de IA gratuito com múltiplos modelos de linguagem, múltiplas conversas e tema claro/escuro.

## 🚀 Recursos

- **Múltiplos Modelos**: OpenRouter e Groq
- **Múltiplas Conversas**: Histórico completo de conversas
- **Tema Claro/Escuro**: Alternância instantânea
- **Streaming em Tempo Real**: Respostas aparecem em tempo real
- **Upload de Arquivos**: Suporte a PDF, DOCX e texto
- **Classificação Automática**: Detecta intenção (código, escrita, raciocínio, etc.)

## 📋 Pré-requisitos

- Node.js 18+
- NPM ou Yarn

## 🔧 Instalação

```bash
# Clone o repositório
git clone https://github.com/cmsinformatica/freechat.git
cd freechat

# Instale as dependências
npm install

# Crie o arquivo .env
cp .env.example .env
```

## 🔑 Configuração

Edite o arquivo `.env` com suas chaves de API:

```env
# Obtenha em https://openrouter.ai/settings
OPENROUTER_API_KEY=sua_chave_openrouter

# Obtenha em https://console.groq.com/keys
GROQ_API_KEY=sua_chave_groq
```

## ▶️ Executar

```bash
npm run dev
```

Acesse: http://localhost:3000

## 📦 Scripts Disponíveis

| Script | Descrição |
|--------|------------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Visualiza o build de produção |

## 🧠 Modelos Disponíveis

### Groq (Rápido)
- Llama 3.1 8B Instant
- GPT-Oss 20B
- Qwen3 32B
- Compound

### OpenRouter
- Auto Router (seleciona automaticamente)

## 📁 Estrutura

```
freechat/
├── server.ts          # Servidor Express + API
├── src/
│   ├── App.tsx        # Interface principal
│   ├── hooks/
│   │   └── useChat.ts # Lógica de chat e sessões
│   └── lib/
│       ├── modelConfig.ts  # Configuração de modelos
│       ├── router.ts       # Classificação de intenção
│       └── utils.ts        # Utilitários
└── package.json
```

## 📄 Licença

MIT