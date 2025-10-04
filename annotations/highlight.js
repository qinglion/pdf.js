import { Util, AnnotationType } from 'pdfjs-lib'

function _combine (left, right) {
  if (left.y + 3 >= right.y) {
    return {
      x: left.x,
      y: left.y,
      width: right.x + right.width - left.x,
      height: left.height
    }
  }
}

function mergeCrossedRects (rects) {
  let store = new Set()
  let left
  if (rects.length < 2) {
    return [rects[0]]
  }
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index]
    const ended = index === rects.length - 1
    if (left) {
      let right = _combine(left, rect)
      if (right) {
        ended ? store.add(right) : (left=right)
      } else {
        store.add(left)
        ended ? store.add(rect) : (left=right)
      }
    } else {
      left = rect
    }
  }
  return store
}

function extractSelectionRects (pdfViewer) {
  const selection = document.getSelection()
  const text = selection.toString()
  if (!text) return
    const range = selection.getRangeAt(0)
    const pageNumber = $(range.startContainer).closest('.page').data('pageNumber')
  if (!pageNumber || pageNumber !== $(range.endContainer).closest('.page').data('pageNumber')) {
    throw new Error('暂不支持跨页文字注释')
  }

  const page = pdfViewer._pages[pageNumber - 1]
  const viewport = page.viewport

  const pageOffset = page.canvas.getBoundingClientRect()

  const points = []

  const bbox = range.getBoundingClientRect()

  const transformToQuadPoint = (coord) => {
    const { x, y, width, height } = coord
    const quadPoints = []
    const matrix = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height]
    ]
    matrix.map(item => {
      return viewport.convertToPdfPoint(...item)
    }).forEach(item => {
      quadPoints.push({x: +item[0].toFixed(5), y: +item[1].toFixed(5)})
    })
    return quadPoints
  }

  const caculatePageRect = (rect) => {
    let coord = {
      x: rect.x - pageOffset.x,
      y: rect.y - pageOffset.y,
      width: rect.width,
      height: rect.height
    }
    return transformToQuadPoint(coord)
  }

  const rects = range.getClientRects()

  mergeCrossedRects(rects).forEach((rect) => {
    points.push(caculatePageRect(rect))
  })

  let _bbox = caculatePageRect(bbox)

  const leftTop = _bbox[0]
  const rightBot = _bbox[3]

  _bbox = Util.normalizeRect([leftTop.x, leftTop.y, rightBot.x, rightBot.y])

  return {
    text: text,
    page: pageNumber,
    bbox: _bbox,
    quadPoints: points
  }
}

class HighlightAnnotation {
  static build (pdfViewer) {
    const data = extractSelectionRects(pdfViewer)
    const selection = document.getSelection()
    if (!data) return
    const annotation = {
      annotationType: AnnotationType.HIGHLIGHT,
      page: data.page,
      rect: data.bbox,
      quadPoints: data.quadPoints,
      content: data.text
    }
    selection.removeAllRanges()
    return annotation
  }
}
export default HighlightAnnotation
export {
  HighlightAnnotation
}
