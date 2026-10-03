import katex from 'katex'
import 'katex/dist/katex.min.css'

const DELIMITERS = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?:\\.|[^$])+?(?<!\\)\$)/g

export function MathText({ text }: { text: string }) {
  return <>{text.split(DELIMITERS).map((part, index) => {
    const display = (part.startsWith('\\[') && part.endsWith('\\]')) || (part.startsWith('$$') && part.endsWith('$$'))
    const inline = (part.startsWith('\\(') && part.endsWith('\\)')) || (part.startsWith('$') && part.endsWith('$'))
    if (!display && !inline) return part
    const math = part.startsWith('\\') ? part.slice(2, -2) : display ? part.slice(2, -2) : part.slice(1, -1)
    try {
      const html = katex.renderToString(math, { displayMode: display, throwOnError: true, trust: false })
      return <span className={display ? 'dataset-math-display' : 'dataset-math-inline'} key={index} dangerouslySetInnerHTML={{ __html: html }} />
    } catch {
      return part
    }
  })}</>
}
