// Formato do ID de agent, team e tool na criação (D-QA1-06-2). Só o playground
// o exige: o orquestrador aceita qualquer id, e o gravado fora dele segue editável.
export const ENTITY_ID = /^[a-z0-9_-]+$/
