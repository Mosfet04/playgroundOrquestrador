import { NextRequest, NextResponse } from 'next/server'
import { toolsCollection } from '@/lib/mongodb'
import { Tool } from '@/types/management'

import { parseJsonBody } from '../../parseJsonBody'
import { toolBodySchema } from '../schema'

type RouteParams = { params: Promise<{ id: string }> }

// `route` de documento legado pode não ser URL http(s) absoluta (ex.:
// `/v1/x`, `localhost:8080/x`, que o URL lê com protocolo `localhost:`): vira só endpoint.
function splitRoute(route: string) {
  const asEndpoint = { base_url: '', endpoint: route }
  try {
    const url = new URL(route)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return asEndpoint
    return { base_url: url.origin, endpoint: url.pathname + url.search }
  } catch {
    return asEndpoint
  }
}

// GET - Buscar tool por ID
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params

    const tool = await toolsCollection.findOne({ id })

    if (!tool) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Tool não encontrada' 
        },
        { status: 404 }
      )
    }

    // Garantir que a tool tenha a estrutura correta
    const normalizedTool = {
      ...tool,
      // Se a tool tem o formato novo (route + http_method), use esse
      route: tool.route || `${tool.http_config?.base_url || ''}${tool.http_config?.endpoint || ''}`,
      http_method: tool.http_method || tool.http_config?.method || 'GET',
      instructions: tool.instructions || '',
      headers: tool.headers || tool.http_config?.headers || {},
      parameters: tool.parameters || tool.http_config?.parameters || [],
      active: tool.active !== undefined ? tool.active : true,
      
      // Manter http_config para compatibilidade reversa
      http_config: tool.http_config || {
        ...(tool.route ? splitRoute(tool.route) : { base_url: '', endpoint: '' }),
        method: tool.http_method || 'GET',
        headers: tool.headers || {},
        parameters: tool.parameters || []
      }
    }

    return NextResponse.json({
      success: true,
      data: normalizedTool
    })
  } catch (error) {
    console.error('Error fetching tool:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}

// PUT - Atualizar tool
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const parsed = await parseJsonBody(request, toolBodySchema)
    if (!parsed.success) return parsed.response
    const body = parsed.data

    // Verificar se a tool existe
    const existingTool = await toolsCollection.findOne({ id })
    if (!existingTool) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Tool não encontrada' 
        },
        { status: 404 }
      )
    }

    // Preparar dados para atualização
    const updateData: Partial<Tool> = {
      name: body.name,
      description: body.description,
      route: body.route || `${body.base_url || ''}${body.endpoint || ''}`,
      http_method: body.http_method || body.method || 'GET',
      instructions: body.instructions || '',
      headers: body.headers || {},
      parameters: body.parameters || [],
      active: body.active !== undefined ? body.active : true,
      updated_at: new Date()
    }

    // Manter http_config para compatibilidade reversa
    if (body.base_url || body.endpoint) {
      updateData.http_config = {
        base_url: body.base_url || '',
        method: body.method || body.http_method || 'GET',
        endpoint: body.endpoint || '',
        headers: body.headers || {},
        parameters: body.parameters || []
      }
    }

    const result = await toolsCollection.updateOne(
      { id },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Tool não encontrada' 
        },
        { status: 404 }
      )
    }

    // Buscar a tool atualizada
    const updatedTool = await toolsCollection.findOne({ id })

    return NextResponse.json({
      success: true,
      data: updatedTool,
      message: 'Tool atualizada com sucesso'
    })
  } catch (error) {
    console.error('Error updating tool:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}

// DELETE - Deletar tool
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params

    const result = await toolsCollection.deleteOne({ id })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Tool não encontrada' 
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Tool deletada com sucesso'
    })
  } catch (error) {
    console.error('Error deleting tool:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}
