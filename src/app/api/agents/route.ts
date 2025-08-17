import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { agentsCollection } from '@/lib/mongodb'
import { AgentConfig } from '@/types/management'

// GET - Listar todos os agentes
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const active = searchParams.get('active')
    const factoryIaModel = searchParams.get('factoryIaModel')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Construir filtros
    const filters: any = {}
    
    if (active !== null) {
      filters.active = active === 'true'
    }
    
    if (factoryIaModel) {
      filters.factoryIaModel = factoryIaModel
    }
    
    if (search) {
      filters.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { descricao: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } }
      ]
    }

    // Contar total
    const total = await agentsCollection.countDocuments(filters)
    
    // Buscar agentes com paginação
    const agents = await agentsCollection
      .find(filters)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      success: true,
      data: {
        data: agents,
        total,
        page,
        limit,
        totalPages
      }
    })
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}

// POST - Criar novo agente
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validação básica
    if (!body.id || !body.nome || !body.model || !body.factoryIaModel) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Campos obrigatórios: id, nome, model, factoryIaModel' 
        },
        { status: 400 }
      )
    }

    // Verificar se já existe um agente com o mesmo ID
    const existingAgent = await agentsCollection.findOne({ id: body.id })
    if (existingAgent) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Já existe um agente com este ID' 
        },
        { status: 409 }
      )
    }

    // Criar o agente
    const agentConfig: AgentConfig = {
      id: body.id,
      nome: body.nome,
      model: body.model,
      factoryIaModel: body.factoryIaModel,
      descricao: body.descricao || '',
      prompt: body.prompt || '',
      active: body.active !== undefined ? body.active : true,
      tools_ids: body.tools_ids || [],
      created_at: new Date(),
      updated_at: new Date()
    }

    // Adicionar configuração RAG se fornecida
    if (body.rag_active) {
      agentConfig.rag_config = {
        active: true,
        doc_name: body.rag_doc_name || '',
        model: body.rag_model || '',
        factoryIaModel: body.rag_factoryIaModel || 'openai'
      }
    }

    const result = await agentsCollection.insertOne(agentConfig)

    return NextResponse.json({
      success: true,
      data: { ...agentConfig, _id: result.insertedId },
      message: 'Agente criado com sucesso'
    })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}
