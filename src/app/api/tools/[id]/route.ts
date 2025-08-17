import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { toolsCollection } from '@/lib/mongodb'
import { Tool } from '@/types/management'

// GET - Buscar tool por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

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
        base_url: tool.route ? new URL(tool.route).origin : '',
        method: tool.http_method || 'GET',
        endpoint: tool.route ? new URL(tool.route).pathname + new URL(tool.route).search : '',
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

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
