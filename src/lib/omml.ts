import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export type MathEntry = {
  html: string
  display: boolean
}

export type PreparedDocx = {
  docxBytes: Uint8Array
  mathHtmlMap: Map<string, MathEntry>
}

const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const TOKEN_RE = /⟦OMML_\d+⟧/g

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function childByLocalName(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child
  }
  return null
}

function childrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName)
}

function attrVal(el: Element | null, attrName = 'val'): string {
  if (!el) return ''
  return (
    el.getAttribute(`m:${attrName}`) ??
    el.getAttributeNS(OMML_NS, attrName) ??
    el.getAttribute(attrName) ??
    ''
  )
}

function renderOmmlChildren(node: Element): string {
  return Array.from(node.children).map(renderOmmlNode).join('')
}

function renderOmmlNode(node: Element): string {
  switch (node.localName) {
    case 'oMathPara':
    case 'oMath':
    case 'e':
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'deg':
    case 'lim':
    case 'box':
    case 'phant':
      return renderOmmlChildren(node)

    case 'r': {
      let text = ''
      for (const ch of Array.from(node.children)) {
        if (ch.localName === 't') text += ch.textContent ?? ''
      }
      return text ? `<span>${escapeHtml(text)}</span>` : ''
    }

    case 't':
      return escapeHtml(node.textContent ?? '')

    case 'f': {
      const fPr = childByLocalName(node, 'fPr')
      const fType = attrVal(childByLocalName(fPr ?? node, 'type'))
      const num = childByLocalName(node, 'num')
      const den = childByLocalName(node, 'den')
      const numHtml = num ? renderOmmlChildren(num) : ''
      const denHtml = den ? renderOmmlChildren(den) : ''
      if (fType === 'lin') {
        return `<span>${numHtml}/${denHtml}</span>`
      }
      return `<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 2px;line-height:1.15;font-size:0.92em;"><span style="padding:0 3px 1px;">${numHtml}</span><span style="border-top:1px solid currentColor;padding:1px 3px 0;width:100%;text-align:center;">${denHtml}</span></span>`
    }

    case 'rad': {
      const deg = childByLocalName(node, 'deg')
      const degHtml = deg ? renderOmmlChildren(deg).trim() : ''
      const e = childByLocalName(node, 'e')
      const bodyHtml = e ? renderOmmlChildren(e) : ''
      const supDeg = degHtml
        ? `<sup style="font-size:0.65em;margin-right:-1px;vertical-align:0.45em;">${degHtml}</sup>`
        : ''
      return `<span style="display:inline-flex;align-items:baseline;vertical-align:middle;margin:0 1px;">${supDeg}<span style="font-size:1.1em;line-height:1;margin-right:1px;">√</span><span style="border-top:1px solid currentColor;padding:1px 2px 0;">${bodyHtml}</span></span>`
    }

    case 'sSup': {
      const e = childByLocalName(node, 'e')
      const sup = childByLocalName(node, 'sup')
      return `<span>${e ? renderOmmlChildren(e) : ''}<sup style="font-size:0.75em;line-height:1;">${sup ? renderOmmlChildren(sup) : ''}</sup></span>`
    }

    case 'sSub': {
      const e = childByLocalName(node, 'e')
      const sub = childByLocalName(node, 'sub')
      return `<span>${e ? renderOmmlChildren(e) : ''}<sub style="font-size:0.75em;line-height:1;">${sub ? renderOmmlChildren(sub) : ''}</sub></span>`
    }

    case 'sSubSup': {
      const e = childByLocalName(node, 'e')
      const sub = childByLocalName(node, 'sub')
      const sup = childByLocalName(node, 'sup')
      const baseHtml = e ? renderOmmlChildren(e) : ''
      const subHtml = sub ? renderOmmlChildren(sub) : ''
      const supHtml = sup ? renderOmmlChildren(sup) : ''
      return `<span>${baseHtml}<span style="display:inline-flex;flex-direction:column;vertical-align:middle;font-size:0.7em;line-height:1.05;margin-left:1px;"><span>${supHtml}</span><span>${subHtml}</span></span></span>`
    }

    case 'nary': {
      const pr = childByLocalName(node, 'naryPr')
      const op = attrVal(pr ? childByLocalName(pr, 'chr') : null) || '∫'
      const sub = childByLocalName(node, 'sub')
      const sup = childByLocalName(node, 'sup')
      const e = childByLocalName(node, 'e')
      const subHtml = sub ? renderOmmlChildren(sub) : ''
      const supHtml = sup ? renderOmmlChildren(sup) : ''
      const bodyHtml = e ? renderOmmlChildren(e) : ''
      return `<span style="display:inline-flex;align-items:center;vertical-align:middle;margin:0 2px;"><span style="display:inline-flex;flex-direction:column;align-items:center;line-height:1;margin-right:2px;"><span style="font-size:0.65em;">${supHtml}</span><span style="font-size:1.3em;">${escapeHtml(op)}</span><span style="font-size:0.65em;">${subHtml}</span></span><span>${bodyHtml}</span></span>`
    }

    case 'd': {
      const pr = childByLocalName(node, 'dPr')
      const begEl = pr ? childByLocalName(pr, 'begChr') : null
      const endEl = pr ? childByLocalName(pr, 'endChr') : null
      const sepEl = pr ? childByLocalName(pr, 'sepChr') : null
      const beg = begEl ? attrVal(begEl) : '('
      const end = endEl ? attrVal(endEl) : ')'
      const sep = sepEl ? attrVal(sepEl) || ',' : ','
      const items = childrenByLocalName(node, 'e').map((el) => renderOmmlChildren(el))
      return `<span style="display:inline-flex;align-items:center;vertical-align:middle;">${beg ? `<span>${escapeHtml(beg)}</span>` : ''}${items.join(`<span>${escapeHtml(sep)} </span>`)}${end ? `<span>${escapeHtml(end)}</span>` : ''}</span>`
    }

    case 'eqArr': {
      const rows = childrenByLocalName(node, 'e').map(
        (el) => `<span style="display:block;text-align:left;">${renderOmmlChildren(el)}</span>`,
      )
      return `<span style="display:inline-flex;flex-direction:column;vertical-align:middle;gap:2px;border-left:1.5px solid currentColor;padding-left:6px;margin:0 2px;">${rows.join('')}</span>`
    }

    case 'm': {
      const rows = childrenByLocalName(node, 'mr')
        .map((mr) => {
          const cells = childrenByLocalName(mr, 'e')
            .map((cell) => `<td style="padding:1px 4px;text-align:center;">${renderOmmlChildren(cell)}</td>`)
            .join('')
          return `<tr>${cells}</tr>`
        })
        .join('')
      return `<table style="display:inline-table;vertical-align:middle;border-collapse:collapse;margin:0 2px;"><tbody>${rows}</tbody></table>`
    }

    case 'bar': {
      const e = childByLocalName(node, 'e')
      return `<span style="border-top:1px solid currentColor;padding-top:1px;">${e ? renderOmmlChildren(e) : ''}</span>`
    }

    case 'acc': {
      const pr = childByLocalName(node, 'accPr')
      const chr = attrVal(pr ? childByLocalName(pr, 'chr') : null) || '̂'
      const e = childByLocalName(node, 'e')
      const body = e ? renderOmmlChildren(e) : ''
      if (chr === '→' || chr === '⃗') {
        return `<span style="display:inline-flex;flex-direction:column;align-items:center;line-height:1;vertical-align:baseline;"><span style="font-size:0.7em;margin-bottom:-2px;">→</span><span>${body}</span></span>`
      }
      return `<span>${body}${escapeHtml(chr)}</span>`
    }

    case 'limLow':
    case 'limUpp': {
      const e = childByLocalName(node, 'e')
      const lim = childByLocalName(node, 'lim')
      const base = e ? renderOmmlChildren(e) : ''
      const limHtml = lim ? renderOmmlChildren(lim) : ''
      if (node.localName === 'limLow') {
        return `<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1.05;margin:0 2px;"><span>${base}</span><span style="font-size:0.7em;">${limHtml}</span></span>`
      }
      return `<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1.05;margin:0 2px;"><span style="font-size:0.7em;">${limHtml}</span><span>${base}</span></span>`
    }

    case 'func': {
      const fname = childByLocalName(node, 'fName')
      const e = childByLocalName(node, 'e')
      return `<span>${fname ? renderOmmlChildren(fname) : ''}&nbsp;${e ? renderOmmlChildren(e) : ''}</span>`
    }

    default:
      return renderOmmlChildren(node)
  }
}

function isInsideOmml(el: Element): boolean {
  let parent = el.parentElement
  while (parent) {
    if (parent.localName === 'oMathPara' || parent.localName === 'oMath') return true
    parent = parent.parentElement
  }
  return false
}

export function prepareDocxWithMath(arrayBuffer: ArrayBuffer): PreparedDocx {
  const rawBytes = new Uint8Array(arrayBuffer)
  const mathHtmlMap = new Map<string, MathEntry>()

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(rawBytes)
  } catch {
    return { docxBytes: rawBytes, mathHtmlMap }
  }

  const xmlTargets = Object.keys(files).filter((name) =>
    /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(name),
  )

  let modified = false
  let counter = 0
  const parser = new DOMParser()
  const serializer = new XMLSerializer()

  for (const name of xmlTargets) {
    const xmlStr = strFromU8(files[name])
    if (!xmlStr.includes('oMath')) continue

    const doc = parser.parseFromString(xmlStr, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length > 0) continue

    const candidates: Element[] = [
      ...Array.from(doc.getElementsByTagNameNS(OMML_NS, 'oMathPara')),
      ...Array.from(doc.getElementsByTagNameNS(OMML_NS, 'oMath')),
    ].filter((el) => !isInsideOmml(el))

    if (!candidates.length) continue

    for (const el of candidates) {
      const token = `⟦OMML_${counter}⟧`
      counter += 1
      const display = el.localName === 'oMathPara'
      const html = renderOmmlNode(el)
      mathHtmlMap.set(token, { html, display })

      const parent = el.parentNode
      if (!parent) continue

      const tNode = doc.createElementNS(W_NS, 'w:t')
      tNode.textContent = token

      if (parent instanceof Element && parent.localName === 'r') {
        parent.replaceChild(tNode, el)
      } else {
        const rNode = doc.createElementNS(W_NS, 'w:r')
        rNode.appendChild(tNode)
        parent.replaceChild(rNode, el)
      }
      modified = true
    }

    if (modified) {
      files[name] = strToU8(serializer.serializeToString(doc))
    }
  }

  if (!modified) {
    return { docxBytes: rawBytes, mathHtmlMap }
  }

  return {
    docxBytes: zipSync(files, { level: 0 }),
    mathHtmlMap,
  }
}

export function injectMathPlaceholders(root: HTMLElement, mathHtmlMap: Map<string, MathEntry>): void {
  if (!mathHtmlMap.size) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    if (current instanceof Text && current.nodeValue && current.nodeValue.includes('⟦OMML_')) {
      nodes.push(current)
    }
    current = walker.nextNode()
  }

  for (const textNode of nodes) {
    const value = textNode.nodeValue ?? ''
    TOKEN_RE.lastIndex = 0
    if (!TOKEN_RE.test(value)) continue
    TOKEN_RE.lastIndex = 0

    const frag = document.createDocumentFragment()
    let cursor = 0
    let match = TOKEN_RE.exec(value)
    while (match) {
      if (match.index > cursor) {
        frag.appendChild(document.createTextNode(value.slice(cursor, match.index)))
      }
      const token = match[0]
      const entry = mathHtmlMap.get(token)
      if (entry) {
        const span = document.createElement('span')
        span.className = 'docx-omml'
        span.style.cssText = entry.display
          ? 'display:block;text-align:center;margin:6px 0;font-family:"Cambria Math","Times New Roman",serif;'
          : 'display:inline-block;vertical-align:middle;font-family:"Cambria Math","Times New Roman",serif;'
        span.innerHTML = entry.html
        frag.appendChild(span)
      } else {
        frag.appendChild(document.createTextNode(token))
      }
      cursor = match.index + token.length
      match = TOKEN_RE.exec(value)
    }
    if (cursor < value.length) {
      frag.appendChild(document.createTextNode(value.slice(cursor)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}
