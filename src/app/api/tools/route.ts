import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { toolsCollection } from '@/lib/mongodb'
import { Tool } from '@/types/management'

// GET - Listar todas as tools
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const method = searchParams.get('method')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    // Construir filtros
    const filters: any = {}
    
    if (method) {
      filters['http_config.method'] = method
    }
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } }
      ]
    }

    // Contar total
    const total = await toolsCollection.countDocuments(filters)
    
    // Buscar tools com paginação
    const tools = await toolsCollection
      .find(filters)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    // Garantir que todos os tools tenham a estrutura correta
    const normalizedTools = tools.map(tool => ({
      ...tool,
      // Priorizar campos novos, fallback para http_config
      route: tool.route || (tool.http_config ? `${tool.http_config.base_url}${tool.http_config.endpoint}` : ''),
      http_method: tool.http_method || (tool.http_config ? tool.http_config.method : 'GET'),
      instructions: tool.instructions || '',
      active: tool.active !== undefined ? tool.active : true,
      // Manter http_config para compatibilidade
      http_config: tool.http_config || {
        base_url: '',
        method: tool.http_method || 'GET',
        endpoint: '',
        headers: tool.headers || {},
        parameters: tool.parameters || []
      }
    }))

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      success: true,
      data: {
        data: normalizedTools,
        total,
        page,
        limit,
        totalPages
      }
    })
  } catch (error) {
    console.error('Error fetching tools:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}

// POST - Criar nova tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validação básica - apenas name é obrigatório
    if (!body.name) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Nome é obrigatório' 
        },
        { status: 400 }
      )
    }

    // Preparar dados para criação
    const tool: Tool = {
      id: body.id || `tool_${Date.now()}`,
      name: body.name,
      description: body.description || '',
      route: body.route || `${body.base_url || ''}${body.endpoint || ''}`,
      http_method: body.http_method || body.method || 'GET',
      instructions: body.instructions || '',
      headers: body.headers || {},
      parameters: body.parameters || [],
      active: body.active !== undefined ? body.active : true,
      created_at: new Date(),
      updated_at: new Date()
    }

    // Manter http_config para compatibilidade reversa
    if (body.base_url || body.endpoint || body.method) {
      tool.http_config = {
        base_url: body.base_url || '',
        method: body.method || body.http_method || 'GET',
        endpoint: body.endpoint || '',
        headers: body.headers || {},
        parameters: body.parameters || []
      }
    }

    // Verificar se já existe uma tool com o mesmo ID
    const existingTool = await toolsCollection.findOne({ id: tool.id })
    if (existingTool) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Já existe uma tool com este ID' 
        },
        { status: 409 }
      )
    }

    const result = await toolsCollection.insertOne(tool)

    return NextResponse.json({
      success: true,
      data: { ...tool, _id: result.insertedId },
      message: 'Tool criada com sucesso'
    })
  } catch (error) {
    console.error('Error creating tool:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}
