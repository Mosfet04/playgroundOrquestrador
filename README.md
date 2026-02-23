# 🤖 Agno Manager - Frontend para Orquestrador de Agentes IA

> **[English version below](#english-version) | [Versão em português](#versão-em-português)**

Uma interface web completa para gerenciar agentes de IA e ferramentas HTTP, projetada como frontend para o [Orquestrador IA Python Agno](https://github.com/Mosfet04/orquestradorIAPythonArgo).

> **🙏 Baseado no [agno-agi Agent UI](https://github.com/agno-agi/agent-ui)** - Este projeto estende e adapta o excelente trabalho da equipe Agno para integração específica com o orquestrador Python.

![Agno Manager Interface](https://github.com/user-attachments/assets/7765fae5-a813-46cb-993b-904af9bc1672)

## 📋 Sobre o Projeto

Este projeto é um **frontend web moderno** que complementa o [Orquestrador IA Python](https://github.com/Mosfet04/orquestradorIAPythonArgo), oferecendo uma interface visual intuitiva para:

- **Gerenciar agentes IA** sem editar código Python
- **Configurar ferramentas HTTP** de forma visual
- **Testar agentes** em tempo real via chat
- **Administrar configurações** do orquestrador

### **🔄 Diferenças do Projeto Original**

Baseado no [agno-agi Agent UI](https://github.com/agno-agi/agent-ui), este projeto adiciona:

- ✅ **Compatível com Agno 2.5** (nova API de sessões unificada)
- ✅ **Suporte a Teams e Agents** — gerencie ambos na mesma interface
- ✅ **Integração direta com MongoDB** (sem necessidade de backend adicional)
- ✅ **CRUD completo de agentes** via interface web
- ✅ **Gerenciamento de ferramentas HTTP** personalizadas
- ✅ **Configuração RAG** visual e simplificada
- ✅ **Dashboard administrativo** com métricas de Agents e Teams
- ✅ **Sincronização automática** com orquestrador Python
- ✅ **Guia de primeiros passos** para novos usuários
- ✅ **Suporte a múltiplos providers** em uma interface unificada

## ✨ Funcionalidades Principais

### 🎮 **Playground de Chat**
- Interface moderna para conversar com agentes e teams IA
- Suporte a streaming em tempo real (agents e teams)
- Visualização de tool calls e resultados
- Histórico de conversas (formato v2.5 `chat_history` + legado)
- Suporte multi-modal (texto, imagem, áudio, vídeo)
- Identificação estável de usuário via fingerprint

### � **Gerenciamento de Agentes**
- ➕ **Criar agentes**: Configure novos agentes com modelos, prompts e ferramentas
- ✏️ **Editar agentes**: Modifique configurações existentes
- �️ **Deletar agentes**: Remova agentes não utilizados
- 🔍 **Buscar e filtrar**: Encontre agentes rapidamente
- 🧠 **Configuração RAG**: Configure Retrieval-Augmented Generation
- 🛠️ **Associar tools**: Conecte ferramentas aos agentes

### 🛠️ **Gerenciamento de Ferramentas HTTP**
- ➕ **Criar APIs externas**: Configure endpoints HTTP de forma visual
- ✏️ **Editar configurações**: Modifique URLs, parâmetros e headers
- 🗑️ **Deletar ferramentas**: Remova ferramentas não utilizadas
- 📝 **Parâmetros dinâmicos**: Configure entrada e validação
- 🔗 **Headers personalizados**: Configure autenticação e metadados
- 🔍 **Organizar ferramentas**: Busque e filtre por método HTTP

## 🏗️ Arquitetura Técnica

### **Stack Tecnológico**
- **Frontend**: Next.js 14 + TypeScript + TailwindCSS
- **Componentes**: Radix UI + shadcn/ui
- **Estado**: Zustand para gerenciamento global
- **Formulários**: React Hook Form + Zod validation
- **Banco de Dados**: MongoDB (compartilhado com o orquestrador)
- **APIs**: Next.js API Routes (RESTful)

### **Integração com Orquestrador**
```mermaid
graph LR
    A[Agno Manager<br/>Frontend] --> B[MongoDB<br/>Shared Database]
    C[Orquestrador Python<br/>Backend] --> B
    A --> D[Next.js APIs]
    D --> B
    C --> E[AI Agents<br/>Execution]
```

- ✅ **Zero configuração**: Usa o mesmo MongoDB do orquestrador
- ✅ **Sincronização automática**: Mudanças refletidas instantaneamente
- ✅ **Schema compatível**: 100% compatível com estruturas Python
- ✅ **Hot reload**: Agentes criados ficam disponíveis imediatamente

## 📊 Estrutura do Banco de Dados

### Collections Gerenciadas

#### **`agents_config`** - Configuração de Agentes
```json
{
  "_id": ObjectId("..."),
  "id": "assistant-general",
  "nome": "Assistente Geral",
  "model": "llama3.2:latest",
  "factoryIaModel": "ollama",
  "descricao": "Assistente para tarefas gerais",
  "prompt": "Você é um assistente útil...",
  "active": true,
  "tools_ids": ["weather-api", "github-api"],
  "rag_config": {
    "active": true,
    "doc_name": "knowledge_base",
    "model": "text-embedding-3-small",
    "factoryIaModel": "openai"
  },
  "created_at": "2025-08-17T10:00:00.000Z",
  "updated_at": "2025-08-17T10:00:00.000Z"
}
```

#### **`agno_sessions`** - Sessões do Agno (agents e teams)
> **Nota:** Anteriormente chamada `storage`. Renomeada para `agno_sessions` na v2.5.

Armazena as sessões de interação com agents e teams, incluindo métricas de tokens.

#### **`agno_memories`** - Memórias de Usuário
> **Nota:** Anteriormente chamada `user_memories`. Renomeada para `agno_memories` na v2.5.

#### **`tools`** - Ferramentas HTTP
```json
{
  "_id": ObjectId("..."),
  "id": "weather-api",
  "name": "Weather API",
  "description": "Obtém informações meteorológicas",
  "http_config": {
    "base_url": "https://api.openweathermap.org",
    "method": "GET",
    "endpoint": "/data/2.5/weather",
    "headers": {
      "API-Key": "sua-chave-api"
    },
    "parameters": [
      {
        "name": "q",
        "type": "string",
        "description": "Nome da cidade",
        "required": true
      },
      {
        "name": "units",
        "type": "string",
        "description": "Unidade de temperatura",
        "required": false
      }
    ]
  },
  "created_at": "2025-08-17T10:00:00.000Z",
  "updated_at": "2025-08-17T10:00:00.000Z"
}
```

## 🚀 Início Rápido

### **Para Iniciantes**

#### **1. Pré-requisitos**
```bash
# Node.js 18+ e npm/pnpm instalados
node --version  # v18.0.0+
pnpm --version  # 8.0.0+

# MongoDB rodando (local ou cloud)
# Docker (opcional, para MongoDB local)
```

#### **2. Configuração do Orquestrador (Recomendado)**
```bash
# Clone e configure o orquestrador Python primeiro
git clone https://github.com/Mosfet04/orquestradorIAPythonArgo.git
cd orquestradorIAPythonArgo

# Siga o README do orquestrador para configuração completa
# Isso garantirá que MongoDB esteja configurado corretamente
```

#### **3. Configuração do Frontend**
```bash
# Clone este repositório
git clone <este-repositorio>
cd playgroundOrquestrador

# Instale dependências
pnpm install

# Configure variáveis de ambiente
cp .env.example .env.local
```

#### **4. Configure o `.env.local`**
```env
# MongoDB (mesmo do orquestrador)
MONGO_CONNECTION_STRING=mongodb://localhost:27017
MONGO_DATABASE_NAME=agno

# URLs da aplicação
NEXT_PUBLIC_API_URL=http://localhost:3000

# Providers de IA (opcional, configure conforme necessário)
OPENAI_API_KEY=sua-chave-openai
ANTHROPIC_API_KEY=sua-chave-anthropic
```

#### **5. Execute a aplicação**
```bash
# Inicie o servidor de desenvolvimento
pnpm dev

# Acesse http://localhost:3000
```

#### **6. Dados de Exemplo (Opcional)**
```bash
# Insira dados de exemplo para testar
node sample-data.js

# Para remover depois: node cleanup-sample-data.js
```

### **Para Desenvolvedores Experientes**

#### **Deploy em Produção**
```bash
# Build otimizado
pnpm build

# Servir em produção
pnpm start

# Docker (alternativo)
docker build -t agno-manager .
docker run -p 3000:3000 agno-manager
```

#### **Variáveis de Ambiente Completas**
```env
# Database
MONGO_CONNECTION_STRING=mongodb://usuario:senha@host:porta/database
MONGO_DATABASE_NAME=agno

# App Configuration
NEXT_PUBLIC_API_URL=https://seu-dominio.com
NEXTAUTH_SECRET=seu-jwt-secret-super-seguro
NEXTAUTH_URL=https://seu-dominio.com

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
GROQ_API_KEY=gsk_...

# Azure OpenAI (se usando)
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://....openai.azure.com
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Monitoring (opcional)
NEXT_PUBLIC_ANALYTICS_ID=G-...
SENTRY_DSN=https://...
```

## 💡 Como Usar

### **Fluxo Básico de Configuração**

#### **1. Primeira Execução**
1. **Acesse** `http://localhost:3000`
2. **Siga o guia** "Primeiros Passos" na tela inicial
3. **Configure** sua primeira ferramenta HTTP
4. **Crie** seu primeiro agente IA
5. **Teste** no playground de chat

#### **2. Criando uma Ferramenta HTTP**
```
🛠️ Tools → Criar Nova Tool

📝 Exemplo: Weather API
- ID: weather-api
- Nome: Weather API
- Descrição: Obtém dados meteorológicos
- Método: GET
- URL Base: https://api.openweathermap.org
- Endpoint: /data/2.5/weather
- Headers: API-Key: sua-chave
- Parâmetros:
  • q (string, obrigatório): Nome da cidade
  • units (string, opcional): Unidade temperatura
```

#### **3. Criando um Agente IA**
```
🤖 Agentes → Criar Novo Agente

📝 Exemplo: Assistente Meteorológico
- ID: weather-assistant
- Nome: Assistente Meteorológico
- Modelo: llama3.2:latest (Ollama)
- Prompt: "Você é um assistente especializado em..."
- Tools: ✅ weather-api
- RAG: ❌ (desabilitado)
- Status: ✅ Ativo
```

#### **4. Testando no Playground**
```
🎮 Playground → Selecionar Agente → weather-assistant

💬 Conversa de exemplo:
Usuário: "Como está o tempo em São Paulo?"
Agente: [Chama weather-api] "Em São Paulo está 25°C, ensolarado..."
```

### **Providers Suportados**

#### **Modelos de IA**
- **🦙 Ollama**: llama3.2:latest, codellama, mistral, etc.
- **🤖 OpenAI**: gpt-4, gpt-3.5-turbo, gpt-4-vision, etc.
- **🧠 Anthropic**: claude-3-sonnet, claude-3-haiku, claude-3-opus
- **💎 Google**: gemini-pro, gemini-pro-vision
- **⚡ Groq**: llama3-70b-8192, mixtral-8x7b-32768
- **☁️ Azure**: Modelos OpenAI via Azure

#### **Modelos de Embedding (RAG)**
- **🦙 Ollama**: nomic-embed-text, mxbai-embed-large
- **🤖 OpenAI**: text-embedding-3-small, text-embedding-3-large
- **💎 Google**: text-embedding-004
- **☁️ Azure**: text-embedding-ada-002

## 🔧 Desenvolvimento Avançado

### **Estrutura do Projeto**
```
src/
├── app/
│   ├── api/                    # Next.js API Routes
│   │   ├── agents/            # CRUD agentes
│   │   ├── tools/             # CRUD ferramentas
│   │   └── dashboard/         # Métricas e stats
│   └── page.tsx               # Página principal
├── components/
│   ├── layout/                # Navegação e layout
│   ├── management/            # Telas de gerenciamento
│   │   ├── agents/           # Componentes de agentes
│   │   ├── tools/            # Componentes de tools
│   │   └── dashboard/        # Dashboard e métricas
│   ├── playground/           # Interface de chat
│   └── ui/                   # Componentes base (shadcn)
├── hooks/                     # React hooks customizados
├── lib/                      # Utilitários e configurações
│   ├── mongodb.ts           # Cliente MongoDB
│   ├── utils.ts             # Funções auxiliares
│   └── modelProvider.ts     # Configurações de providers
└── types/                    # Definições TypeScript
    ├── management.ts        # Tipos de gerenciamento
    └── playground.ts        # Tipos do playground
```

### **Adicionando Novos Providers**

#### **1. Atualizar tipos TypeScript**
```typescript
// src/types/management.ts
export type ModelProvider = 
  | 'ollama' 
  | 'openai' 
  | 'anthropic' 
  | 'gemini' 
  | 'groq' 
  | 'azure'
  | 'seu-novo-provider';  // ← Adicionar aqui
```

#### **2. Configurar no formulário**
```typescript
// src/components/management/agents/AgentForm.tsx
const modelProviders = [
  // ... providers existentes
  { 
    value: 'seu-novo-provider', 
    label: 'Seu Novo Provider',
    description: 'Descrição do provider'
  }
];
```

#### **3. Adicionar configuração**
```typescript
// src/lib/modelProvider.ts
export const providerConfigs = {
  // ... configs existentes
  'seu-novo-provider': {
    name: 'Seu Novo Provider',
    apiKeyRequired: true,
    supportedModels: ['modelo-1', 'modelo-2'],
    embeddingModels: ['embedding-1']
  }
};
```

### **Customização da Interface**

#### **Temas e Cores**
```javascript
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',  // ← Cor principal
          900: '#1e3a8a'
        }
      }
    }
  }
};
```

#### **Componentes Personalizados**
```typescript
// src/components/ui/custom-button.tsx
import { Button } from '@/components/ui/button';

export function CustomButton({ children, ...props }) {
  return (
    <Button 
      className="bg-gradient-to-r from-blue-500 to-purple-600" 
      {...props}
    >
      {children}
    </Button>
  );
}
```

## 🔒 Segurança e Produção

### **Configurações de Segurança**
```env
# JWT Secrets (geração segura)
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# CORS (produção)
NEXT_PUBLIC_ALLOWED_ORIGINS=https://seu-dominio.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100  # 100 requests por janela
```

### **Monitoramento**
```javascript
// next.config.ts
module.exports = {
  experimental: {
    instrumentationHook: true  // Habilita telemetria
  },
  logging: {
    fetches: {
      fullUrl: true  // Log completo de requests
    }
  }
};
```

### **Deploy Recomendado**
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  agno-manager:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGO_CONNECTION_STRING=mongodb://mongo:27017
    depends_on:
      - mongo
      
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      
volumes:
  mongodb_data:
```

## 📈 Roadmap e Contribuições

### **🎯 Fase Atual (v1.1 — Agno 2.5)**
- ✅ CRUD completo de agentes e ferramentas
- ✅ Playground de chat funcional
- ✅ Integração com orquestrador Python
- ✅ Interface responsiva e moderna
- ✅ Suporte a múltiplos providers
- ✅ **Compatibilidade com Agno 2.5** (nova API de sessões unificada)
- ✅ **Suporte a Teams** no playground, dashboard e sessões
- ✅ **Dashboard de métricas** com separação Agent/Team, consumo de tokens por entidade
- ✅ **Carregamento de sessões** compatível com `chat_history` (v2.5) e formato legado
- ✅ **Collections renomeadas** (`agno_sessions`, `agno_memories`)

### **🚀 Próximas Funcionalidades (v1.2)**
- 👥 **Multi-usuário**: Autenticação e controle de acesso
- 📁 **Organização**: Categorias e tags para agentes
- 🔄 **Versionamento**: Histórico de mudanças
- 🌐 **API Externa**: Webhook endpoints para integração

### **🎨 Funcionalidades Futuras (v2.0)**
- 🧪 **A/B Testing**: Compare versões de agentes
- 📝 **Templates**: Agentes e tools pré-configurados
- 🔗 **Workflows**: Cadeia de agentes automatizada
- 🏢 **Enterprise**: SSO, auditoria, compliance
- 📱 **Mobile App**: Aplicativo nativo

### **🤝 Como Contribuir**

#### **1. Setup de Desenvolvimento**
```bash
# Fork do repositório
git clone https://github.com/seu-usuario/agno-manager.git
cd agno-manager

# Instalar dependências
pnpm install

# Configurar hooks de desenvolvimento
pnpm prepare

# Executar testes
pnpm test
```

#### **2. Padrões de Código**
```bash
# Linting e formatação
pnpm lint      # ESLint
pnpm format    # Prettier
pnpm type-check # TypeScript

# Testes
pnpm test           # Unit tests
pnpm test:e2e       # End-to-end tests
pnpm test:coverage  # Coverage report
```

#### **3. Submissão de PRs**
1. **Crie uma issue** descrevendo a funcionalidade/bug
2. **Fork e clone** o repositório
3. **Crie uma branch** feature/nome-da-funcionalidade
4. **Implemente** seguindo os padrões do projeto
5. **Adicione testes** para nova funcionalidade
6. **Submeta PR** com descrição detalhada

## 📝 Licença e Créditos

### **Licença**
Este projeto está licenciado sob [MIT License](./LICENSE).

### **Agradecimentos**
- **[agno-agi Agent UI](https://github.com/agno-agi/agent-ui)** - Projeto base que inspirou e forneceu a fundação para esta interface
- **[Orquestrador IA Python](https://github.com/Mosfet04/orquestradorIAPythonArgo)** - Backend principal
- **[Agno Framework](https://agno.link)** - Framework de agentes IA
- **[Next.js](https://nextjs.org)** - Framework React
- **[shadcn/ui](https://ui.shadcn.com)** - Componentes UI
- **[TailwindCSS](https://tailwindcss.com)** - Framework CSS

### **Comunidade**
- 💬 **Discord**: [Junte-se à comunidade](https://discord.gg/agno)
- 📧 **Email**: suporte@agno.link
- 🐛 **Issues**: [Reporte bugs aqui](https://github.com/seu-repo/issues)
- 📖 **Docs**: [Documentação completa](https://docs.agno.link)

---

## English Version

# 🤖 Agno Manager - AI Agent Orchestrator Frontend

A complete web interface for managing AI agents and HTTP tools, designed as a frontend for the [Python AI Orchestrator Agno](https://github.com/Mosfet04/orquestradorIAPythonArgo).

> **🙏 Based on [agno-agi Agent UI](https://github.com/agno-agi/agent-ui)** - This project extends and adapts the excellent work from the Agno team for specific integration with the Python orchestrator.

## 📋 About This Project

This project is a **modern web frontend** that complements the [Python AI Orchestrator](https://github.com/Mosfet04/orquestradorIAPythonArgo), providing an intuitive visual interface for:

- **Managing AI agents** without editing Python code
- **Configuring HTTP tools** visually
- **Testing agents** in real-time via chat
- **Administering orchestrator** configurations

## ✨ Key Features

### 🎮 **Chat Playground**
- Modern interface for conversing with AI agents and teams
- Real-time streaming support (agents and teams)
- Tool calls and results visualization
- Conversation history (v2.5 `chat_history` format + legacy)
- Multi-modal support (text, image, audio, video)
- Stable user identification via fingerprint

### 🤖 **Agent Management**
- ➕ **Create agents**: Configure new agents with models, prompts, and tools
- ✏️ **Edit agents**: Modify existing configurations
- 🗑️ **Delete agents**: Remove unused agents
- 🔍 **Search and filter**: Find agents quickly
- 🧠 **RAG configuration**: Configure Retrieval-Augmented Generation
- 🛠️ **Associate tools**: Connect tools to agents

### 🛠️ **HTTP Tools Management**
- ➕ **Create external APIs**: Configure HTTP endpoints visually
- ✏️ **Edit configurations**: Modify URLs, parameters, and headers
- 🗑️ **Delete tools**: Remove unused tools
- 📝 **Dynamic parameters**: Configure input and validation
- 🔗 **Custom headers**: Configure authentication and metadata
- 🔍 **Organize tools**: Search and filter by HTTP method

## 🏗️ Technical Architecture

### **Technology Stack**
- **Frontend**: Next.js 14 + TypeScript + TailwindCSS
- **Components**: Radix UI + shadcn/ui
- **State**: Zustand for global management
- **Forms**: React Hook Form + Zod validation
- **Database**: MongoDB (shared with orchestrator)
- **APIs**: Next.js API Routes (RESTful)

### **Orchestrator Integration**
- ✅ **Zero configuration**: Uses the same MongoDB as orchestrator
- ✅ **Auto synchronization**: Changes reflected instantly
- ✅ **Compatible schema**: 100% compatible with Python structures
- ✅ **Hot reload**: Created agents available immediately

## 🚀 Quick Start

### **For Beginners**

#### **1. Prerequisites**
```bash
# Node.js 18+ and npm/pnpm installed
node --version  # v18.0.0+
pnpm --version  # 8.0.0+

# MongoDB running (local or cloud)
# Docker (optional, for local MongoDB)
```

#### **2. Orchestrator Setup (Recommended)**
```bash
# Clone and configure Python orchestrator first
git clone https://github.com/Mosfet04/orquestradorIAPythonArgo.git
cd orquestradorIAPythonArgo

# Follow orchestrator README for complete setup
# This ensures MongoDB is configured correctly
```

#### **3. Frontend Configuration**
```bash
# Clone this repository
git clone <this-repository>
cd playgroundOrquestrador

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env.local
```

#### **4. Configure `.env.local`**
```env
# MongoDB (same as orchestrator)
MONGO_CONNECTION_STRING=mongodb://localhost:27017
MONGO_DATABASE_NAME=agno

# Application URLs
NEXT_PUBLIC_API_URL=http://localhost:3000

# AI Providers (optional, configure as needed)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

#### **5. Run the application**
```bash
# Start development server
pnpm dev

# Access http://localhost:3000
```

#### **6. Sample Data (Optional)**
```bash
# Insert sample data for testing
node sample-data.js

# To remove later: node cleanup-sample-data.js
```

## 💡 How to Use

### **Basic Configuration Flow**

#### **1. First Run**
1. **Access** `http://localhost:3000`
2. **Follow** the "Getting Started" guide on initial screen
3. **Configure** your first HTTP tool
4. **Create** your first AI agent
5. **Test** in chat playground

#### **2. Creating an HTTP Tool**
```
🛠️ Tools → Create New Tool

📝 Example: Weather API
- ID: weather-api
- Name: Weather API
- Description: Get weather data
- Method: GET
- Base URL: https://api.openweathermap.org
- Endpoint: /data/2.5/weather
- Headers: API-Key: your-key
- Parameters:
  • q (string, required): City name
  • units (string, optional): Temperature unit
```

#### **3. Creating an AI Agent**
```
🤖 Agents → Create New Agent

📝 Example: Weather Assistant
- ID: weather-assistant
- Name: Weather Assistant
- Model: llama3.2:latest (Ollama)
- Prompt: "You are an assistant specialized in..."
- Tools: ✅ weather-api
- RAG: ❌ (disabled)
- Status: ✅ Active
```

#### **4. Testing in Playground**
```
🎮 Playground → Select Agent → weather-assistant

💬 Example conversation:
User: "How's the weather in São Paulo?"
Agent: [Calls weather-api] "In São Paulo it's 25°C, sunny..."
```

## 🔧 Advanced Development

### **Project Structure**
```
src/
├── app/
│   ├── api/                    # Next.js API Routes
│   │   ├── agents/            # Agent CRUD
│   │   ├── tools/             # Tools CRUD
│   │   └── dashboard/         # Metrics and stats
│   └── page.tsx               # Main page
├── components/
│   ├── layout/                # Navigation and layout
│   ├── management/            # Management screens
│   │   ├── agents/           # Agent components
│   │   ├── tools/            # Tool components
│   │   └── dashboard/        # Dashboard and metrics
│   ├── playground/           # Chat interface
│   └── ui/                   # Base components (shadcn)
├── hooks/                     # Custom React hooks
├── lib/                      # Utilities and configurations
│   ├── mongodb.ts           # MongoDB client
│   ├── utils.ts             # Helper functions
│   └── modelProvider.ts     # Provider configurations
└── types/                    # TypeScript definitions
    ├── management.ts        # Management types
    └── playground.ts        # Playground types
```

## 📈 Roadmap and Contributions

### **🎯 Current Phase (v1.1 — Agno 2.5)**
- ✅ Complete CRUD for agents and tools
- ✅ Functional chat playground
- ✅ Python orchestrator integration
- ✅ Responsive and modern interface
- ✅ Multiple provider support
- ✅ **Agno 2.5 compatibility** (unified session API)
- ✅ **Teams support** in playground, dashboard, and sessions
- ✅ **Metrics dashboard** with Agent/Team breakdown, token consumption per entity
- ✅ **Session loading** compatible with `chat_history` (v2.5) and legacy format
- ✅ **Renamed collections** (`agno_sessions`, `agno_memories`)

### **🚀 Next Features (v1.2)**
- 👥 **Multi-user**: Authentication and access control
- 📁 **Organization**: Categories and tags for agents
- 🔄 **Versioning**: Change history
- 🌐 **External API**: Webhook endpoints for integration

### **🤝 How to Contribute**

#### **1. Development Setup**
```bash
# Fork the repository
git clone https://github.com/your-user/agno-manager.git
cd agno-manager

# Install dependencies
pnpm install

# Configure development hooks
pnpm prepare

# Run tests
pnpm test
```

## 📝 License and Credits

### **License**
This project is licensed under [MIT License](./LICENSE).

### **Acknowledgments**
- **[agno-agi Agent UI](https://github.com/agno-agi/agent-ui)** - Base project that inspired and provided the foundation for this interface
- **[Python AI Orchestrator](https://github.com/Mosfet04/orquestradorIAPythonArgo)** - Main backend
- **[Agno Framework](https://agno.link)** - AI agents framework
- **[Next.js](https://nextjs.org)** - React framework
- **[shadcn/ui](https://ui.shadcn.com)** - UI components
- **[TailwindCSS](https://tailwindcss.com)** - CSS framework

---

**⚡ This project is in its initial phase and is actively evolving. Perfect for developers who want to test AI agent orchestration with a modern, intuitive interface.**

---

## 📋 Changelog

### v1.1.0 — Agno 2.5 (2026-02-23)

#### Novas funcionalidades
- **Suporte a Teams**: playground, dashboard e sessões agora funcionam com Teams além de Agents
- **Dashboard aprimorado**: métricas separadas para Agent Sessions e Team Sessions, gráficos de área empilhados, gráfico de pizza por tipo de sessão
- **Consumo de tokens por entidade**: tabela de tokens agora mostra agents e teams com identificação de tipo
- **Sessões unificadas**: carregamento de sessões compatível com formato `chat_history` (Agno 2.5) e formato legado (`runs`/`memory.runs`)

#### Alterações de API
- Rotas do Agno atualizadas: removido prefixo `/v1/playground/` — endpoints agora em `/agents`, `/teams`, `/sessions`
- Sessões unificadas via query params (`?type=agent|team&component_id=...`)
- Endpoint padrão alterado de `http://localhost:7777/playground` para `http://localhost:7777`
- Modo padrão alterado de `team` para `agent`

#### Banco de dados
- Collection `storage` renomeada para `agno_sessions`
- Collection `user_memories` renomeada para `agno_memories`
- Dashboard agora coleta modelos a partir de `agent_data`/`team_data` nas sessões do Agno

#### Melhorias técnicas
- `useAIStreamHandler`: fallback quando IP não pode ser obtido, timeout de 3s na requisição de IP
- `useAIStreamHandler`: flag `monitor: true` enviada automaticamente para runs de Teams
- `useSessionLoader`: suporte ao formato `chat_history` do Agno 2.5 com fallback para formato legado
- `useChatActions`: prioridade para agents sobre teams no carregamento inicial
- `layout.tsx`: `viewport` exportado separadamente conforme recomendação do Next.js
- Correção de keys duplicadas no dashboard (`model.name` → chave composta com provider e index)
- Adicionados `eslint-disable` para supressões necessárias de `@typescript-eslint/no-explicit-any`
