import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { Fabric, FabricColor } from '@/lib/types'

// Initialize pdfMake fonts
if (pdfFonts && (pdfFonts as any).pdfMake) {
  ;(pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs
} else if (pdfFonts) {
  ;(pdfMake as any).vfs = (pdfFonts as any).vfs || pdfFonts
}

type FabricWithColors = Fabric & { colors: FabricColor[] }

export async function generateFabricCatalogPDF(
  fabrics: FabricWithColors[],
  settings?: { system_name?: string; logo_url?: string | null }
) {
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    header: (currentPage: number) => {
      if (currentPage === 1) return null
      return {
        text: settings?.system_name || 'Catálogo de Tecidos',
        alignment: 'right',
        margin: [40, 20, 40, 0],
        fontSize: 8,
        color: '#999999'
      }
    },
    footer: (currentPage: number, pageCount: number) => {
      return {
        columns: [
          {
            text: `Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
            alignment: 'left',
            fontSize: 8,
            color: '#999999'
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            alignment: 'right',
            fontSize: 8,
            color: '#999999'
          }
        ],
        margin: [40, 20, 40, 0]
      }
    },
    content: [
      // Banner / Hero
      {
        stack: [
          {
            text: settings?.system_name || 'CDJWE',
            fontSize: 10,
            bold: true,
            color: '#c2410c', // Bronze-ish
            characterSpacing: 2,
            margin: [0, 0, 0, 4]
          },
          {
            text: 'CATÁLOGO DE TECIDOS',
            fontSize: 28,
            bold: true,
            color: '#0f172a', // Navy
            margin: [0, 0, 0, 8]
          },
          {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 3, lineColor: '#0f172a' }]
          }
        ],
        margin: [0, 0, 0, 40]
      },

      ...fabrics.map((fabric, index) => {
        return {
          stack: [
            // Fabric Title
            {
              columns: [
                {
                  text: fabric.name.toUpperCase(),
                  fontSize: 16,
                  bold: true,
                  color: '#0f172a',
                  width: 'auto'
                },
                {
                  text: `${fabric.colors.length} OPÇÕES DISPONÍVEIS`,
                  fontSize: 8,
                  bold: true,
                  color: '#c2410c',
                  alignment: 'right',
                  margin: [0, 6, 0, 0]
                }
              ]
            },
            {
              text: fabric.description || 'Tecido de alta qualidade para coleções premium.',
              fontSize: 9,
              color: '#64748b',
              margin: [0, 4, 0, 12]
            },
            
            // Color Grid
            {
              layout: 'noBorders',
              table: {
                widths: ['*', '*', '*', '*'], // 4 columns
                body: chunkColors(fabric.colors, 4).map(row => 
                  row.map(color => ({
                    stack: [
                      {
                        canvas: [
                          {
                            type: 'rect',
                            x: 0,
                            y: 0,
                            w: 110,
                            h: 60,
                            r: 8,
                            color: color.hex_code || '#f3f4f6',
                            lineColor: '#e2e8f0',
                            lineWidth: 0.5
                          }
                        ],
                        margin: [0, 0, 0, 5]
                      },
                      {
                        text: color.name.toUpperCase(),
                        fontSize: 8,
                        bold: true,
                        color: '#334155',
                        alignment: 'center'
                      },
                      {
                        text: color.hex_code || '',
                        fontSize: 6,
                        color: '#94a3b8',
                        alignment: 'center',
                        margin: [0, 2, 0, 0]
                      }
                    ],
                    margin: [5, 5, 5, 15]
                  }))
                )
              }
            },
            index < fabrics.length - 1 ? { text: '', pageBreak: 'after', margin: [0, 0, 0, 0] } as any : null
          ].filter(Boolean)
        }
      })
    ],
    styles: {
      header: {
        fontSize: 18,
        bold: true,
        margin: [0, 0, 0, 10]
      }
    },
    defaultStyle: {
      font: 'Roboto'
    }
  }

  pdfMake.createPdf(docDefinition).download(`Catalogo-Tecidos-${settings?.system_name || 'CDJWE'}.pdf`)
}

// Utility to chunk array into rows
function chunkColors(array: FabricColor[], size: number) {
  const result: FabricColor[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  // Fill last row with empty slots to maintain grid widths
  if (result.length > 0) {
    const lastRow = result[result.length - 1]
    while (lastRow.length < size) {
      lastRow.push({ id: `empty-${lastRow.length}`, name: '', hex_code: '', is_active: true } as any)
    }
  }
  return result
}
