// Script para inserir dados de exemplo no MongoDB
// Execute este script para popular a base de dados com exemplos

db = db.getSiblingDB('agno');

// Inserir agentes de exemplo
db.agents_config.insertMany([
  {
    "id": "assistant-general",
    "nome": "Assistente Geral",
    "model": "llama3.2:latest",
    "factoryIaModel": "ollama",
    "descricao": "Um assistente útil para tarefas gerais e conversas",
    "prompt": "Você é um assistente útil e prestativo. Responda de forma clara e objetiva, ajudando o usuário com suas necessidades.",
    "active": true,
    "tools_ids": ["weather-tool", "time-tool"],
    "created_at": new Date(),
    "updated_at": new Date()
  },
  {
    "id": "coding-expert",
    "nome": "Expert em Programação",
    "model": "gpt-4",
    "factoryIaModel": "openai",
    "descricao": "Especialista em desenvolvimento de software e programação",
    "prompt": "Você é um expert em programação com 10+ anos de experiência. Ajude com códigos, debugging, arquitetura e melhores práticas.",
    "active": true,
    "tools_ids": ["github-tool"],
    "rag_config": {
      "active": true,
      "doc_name": "programming_docs",
      "model": "text-embedding-3-small",
      "factoryIaModel": "openai"
    },
    "created_at": new Date(),
    "updated_at": new Date()
  },
  {
    "id": "data-analyst",
    "nome": "Analista de Dados",
    "model": "claude-3-sonnet",
    "factoryIaModel": "anthropic",
    "descricao": "Especialista em análise de dados e machine learning",
    "prompt": "Você é um analista de dados experiente. Ajude com análises estatísticas, visualizações e insights de dados.",
    "active": false,
    "tools_ids": ["data-api"],
    "created_at": new Date(),
    "updated_at": new Date()
  }
]);

// Inserir tools de exemplo
db.tools.insertMany([
  {
    "id": "weather-tool",
    "name": "Weather API",
    "description": "Obtém informações meteorológicas atuais para qualquer cidade",
    "http_config": {
      "base_url": "https://api.openweathermap.org",
      "method": "GET",
      "endpoint": "/data/2.5/weather",
      "headers": {
        "Content-Type": "application/json"
      },
      "parameters": [
        {
          "name": "q",
          "type": "string",
          "description": "Nome da cidade",
          "required": true
        },
        {
          "name": "appid",
          "type": "string",
          "description": "API Key do OpenWeatherMap",
          "required": true
        },
        {
          "name": "units",
          "type": "string",
          "description": "Unidade de medida (metric, imperial)",
          "required": false,
          "default_value": "metric"
        }
      ]
    },
    "created_at": new Date(),
    "updated_at": new Date()
  },
  {
    "id": "time-tool",
    "name": "World Time API",
    "description": "Obtém a hora atual de qualquer timezone",
    "http_config": {
      "base_url": "https://worldtimeapi.org",
      "method": "GET",
      "endpoint": "/api/timezone",
      "headers": {},
      "parameters": [
        {
          "name": "timezone",
          "type": "string",
          "description": "Timezone (ex: America/Sao_Paulo)",
          "required": true
        }
      ]
    },
    "created_at": new Date(),
    "updated_at": new Date()
  },
  {
    "id": "github-tool",
    "name": "GitHub API",
    "description": "Busca informações de repositórios no GitHub",
    "http_config": {
      "base_url": "https://api.github.com",
      "method": "GET",
      "endpoint": "/repos",
      "headers": {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Agno-Agent"
      },
      "parameters": [
        {
          "name": "owner",
          "type": "string",
          "description": "Nome do proprietário do repositório",
          "required": true
        },
        {
          "name": "repo",
          "type": "string",
          "description": "Nome do repositório",
          "required": true
        }
      ]
    },
    "created_at": new Date(),
    "updated_at": new Date()
  },
  {
    "id": "data-api",
    "name": "JSONPlaceholder API",
    "description": "API de teste para dados fictícios",
    "http_config": {
      "base_url": "https://jsonplaceholder.typicode.com",
      "method": "GET",
      "endpoint": "/posts",
      "headers": {
        "Content-Type": "application/json"
      },
      "parameters": [
        {
          "name": "userId",
          "type": "number",
          "description": "ID do usuário",
          "required": false
        },
        {
          "name": "_limit",
          "type": "number",
          "description": "Limite de resultados",
          "required": false,
          "default_value": 10
        }
      ]
    },
    "created_at": new Date(),
    "updated_at": new Date()
  }
]);

print("✅ Dados de exemplo inseridos com sucesso!");
print("📊 Agentes criados: " + db.agents_config.countDocuments());
print("🛠️ Tools criadas: " + db.tools.countDocuments());
print("");
print("🌐 Acesse http://localhost:3000 para ver a aplicação");
print("🤖 Vá para a seção 'Agentes' para gerenciar os agentes");
print("🛠️ Vá para a seção 'Tools' para gerenciar as ferramentas");
