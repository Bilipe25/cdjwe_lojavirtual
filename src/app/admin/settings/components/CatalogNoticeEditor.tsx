'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { CharacterCount } from '@tiptap/extension-character-count'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Eraser,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
  Underline as UnderlineIcon,
  Unlink,
} from 'lucide-react'

import { NoticeCard } from '@/components/store/NoticeCard'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  CATALOG_NOTICE_MAX_CHARACTERS,
  getCatalogNoticeCharacterCount,
  plainTextToCatalogNoticeHtml,
} from '@/lib/catalog-notice'
import { cn } from '@/lib/utils'

type CatalogNoticeType = 'info' | 'promotion' | 'attention' | 'message'

interface CatalogNoticeEditorProps {
  className?: string
  placeholder?: string
  value: string
  noticeType: CatalogNoticeType
  onChange: (value: string) => void
}

interface ToolbarButtonProps {
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  title: string
}

const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ active = false, children, disabled = false, onClick, title }, ref) => {
    return (
      <Button
        ref={ref}
        type="button"
        variant={active ? 'secondary' : 'outline'}
        size="sm"
        title={title}
        aria-label={title}
        aria-pressed={active}
        disabled={disabled}
        className={cn(
          'h-8 rounded-lg border-border/70 bg-white/70 px-2.5 shadow-none',
          active && 'border-bronze/40 bg-bronze/10 text-bronze hover:bg-bronze/15',
        )}
        onClick={onClick}
      >
        {children}
      </Button>
    )
  },
)

ToolbarButton.displayName = 'ToolbarButton'

function normalizeLinkInput(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) return ''

  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return trimmed
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed)) {
    return `mailto:${trimmed}`
  }

  if (/^\+?[0-9()\-\s.]{8,}$/i.test(trimmed)) {
    const normalizedNumber = trimmed.replace(/(?!^\+)[^\d]/g, '')
    return normalizedNumber ? `tel:${normalizedNumber}` : ''
  }

  if (/^www\./i.test(trimmed) || /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) {
    return `https://${trimmed}`
  }

  return trimmed
}

export function CatalogNoticeEditor({
  className,
  placeholder = 'Escreva um aviso profissional para aparecer no catálogo, no dashboard do cliente e na visualização do representante.',
  value,
  noticeType,
  onChange,
}: CatalogNoticeEditorProps) {
  const resolvedPlaceholder = placeholder.trim().startsWith('Ex:')
    ? 'Escreva um aviso profissional para aparecer no catálogo, no dashboard do cliente e na visualização do representante.'
    : placeholder
  const [, setEditorVersion] = useState(0)
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: {
          levels: [3, 4],
        },
        horizontalRule: false,
        link: false,
        strike: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        autolink: false,
        enableClickSelection: true,
        linkOnPaste: true,
        openOnClick: false,
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
          class: null,
        },
      }),
      TextAlign.configure({
        types: ['paragraph', 'heading'],
        alignments: ['left', 'center'],
      }),
      Placeholder.configure({
        placeholder: resolvedPlaceholder,
      }),
      CharacterCount.configure({
        limit: CATALOG_NOTICE_MAX_CHARACTERS,
      }),
    ],
    content: value || '<p></p>',
    editorProps: {
      attributes: {
        class: 'catalog-notice-prosemirror',
      },
    },
    onCreate: () => {
      setEditorVersion((current) => current + 1)
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(instance.isEmpty ? '' : instance.getHTML())
      setEditorVersion((current) => current + 1)
    },
    onSelectionUpdate: () => {
      setEditorVersion((current) => current + 1)
    },
  })

  useEffect(() => {
    if (!editor) return

    const currentValue = editor.isEmpty ? '' : editor.getHTML()
    const nextValue = value || ''

    if (currentValue === nextValue) {
      return
    }

    editor.commands.setContent(nextValue || '<p></p>', { emitUpdate: false })
  }, [editor, value])

  const characterCount = editor?.storage.characterCount?.characters() ?? getCatalogNoticeCharacterCount(value)
  const isAtLimit = characterCount >= CATALOG_NOTICE_MAX_CHARACTERS
  const normalizedLink = useMemo(() => normalizeLinkInput(linkValue), [linkValue])
  const canApplyLink = Boolean(editor && normalizedLink && (editor.isActive('link') || !editor.state.selection.empty))

  if (!editor) {
    return (
      <div className="rounded-2xl border border-border/70 bg-white/70 p-4 shadow-sm">
        <div className="h-40 animate-pulse rounded-xl bg-muted/50" />
      </div>
    )
  }

  const handleApplyLink = () => {
    if (!canApplyLink) return

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedLink }).run()
    setLinkPopoverOpen(false)
    setLinkValue('')
  }

  const handleClearFormatting = () => {
    editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run()
  }

  const previewHtml = value || plainTextToCatalogNoticeHtml(editor.getText({ blockSeparator: '\n\n' }))

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-white/65 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-3">
          <ToolbarButton
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
            title="Desfazer"
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
            title="Refazer"
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-8" />

          <ToolbarButton
            active={editor.isActive('paragraph')}
            onClick={() => editor.chain().focus().setParagraph().run()}
            title="Texto"
          >
            Texto
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive('heading', { level: 4 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            title="Destaque"
          >
            Destaque
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Título curto"
          >
            Título curto
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-8" />

          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Negrito"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Itálico"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Sublinhado"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-8" />

          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista com marcadores"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Lista numerada"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-8" />

          <ToolbarButton
            active={editor.isActive({ textAlign: 'left' }) || !editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Alinhar à esquerda"
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Centralizar"
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="mx-1 h-8" />

          <Popover
            open={linkPopoverOpen}
            onOpenChange={(open) => {
              setLinkPopoverOpen(open)
              if (open) {
                setLinkValue(editor.getAttributes('link').href ?? '')
              }
            }}
          >
            <PopoverTrigger
              type="button"
              title="Inserir ou editar link"
              aria-label="Inserir ou editar link"
              aria-pressed={editor.isActive('link')}
              className={cn(
                buttonVariants({ variant: editor.isActive('link') ? 'secondary' : 'outline', size: 'sm' }),
                'h-8 rounded-lg border-border/70 bg-white/70 px-2.5 shadow-none',
                editor.isActive('link') && 'border-bronze/40 bg-bronze/10 text-bronze hover:bg-bronze/15',
              )}
            >
                <Link2 className="h-4 w-4" />
            </PopoverTrigger>

            <PopoverContent className="w-80 gap-3">
              <PopoverHeader>
                <PopoverTitle>Inserir link</PopoverTitle>
                <PopoverDescription>
                  Selecione um texto e informe uma URL, e-mail ou telefone. Exemplos: `https://`, `mailto:` ou `tel:`.
                </PopoverDescription>
              </PopoverHeader>

              <Input
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                placeholder="https://exemplo.com.br"
                className="bg-white"
              />

              <div className="flex items-center justify-end gap-2">
                {editor.isActive('link') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      editor.chain().focus().extendMarkRange('link').unsetLink().run()
                      setLinkPopoverOpen(false)
                      setLinkValue('')
                    }}
                  >
                    <Unlink className="mr-1 h-4 w-4" />
                    Remover
                  </Button>
                )}

                <Button type="button" size="sm" disabled={!canApplyLink} onClick={handleApplyLink}>
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <ToolbarButton active={false} onClick={handleClearFormatting} title="Limpar formatação">
            <Eraser className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <EditorContent editor={editor} className={cn('catalog-notice-editor', className)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          `Enter` cria um novo parágrafo e `Shift + Enter` insere quebra de linha no mesmo bloco.
        </p>
        <span className={cn('rounded-full border px-2.5 py-1 font-medium', isAtLimit ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-border/70 bg-white/70')}>
          {characterCount}/{CATALOG_NOTICE_MAX_CHARACTERS}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy">Preview ao vivo</h3>
          <p className="text-xs text-muted-foreground">O cliente verá este card no dashboard e no catálogo.</p>
        </div>

        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-3">
          <NoticeCard notice={null} noticeHtml={previewHtml || null} type={noticeType} />
        </div>
      </div>
    </div>
  )
}
