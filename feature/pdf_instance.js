import { AnnotationBuilder } from './annotation_builder'
class PDFInstance {
  constructor (app) {
    this.app = app
  }

  get pdfDocument () {
    return this.app.pdfDocument
  }

  get event () {
    return this.app.eventBus
  }

  get pdfViewer () {
    return this.app.pdfViewer
  }

  getPageView (page) {
    return this.pdfViewer.getPageView(page - 1)
  }

  createAnnotation (annotation) {
    const _annotation = AnnotationBuilder.create(annotation)
    const { pdfPage, viewport } = this.getPageView(_annotation.page)

    _annotation.render({
      pdfPage: pdfPage,
      viewport: viewport.clone({ dontFlip: true }),
      linkService: this.app.pdfLinkService,
      downloadManager: this.app.downloadManager
    })

    this.pdfDocument.createAnnotation(_annotation)

    return true
  }

  deleteAnnotation (id) {
    const annotation = this.pdfDocument.fetchAnnotation(id)
    if (!annotation) {
      return false
    }
    const annotationLayer = document.querySelector(`[data-annotation-id="${id}"]`)
    this.pdfDocument.deleteAnnotation(id)
    if (!annotationLayer) return
    annotationLayer.childNodes.forEach(child => {
      annotationLayer.removeChild(child)
    })
    annotationLayer.remove()
    this.pdfViewer.stats.annotationSelection.set(null)
    return true
  }

  updateAnnotation (parameters = {}, isRednerable = false) {
    const annotation = this.pdfDocument.updateAnnotation({...parameters, type: ''})
    const pageView = this.pdfViewer.getPageView(parameters.page - 1)
    if (pageView && pageView.pdfPage) {
      const annotationLayer = pageView.annotationLayer
      annotationLayer && annotationLayer.render(pageView.viewport)
    }
    return annotation
  }
}
export { PDFInstance }
