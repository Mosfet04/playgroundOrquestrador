# 🔗 Integração com Orquestrador Python

Este documento explica como integrar o Agno Manager Frontend com o [Orquestrador IA Python Agno](https://github.com/Mosfet04/orquestradorIAPythonArgo).

> **🙏 Baseado no [agno-agi Agent UI](https://github.com/agno-agi/agent-ui)** - Este projeto estende o excelente trabalho da equipe Agno para integração específica com o orquestrador Python.

## 📋 Visão Geral da Integração

O Agno Manager funciona como um **frontend visual** para o orquestrador Python, compartilhando a mesma base de dados MongoDB e permitindo gerenciamento visual de agentes e ferramentas.

```mermaid
graph TB
    subgraph "Frontend (Este Projeto)"
        A[Agno Manager UI]
        B[Next.js APIs]
        C[Formulários de Configuração]
    end
    
    subgraph "Shared Infrastructure"
        D[(MongoDB Database)]
        E[Collections: agents_config, tools, rag]
    end
    
    subgraph "Backend Python"
        F[Orquestrador Python]
        G[Agent Execution Engine]
        H[HTTP Tools Manager]
    end
    
    A --> B
    B --> D
    C --> D
    D --> E
    F --> D
    G --> E
    H --> E
```

## 🚀 Setup de Integração

### **Passo 1: Configure o Orquestrador Python**

```bash
# 1. Clone o orquestrador Python
git clone https://github.com/Mosfet04/orquestradorIAPythonArgo.git
cd orquestradorIAPythonArgo

# 2. Configure o ambiente Python
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows

# 3. Instale dependências
pip install -r requirements.txt

# 4. Configure MongoDB
# Siga as instruções do README do orquestrador
```

### **Passo 2: Configure o Frontend (Este Projeto)**

```bash
# 1. Clone este projeto
git clone <este-repositorio>
cd agno-manager

# 2. Instale dependências
pnpm install

# 3. Configure .env.local
cp .env.example .env.local
```

### **Passo 3: Configuração do MongoDB Compartilhado**

#### **Opção A: MongoDB Local**
```env
# .env.local (Frontend)
MONGO_CONNECTION_STRING=mongodb://localhost:27017
MONGO_DATABASE_NAME=agno

# config.py (Python Orquestrador)
MONGODB_URI = "mongodb://localhost:27017"
DATABASE_NAME = "agno"
```

#### **Opção B: MongoDB Cloud (Atlas)**
```env
# .env.local (Frontend)
MONGO_CONNECTION_STRING=mongodb+srv://usuario:senha@cluster.mongodb.net/agno
MONGO_DATABASE_NAME=agno

# config.py (Python Orquestrador)
MONGODB_URI = "mongodb+srv://usuario:senha@cluster.mongodb.net/agno"
DATABASE_NAME = "agno"
```

#### **Opção C: Docker Compose**
```yaml
# docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=agno
      
  agno-frontend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGO_CONNECTION_STRING=mongodb://mongodb:27017
      - MONGO_DATABASE_NAME=agno
    depends_on:
      - mongodb
      
volumes:
  mongodb_data:
```

## 📊 Schema de Dados Compartilhado

### **Collection: `agents_config`**

```json
{
  "_id": ObjectId("..."),
  "id": "weather-assistant",           // ID único do agente
  "nome": "Assistente Meteorológico", // Nome descritivo
  "model": "llama3.2:latest",         // Modelo de IA
  "factoryIaModel": "ollama",         // Provider (ollama, openai, etc.)
  "descricao": "Assistente para...",  // Descrição opcional
  "prompt": "Você é um assistente...", // Prompt do sistema
  "active": true,                     // Status ativo/inativo
  "tools_ids": ["weather-api"],       // IDs das ferramentas associadas
  "rag_config": {                     // Configuração RAG (opcional)
    "active": true,
    "doc_name": "knowledge_base",
    "model": "text-embedding-3-small",
    "factoryIaModel": "openai"
  },
  "created_at": "2025-08-17T10:00:00.000Z",
  "updated_at": "2025-08-17T10:00:00.000Z"
}
```

### **Collection: `tools`**

```json
{
  "_id": ObjectId("..."),
  "id": "weather-api",                // ID único da ferramenta
  "name": "Weather API",              // Nome descritivo
  "description": "Obtém dados...",    // Descrição da funcionalidade
  "http_config": {
    "base_url": "https://api.openweathermap.org",
    "method": "GET",                  // GET, POST, PUT, DELETE
    "endpoint": "/data/2.5/weather",  // Endpoint específico
    "headers": {                      // Headers HTTP (autenticação, etc.)
      "API-Key": "sua-chave-api",
      "Content-Type": "application/json"
    },
    "parameters": [                   // Parâmetros da requisição
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

## 🔄 Fluxo de Sincronização

### **Como a Integração Funciona**

1. **Criação via Frontend**:
   ```
   Frontend → Next.js API → MongoDB → Disponível para Python
   ```

2. **Execução via Python**:
   ```
   Python → MongoDB → Carrega Configurações → Executa Agente
   ```

3. **Atualização em Tempo Real**:
   ```
   Qualquer Mudança → MongoDB → Refletida Imediatamente
   ```

### **Exemplo Prático**

#### **1. Criar Ferramenta no Frontend**
```typescript
// Via interface web
const tool = {
  id: "github-api",
  name: "GitHub API",
  description: "Busca repositórios GitHub",
  http_config: {
    base_url: "https://api.github.com",
    method: "GET",
    endpoint: "/search/repositories",
    headers: {
      "Accept": "application/vnd.github.v3+json"
    },
    parameters: [
      {
        "name": "q",
        "type": "string", 
        "description": "Termo de busca",
        "required": true
      }
    ]
  }
}
```

#### **2. Usar no Python Orquestrador**
```python
# tools.py - O orquestrador automaticamente detecta
from database import get_tools

def load_available_tools():
    tools = get_tools()  # Carrega do MongoDB
    for tool in tools:
        if tool['id'] == 'github-api':
            # Ferramenta criada no frontend está disponível!
            register_tool(tool)
```

#### **3. Criar Agente no Frontend**
```typescript
// Via interface web
const agent = {
  id: "github-assistant",
  nome: "Assistente GitHub",
  model: "gpt-4",
  factoryIaModel: "openai",
  prompt: "Você é um especialista em GitHub...",
  tools_ids: ["github-api"],  // Associa a ferramenta
  active: true
}
```

#### **4. Executar no Python**
```python
# agent_executor.py
def execute_agent(agent_id, user_message):
    agent_config = get_agent_config(agent_id)  # Carrega do MongoDB
    tools = load_agent_tools(agent_config['tools_ids'])
    
    # Agente configurado no frontend está pronto para uso!
    response = run_agent(agent_config, tools, user_message)
    return response
```

## 🔧 Configurações Avançadas

### **Providers Suportados**

#### **Frontend → Python Mapping**
```python
# Mapeamento de providers
PROVIDER_MAPPING = {
    'ollama': OllamaProvider,
    'openai': OpenAIProvider, 
    'anthropic': AnthropicProvider,
    'gemini': GeminiProvider,
    'groq': GroqProvider,
    'azure': AzureProvider
}

def get_provider(factory_model):
    return PROVIDER_MAPPING.get(factory_model)
```

### **Configuração RAG**
```python
# rag_manager.py
def setup_rag_from_config(rag_config):
    if rag_config.get('active'):
        embedding_model = rag_config['model']
        provider = rag_config['factoryIaModel']
        doc_name = rag_config['doc_name']
        
        # Configura RAG baseado nas configurações do frontend
        return initialize_rag(embedding_model, provider, doc_name)
```

### **HTTP Tools Integration**
```python
# http_tools.py
def execute_http_tool(tool_config, parameters):
    http_config = tool_config['http_config']
    
    url = f"{http_config['base_url']}{http_config['endpoint']}"
    method = http_config['method']
    headers = http_config.get('headers', {})
    
    # Executa requisição baseada na configuração do frontend
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        params=parameters if method == 'GET' else None,
        json=parameters if method == 'POST' else None
    )
    
    return response.json()
```

## 🔍 Troubleshooting

### **Problemas Comuns**

#### **1. Conexão MongoDB**
```bash
# Verificar se MongoDB está rodando
mongosh --eval "db.adminCommand('ismaster')"

# Testar conexão
mongosh "mongodb://localhost:27017/agno"
```

#### **2. Sincronização de Dados**
```bash
# Verificar collections no MongoDB
mongosh agno --eval "show collections"

# Verificar dados de agentes
mongosh agno --eval "db.agents_config.find().pretty()"

# Verificar dados de ferramentas
mongosh agno --eval "db.tools.find().pretty()"
```

#### **3. Variáveis de Ambiente**
```bash
# Frontend - verificar configuração
cat .env.local

# Python - verificar configuração
python -c "from config import MONGODB_URI, DATABASE_NAME; print(MONGODB_URI, DATABASE_NAME)"
```

### **Debug e Logs**

#### **Frontend Logs**
```bash
# Logs do desenvolvimento
pnpm dev

# Logs da API
curl http://localhost:3000/api/agents
curl http://localhost:3000/api/tools
```

#### **Python Logs**
```python
# Adicionar logs no orquestrador
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def load_agent_config(agent_id):
    logger.debug(f"Loading agent config for: {agent_id}")
    config = db.agents_config.find_one({"id": agent_id})
    logger.debug(f"Found config: {config}")
    return config
```

## 📋 Checklist de Integração

### **✅ Verificações Essenciais**

- [ ] MongoDB rodando e acessível
- [ ] Mesma connection string no frontend e Python
- [ ] Mesmo database name configurado
- [ ] Collections criadas (agents_config, tools)
- [ ] Variáveis de ambiente configuradas
- [ ] Providers de IA configurados
- [ ] Teste de criação via frontend
- [ ] Teste de execução via Python
- [ ] Sincronização funcionando
- [ ] Logs sem erros

### **🧪 Teste de Integração**

```bash
# 1. Criar agente via frontend
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-agent",
    "nome": "Test Agent", 
    "model": "gpt-3.5-turbo",
    "factoryIaModel": "openai",
    "prompt": "You are a test assistant",
    "active": true
  }'

# 2. Verificar no MongoDB
mongosh agno --eval "db.agents_config.findOne({id: 'test-agent'})"

# 3. Usar no Python
python -c "
from database import get_agent_config
config = get_agent_config('test-agent')
print('Integration successful!' if config else 'Integration failed!')
"
```

## 🎯 Próximos Passos

1. **Configure ambos os projetos** seguindo este guia
2. **Teste a integração** com o checklist acima
3. **Crie seus primeiros agentes** via interface web
4. **Execute via Python** para validar funcionamento
5. **Explore funcionalidades avançadas** como RAG e tools customizadas

## 🙏 Créditos e Origem

Este projeto é baseado no excelente [agno-agi Agent UI](https://github.com/agno-agi/agent-ui), desenvolvido pela equipe Agno. Adaptamos e estendemos o projeto original para:

- **Integração específica** com o [Orquestrador IA Python](https://github.com/Mosfet04/orquestradorIAPythonArgo)
- **Gerenciamento visual** de agentes e ferramentas HTTP
- **Sincronização automática** com MongoDB compartilhado
- **Interface administrativa** para configuração de sistemas IA

**Agradecimentos especiais à equipe Agno** por disponibilizar uma base sólida e bem estruturada que tornou este projeto possível.

---

**💡 Dica**: Mantenha sempre os dois projetos atualizados e use o mesmo schema de banco de dados para garantir compatibilidade total.
