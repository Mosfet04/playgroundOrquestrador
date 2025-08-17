import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { agentsCollection } from '@/lib/mongodb'
import { AgentConfig } from '@/types/management'

// GET - Buscar agente por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const agent = await agentsCollection.findOne({ id })

    if (!agent) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Agente não encontrado' 
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: agent
    })
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}

// PUT - Atualizar agente
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    // Verificar se o agente existe
    const existingAgent = await agentsCollection.findOne({ id })
    if (!existingAgent) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Agente não encontrado' 
        },
        { status: 404 }
      )
    }

    // Preparar dados para atualização
    const updateData: Partial<AgentConfig> = {
      nome: body.nome,
      model: body.model,
      factoryIaModel: body.factoryIaModel,
      descricao: body.descricao,
      prompt: body.prompt,
      active: body.active,
      tools_ids: body.tools_ids || [],
      updated_at: new Date()
    }

    // Atualizar configuração RAG se fornecida
    if (body.rag_active) {
      updateData.rag_config = {
        active: true,
        doc_name: body.rag_doc_name || '',
        model: body.rag_model || '',
        factoryIaModel: body.rag_factoryIaModel || 'openai'
      }
    } else {
      updateData.rag_config = undefined
    }

    const result = await agentsCollection.updateOne(
      { id },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Agente não encontrado' 
        },
        { status: 404 }
      )
    }

    // Buscar o agente atualizado
    const updatedAgent = await agentsCollection.findOne({ id })

    return NextResponse.json({
      success: true,
      data: updatedAgent,
      message: 'Agente atualizado com sucesso'
    })
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}

// DELETE - Deletar agente
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const result = await agentsCollection.deleteOne({ id })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Agente não encontrado' 
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Agente deletado com sucesso'
    })
  } catch (error) {
    console.error('Error deleting agent:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Erro interno do servidor' 
      },
      { status: 500 }
    )
  }
}
