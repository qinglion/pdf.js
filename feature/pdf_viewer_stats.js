class PDFViewerStats {
  constructor (pdfViewer) {
    this.pdfViewer = pdfViewer
    this.annotationSelection = new AnnotationSelection(pdfViewer)
    this.events = {
      readyToDetectAnnotation: this.readyToDetectAnnotation.bind(this),
      cancelDetectAnnotation: this.cancelDetectAnnotation.bind(this),
      detectAnnotation: this.detectAnnotation.bind(this)
    }
    this.bindEvents()
  }

  bindEvents () {
    document.addEventListener('mousedown', this._delegateToPage(this.events.readyToDetectAnnotation))
    document.addEventListener('mousemove', this._delegateToPage(this.events.cancelDetectAnnotation))
    document.addEventListener('mouseup', this._delegateToPage(this.events.detectAnnotation))
  }

  readyToDetectAnnotation (evt) {
    if (this.annotationSelection.annotation) {
      this.removeAnnotationSelection(evt)
    }
    this._readyToDetectAnnotation = true
  }

  cancelDetectAnnotation (evt) {
    if (this._readyToDetectAnnotation) {
      this._readyToDetectAnnotation = false
    }
  }

  detectAnnotation (evt) {
    if (!this._readyToDetectAnnotation) {
      return
    }
    this._readyToDetectAnnotation = false
    const target = evt.target
    const page = target.closest('.page')
    if (!page) return
    const index = (page ? +page.getAttribute('data-page-number') : 1) - 1
    const viewport = this.pdfViewer._pages[index].viewport.clone({dontFlip: true})
    const rect = page.getBoundingClientRect()
    const offsetY = evt.clientY - rect.top + page.scrollTop
    const offsetX = evt.clientX - rect.left + page.scrollLeft
    const [x, y] = viewport.convertToPdfPoint(offsetX, offsetY)
    let match
    const sections = page.querySelectorAll('section[data-annotation-id]')
    sections.forEach((section) => {
      const coord = {
        ltx: section.offsetLeft,
        lty: section.offsetTop,
        rbx: (section.offsetLeft + section.offsetWidth),
        rby: (section.offsetTop + section.offsetHeight)
      }
      // 匹配最接近的注释
      if (coord.ltx <= x && coord.lty <= y && coord.rbx >= x && coord.rby >= y) {
        const diff = x - coord.ltx + y - coord.lty
        if (!match || diff < match.diff) {
          match = { diff, section }
        }
      }
    })
    if (match) {
      match.section.click()
    }
  }

  removeAnnotationSelection (event) {
    const target = event.target
    if (!target.closest('.annotationLayer')) {
      if (this.annotationSelection.annotation) {
        this.annotationSelection.set(null)
      }
    }
  }

  unbindEvents () {
    document.removeEventListener('mousedown', this._delegateToPage(this.events.readyToDetectAnnotation))
    document.removeEventListener('mousemove', this._delegateToPage(this.events.cancelDetectAnnotation))
    document.removeEventListener('mouseup', this._delegateToPage(this.events.detectAnnotation))
  }

  _delegateToPage (handler) {
    return (evt) => {
      const target = evt.target
      if (target && target.closest && target.closest('.page')) {
        handler(evt)
      }
    }
  }
}

class AnnotationSelection {
  constructor (pdfViewer) {
    this.pdfViewer = pdfViewer
    this.annotation = null
  }

  get eventBus () {
    return this.pdfViewer.eventBus
  }

  reset () {
    this._removeSelectionAnnotationState()
  }

  set (annotationElement) {
    const annotation = annotationElement && annotationElement.data
    if (this.annotation) {
      if (this.annotation.id === (annotation && annotation.id)) {
        return
      }
      this._removeAnnotationSelectionState(this.annotation.data)
    }
    if (!this.annotation && !annotation) {
      return
    }
    if (!this.annotation || this.annotation.data.id !== (annotation && annotation.id)) {
      this.annotation = annotationElement
      this.eventBus.dispatch('annotationSelection.change', annotationElement || {})
    }
  }

  _removeSelectionAnnotationState () {
    this._removeAnnotationSelectionState(this.annotation && this.annotation.data)
    this.pdfViewer.popover.destroy()
  }

  _removeAnnotationSelectionState (annotation) {
    if (!annotation) {
      return
    }
    const container = document.querySelector(`[data-annotation-id="${annotation.id}"]`)
    if (!container) {
      return
    }
    const rect = container.querySelector('rect.selection')
    if (rect) {
      const instance = rect.instance
      instance.selectize(false, {}).resize('stop').draggable(false)
    }
  }
}

export { PDFViewerStats }
