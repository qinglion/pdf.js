import { AnnotationBuilder } from './annotation_builder'
class PDFDocumentProxy {
  static attach (pdfDocument, annotations) {
    this._initialize(pdfDocument, annotations)
    pdfDocument.fetchAnnotation = this._fetchAnnotation
    pdfDocument.fetchAnnotations = this._fetchAnnotations
    pdfDocument.createAnnotation = this._createAnnotation
    pdfDocument.updateAnnotation = this._updateAnnotation
    pdfDocument.deleteAnnotation = this._deleteAnnotation
    return pdfDocument
  }

  static _fetchAnnotation (id) {
    return this.cache.annotations.get(`${id}`)
  }

  static _fetchAnnotations (page) {
    if (page >= 1) {
      let annotations = []
      this.cache.annotations.forEach(anno => {
        if (anno.page === page) {
          annotations.push(anno)
        }
      })
      return annotations
    } else {
      throw new Error(`page should be greater than 0`)
    }
  }

  static _updateAnnotation (parameters) {
    let annotation = this.fetchAnnotation(parameters.id)
    if (!annotation) {
      throw new Error(`Annotation(${parameters.id}) not found!`)
    }
    for (let key in parameters) {
      annotation.set(key, parameters[key])
    }
    return annotation
  }

  static _createAnnotation (annotation) {
    this.cache.annotations.set(`${annotation.id}`, Object.freeze(annotation))
  }

  static _deleteAnnotation (annotation) {
    let id
    if (typeof annotation === 'object') {
      id = annotation.id
    } else {
      id = annotation
    }
    if (this.cache.annotations.has(`${id}`)) {
      return this.cache.annotations.delete(`${id}`)
    } else {
      return false
    }
  }

  static _initialize (pdfDocument, annotations) {
    pdfDocument.cache = {
      annotations: new Map()
    }
    AnnotationBuilder.load(annotations).forEach(annotation => {
      pdfDocument.cache.annotations.set(`${annotation.id}`, annotation)
    })
  }
}

export {
  PDFDocumentProxy
}
