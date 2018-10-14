import fastDiff from 'fast-diff'
import { TextDocument, TextEdit } from 'vscode-languageserver-protocol'

interface Change {
  start: number
  end: number
  newText: string
}

export function removeSemicolon(document: TextDocument, edits: TextEdit[]): TextEdit[] {
  let orig = document.getText()
  let content = TextDocument.applyEdits(document, edits)
  let result = content.split('\n').map(s => s.replace(/;$/, '')).join('\n')
  if (result == content) return edits
  let change = getChange(orig, result)
  return [{
    range: {
      start: document.positionAt(change.start),
      end: document.positionAt(change.end)
    },
    newText: change.newText
  }]
}

function getChange(oldStr: string, newStr: string): Change {
  let result = fastDiff(oldStr, newStr, 1)
  let curr = 0
  let start = -1
  let end = -1
  let newText = ''
  let remain = ''
  for (let item of result) {
    let [t, str] = item
    // equal
    if (t == 0) {
      curr = curr + str.length
      if (start != -1) remain = remain + str
    } else {
      if (start == -1) start = curr
      if (t == 1) {
        newText = newText + remain + str
        end = curr
      } else {
        newText = newText + remain
        end = curr + str.length
      }
      remain = ''
      if (t == -1) curr = curr + str.length
    }
  }
  return { start, end, newText }
}
