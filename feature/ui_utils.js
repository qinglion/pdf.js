function transformRectByElement (element) {
  const pageNumber = +$(element).closest('.page').attr('data-page-number')
  return {
    page: pageNumber,
    coord: _getCoordinate(element)
  }
}

function _getCoordinate (element) {
  return {
    tx: element.offsetLeft,
    ty: element.offsetTop,
    bx: element.offsetLeft + element.offsetWidth,
    by: element.offsetTop + element.offsetHeight
  }
}


function transformPSPDFKitRect (viewport, rect) {
  const [x, y, width, height] = rect
  return [
    x,
    viewport.viewBox[3] - y - height,
    x + width,
    viewport.viewBox[3] - y
  ]
}

function transformPSPDFKitQuadPoints (viewport, quadPoints) {
  return quadPoints.map(points => {
    return points.map(point => {
      return { x: point.x, y: viewport.viewBox[3] - point.y }
    })
  })
}

function transformPSPDFKitLineCoordinates (viewport, lineCoordinates) {
  const height = viewport.viewBox[3]
  return [
    lineCoordinates[0],
    height - lineCoordinates[1],
    lineCoordinates[2],
    height - lineCoordinates[3],
  ]
}

export {
  transformRectByElement,
  transformPSPDFKitRect,
  transformPSPDFKitQuadPoints,
  transformPSPDFKitLineCoordinates,
}