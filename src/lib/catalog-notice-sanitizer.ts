import 'server-only'

import { render } from 'dom-serializer'
import { Element, Text, isTag, isText, type ChildNode } from 'domhandler'
import { parseDocument } from 'htmlparser2'

import {
  getCatalogNoticeCharacterCount,
  normalizeCatalogNoticePlainText,
} from '@/lib/catalog-notice'

const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h3', 'h4', 'a'])
const INLINE_TAGS = new Set(['strong', 'em', 'u', 'a'])
const BLOCK_TAGS = new Set(['p', 'h3', 'h4'])
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'])
const NEW_TAB_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export interface CatalogNoticeSanitizationResult {
  html: string | null
  plainText: string | null
  characterCount: number
}

export function sanitizeCatalogNoticeContent(value: string | null | undefined): CatalogNoticeSanitizationResult {
  if (!value || value.trim() === '') {
    return { html: null, plainText: null, characterCount: 0 }
  }

  const document = parseDocument(value, { decodeEntities: true })
  const sanitizedNodes = sanitizeNodeList(document.children)
  const plainText = normalizeCatalogNoticePlainText(extractPlainText(sanitizedNodes))
  const characterCount = getCatalogNoticeCharacterCount(extractCharacterCountText(sanitizedNodes))

  if (!plainText) {
    return { html: null, plainText: null, characterCount: 0 }
  }

  const html = render(sanitizedNodes, { encodeEntities: 'utf8' }).trim()

  return {
    html: html.length > 0 ? html : null,
    plainText,
    characterCount,
  }
}

function sanitizeNodeList(nodes: ChildNode[]): ChildNode[] {
  const sanitized: ChildNode[] = []

  nodes.forEach((node, index) => {
    const nextNodes = sanitizeNode(node, nodes, index)

    nextNodes.forEach((nextNode) => {
      if (isText(nextNode) && nextNode.data === '') return

      const lastNode = sanitized[sanitized.length - 1]

      if (lastNode && isText(lastNode) && isText(nextNode)) {
        lastNode.data += nextNode.data
        return
      }

      sanitized.push(nextNode)
    })
  })

  return sanitized
}

function sanitizeNode(node: ChildNode, siblings: ChildNode[], index: number): ChildNode[] {
  if (isText(node)) {
    return sanitizeTextNode(node.data, siblings, index)
  }

  if (!isTag(node)) {
    return []
  }

  const tagName = node.name.toLowerCase()

  if (DROP_CONTENT_TAGS.has(tagName)) {
    return []
  }

  const children = sanitizeNodeList(node.children ?? [])

  if (!ALLOWED_TAGS.has(tagName)) {
    return children
  }

  if (tagName === 'br') {
    return [createElement('br')]
  }

  if (tagName === 'a') {
    const href = sanitizeHref(node.attribs?.href)

    if (!href) {
      return children
    }

    if (!hasMeaningfulContent(children)) {
      return []
    }

    const attributes: Record<string, string> = { href }

    if (shouldOpenInNewTab(href)) {
      attributes.target = '_blank'
      attributes.rel = 'noopener noreferrer nofollow'
    }

    return [createElement('a', attributes, children)]
  }

  if ((tagName === 'ul' || tagName === 'ol')) {
    const listItems = children.filter((child): child is Element => isTag(child) && child.name === 'li')

    if (listItems.length === 0) {
      return []
    }

    return [createElement(tagName, {}, listItems)]
  }

  if (tagName === 'li' && !hasMeaningfulContent(children)) {
    return []
  }

  if (BLOCK_TAGS.has(tagName) && !hasMeaningfulContent(children)) {
    return []
  }

  const textAlign = sanitizeTextAlign(node.attribs?.style, node.attribs?.align)
  const attributes: Record<string, string> = {}

  if (textAlign === 'center' && BLOCK_TAGS.has(tagName)) {
    attributes.style = 'text-align: center'
  }

  return [createElement(tagName, attributes, children)]
}

function sanitizeTextNode(value: string, siblings: ChildNode[], index: number): ChildNode[] {
  const collapsed = value.replace(/\s+/g, ' ')

  if (collapsed.trim() === '') {
    return shouldPreserveWhitespace(siblings, index) ? [new Text(' ')] : []
  }

  return [new Text(collapsed)]
}

function shouldPreserveWhitespace(siblings: ChildNode[], index: number): boolean {
  const previous = findSibling(siblings, index, -1)
  const next = findSibling(siblings, index, 1)

  return isInlineLike(previous) && isInlineLike(next)
}

function findSibling(siblings: ChildNode[], startIndex: number, step: -1 | 1): ChildNode | null {
  let cursor = startIndex + step

  while (cursor >= 0 && cursor < siblings.length) {
    const node = siblings[cursor]

    if (isText(node) && node.data.trim() === '') {
      cursor += step
      continue
    }

    return node
  }

  return null
}

function isInlineLike(node: ChildNode | null): boolean {
  if (!node) return false
  if (isText(node)) return node.data.trim().length > 0
  if (!isTag(node)) return false

  const tagName = node.name.toLowerCase()
  return INLINE_TAGS.has(tagName) || tagName === 'br'
}

function hasMeaningfulContent(nodes: ChildNode[]): boolean {
  return nodes.some((node) => {
    if (isText(node)) {
      return node.data.trim().length > 0
    }

    if (!isTag(node)) {
      return false
    }

    if (node.name === 'br') {
      return true
    }

    return hasMeaningfulContent(node.children ?? [])
  })
}

function createElement(name: string, attributes: Record<string, string> = {}, children: ChildNode[] = []): Element {
  const element = new Element(name, attributes, children)

  children.forEach((child, index) => {
    child.parent = element
    child.prev = index > 0 ? children[index - 1] : null
    child.next = index < children.length - 1 ? children[index + 1] : null
  })

  return element
}

function sanitizeHref(value: string | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

function shouldOpenInNewTab(href: string): boolean {
  try {
    return NEW_TAB_PROTOCOLS.has(new URL(href).protocol)
  } catch {
    return false
  }
}

function sanitizeTextAlign(style: string | undefined, align: string | undefined): 'left' | 'center' | null {
  const styleMatch = style?.match(/text-align\s*:\s*(left|center)/i)
  const styleValue = styleMatch?.[1]?.toLowerCase()

  if (styleValue === 'left' || styleValue === 'center') {
    return styleValue
  }

  const alignValue = align?.trim().toLowerCase()

  if (alignValue === 'left' || alignValue === 'center') {
    return alignValue
  }

  return null
}

function extractPlainText(nodes: ChildNode[]): string {
  return nodes.map((node) => extractNodePlainText(node)).join('')
}

function extractCharacterCountText(nodes: ChildNode[]): string {
  return nodes.map((node) => extractNodePlainText(node, false)).join('')
}

function extractNodePlainText(node: ChildNode, includeListPrefixes = true): string {
  if (isText(node)) {
    return node.data
  }

  if (!isTag(node)) {
    return ''
  }

  const tagName = node.name.toLowerCase()

  if (tagName === 'br') {
    return '\n'
  }

  if (tagName === 'ul' || tagName === 'ol') {
    const items = (node.children ?? []).map((child) => extractListItemText(child, includeListPrefixes)).filter(Boolean)
    return items.length > 0 ? `${items.join('\n')}\n\n` : ''
  }

  if (tagName === 'li') {
    return extractListItemText(node, includeListPrefixes)
  }

  const content = (node.children ?? []).map((child) => extractNodePlainText(child, includeListPrefixes)).join('')

  if (tagName === 'p' || tagName === 'h3' || tagName === 'h4') {
    const normalized = normalizeCatalogNoticePlainText(content)
    return normalized ? `${normalized}\n\n` : ''
  }

  return content
}

function extractListItemText(node: ChildNode, includePrefix = true): string {
  if (!isTag(node) || node.name.toLowerCase() !== 'li') {
    return ''
  }

  const content = normalizeCatalogNoticePlainText(
    (node.children ?? []).map((child) => extractNodePlainText(child, includePrefix)).join(''),
  )

  if (!content) {
    return ''
  }

  const normalizedContent = content.replace(/\n+/g, ' ')
  return includePrefix ? `- ${normalizedContent}` : normalizedContent
}
