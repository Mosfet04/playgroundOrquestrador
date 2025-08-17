// Script para limpar dados de teste do MongoDB
// Execute este script se quiser remover os dados de exemplo

db = db.getSiblingDB('agno');

// Remover apenas os dados de exemplo (pelos IDs conhecidos)
const exampleAgentIds = [
  "assistant-general",
  "coding-expert", 
  "data-analyst"
];

const exampleToolIds = [
  "weather-tool",
  "time-tool", 
  "github-tool",
  "data-api"
];

// Remover agentes de exemplo
const agentsRemoved = db.agents_config.deleteMany({
  id: { $in: exampleAgentIds }
});

// Remover tools de exemplo
const toolsRemoved = db.tools.deleteMany({
  id: { $in: exampleToolIds }
});

print("🧹 Limpeza concluída!");
print("🤖 Agentes removidos: " + agentsRemoved.deletedCount);
print("🛠️ Tools removidas: " + toolsRemoved.deletedCount);
print("");
print("📊 Agentes restantes: " + db.agents_config.countDocuments());
print("🛠️ Tools restantes: " + db.tools.countDocuments());
