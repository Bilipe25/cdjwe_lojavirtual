import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateDanfePdf } from '@/lib/fiscal/transport/danfe-generator.service'

function toResponseBody(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params

    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    // Check if DANFE already exists in storage
    const serviceRole = createServiceRoleClient()
    const { data: doc } = await serviceRole
      .from('fiscal_documents')
      .select('danfe_path, numero_nf, serie, order_id')
      .eq('id', documentId)
      .single()

    if (!doc) {
      return NextResponse.json({ error: 'Documento fiscal não encontrado.' }, { status: 404 })
    }

    // If DANFE already generated, try to serve from storage
    if (doc.danfe_path) {
      const { data: fileData, error: downloadError } = await serviceRole.storage
        .from('fiscal-xml')
        .download(doc.danfe_path)

      if (!downloadError && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer())
        const fileName = `DANFE_${doc.numero_nf || 'sem_numero'}_serie_${doc.serie || '0'}.pdf`

        return new NextResponse(toResponseBody(buffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${fileName}"`,
            'Cache-Control': 'private, max-age=300',
          },
        })
      }
    }

    // Generate DANFE on-the-fly
    const result = await generateDanfePdf(documentId)

    if (!result.success || !result.pdfBuffer) {
      return NextResponse.json(
        { error: result.error || 'Falha ao gerar DANFE.' },
        { status: 500 }
      )
    }

    const fileName = `DANFE_${doc.numero_nf || 'sem_numero'}_serie_${doc.serie || '0'}.pdf`

    return new NextResponse(toResponseBody(result.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    console.error('[API:DANFE] Error:', error)
    return NextResponse.json(
      { error: 'Erro interno ao gerar DANFE.' },
      { status: 500 }
    )
  }
}
