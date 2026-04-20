import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateOrderFiscal } from '@/lib/fiscal/motor'
import { generateDanfePreviewPdf } from '@/lib/fiscal/transport/danfe-generator.service'
import { getPreviewBlockingErrors } from '@/lib/fiscal/preview-validation'

function toResponseBody(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const modelo = request.nextUrl.searchParams.get('modelo') === '65' ? '65' : '55'

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    const calcResult = await calculateOrderFiscal(orderId)
    if (!calcResult.success) {
      return NextResponse.json(
        { error: calcResult.error.message || 'Falha ao calcular preview fiscal do pedido.' },
        { status: 400 }
      )
    }

    const previewBlockingErrors = getPreviewBlockingErrors(calcResult.data.validation)
    if (previewBlockingErrors.length > 0) {
      const primaryMessage = previewBlockingErrors[0]?.message || 'Pedido fiscal invalido para gerar preview da DANFE.'
      return NextResponse.json(
        {
          error: primaryMessage,
          validation: {
            isValid: false,
            errors: previewBlockingErrors,
            warnings: calcResult.data.validation.warnings,
          },
        },
        { status: 422 }
      )
    }

    const result = await generateDanfePreviewPdf(orderId, calcResult.data, modelo)
    if (!result.success || !result.pdfBuffer) {
      return NextResponse.json(
        { error: result.error || 'Falha ao gerar preview da DANFE.' },
        { status: 500 }
      )
    }

    const fileName = `PREVIEW_DANFE_PEDIDO_${orderId}_${modelo}.pdf`

    return new NextResponse(toResponseBody(result.pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('[API:DANFE_PREVIEW] Error:', error)
    return NextResponse.json(
      { error: 'Erro interno ao gerar preview da DANFE.' },
      { status: 500 }
    )
  }
}
