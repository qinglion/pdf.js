// new feature

import { createPopper } from '@popperjs/core'

export class PDFPopover {
  constructor ({evtBus, menus, div, app}) {
    this.evtBus = evtBus
    this.menus = menus
    this.div = div
    this.app = app
    this.textSelection = false
    this.eventHandlers = {
      enableselectionpopover: this.enableTextSelectionPopover.bind(this),
      disableselectionpopover: this.disableTextSelectionPopover.bind(this),
      selectionchange: this._handleSelectionChangeEvent.bind(this),
      mousedown: this._handleMouseDown.bind(this),
      wheel: this._updateTextSelectionPopuper.bind(this)
    }
    this.addEventListeners()
  }

  get pdfViewer () {
    return this.app.pdfViewer
  }

  addEventListeners () {
    this.evtBus._on('enableselectionpopover', this.eventHandlers.enableselectionpopover)
    this.evtBus._on('disableselectionpopover', this.eventHandlers.disableselectionpopover)
    document.addEventListener('selectionchange', this.eventHandlers.selectionchange)
    this.pdfViewer.viewer.addEventListener('mousedown', this.eventHandlers.mousedown)
  }

  removeEventListeners () {
    this.evtBus._off('enableselectionpopover', this.eventHandlers.enableselectionpopover)
    this.evtBus._off('disableselectionpopover', this.eventHandlers.disableselectionpopover)
    document.removeEventListener('selectionchange', this.eventHandlers.selectionchange)
    this.pdfViewer.viewer.removeEventListener('mousedown', this.eventHandlers.mousedown)
    document.removeEventListener('wheel', this.eventHandlers.wheel)
  }

  _handleSelectionChangeEvent (event) {
    const cleanup = () => {
      if (this.container && this.container.hasOwnProperty('getBoundingClientRect')) {
        this.destroy()
      }
    }
    if (!this.textSelection) {
      return cleanup()
    }
    const selection = document.getSelection()

    const text = selection.toString()

    if (!text) {
      return cleanup()
    }
    const range = selection.getRangeAt(0)
    const startContainer = window.$(range.startContainer)
    // const endContainer = window.$(range.endContainer)
    // if (startContainer !== endContainer) {
    //   alert('暂不支持跨页选择')
    // }

    if (startContainer.closest('.page').length < 1) {
      return cleanup()
    }

    this.render(range).display()
  }

  _handleMouseDown (event) {
    const annotationContainer = window.$(event.target).closest('[data-annotation-id]')
    if (annotationContainer.length < 1) {
      this.destroy()
    }
  }

  enableTextSelectionPopover () {
    this.textSelection = true
    document.addEventListener('wheel', this.eventHandlers.wheel)
  }

  disableTextSelectionPopover () {
    this.textSelection = false
    document.removeEventListener('wheel', this.eventHandlers.wheel)
  }

  render (container) {
    if (!container) {
      throw new Error(`target can't be null`)
    }
    if (container === this.container) {
      return this
    } else {
      this.destroy()
    }

    if (container instanceof Range) {
      this.container = {
        getBoundingClientRect: container.getBoundingClientRect.bind(container)
      }
    } else {
      this.container = container
    }

    const annotation = container.annotation

    const menus = this.menus.filter(menu => {
      return menu.visible ? menu.visible(annotation) : true
    })

    this._render(menus, annotation)
    return this
  }

  _render (menus, annotation) {
    const ul = document.createElement('ul')
    menus.forEach(menu => {
      const { text, onPress } = menu
      const li = document.createElement('li')
      li.textContent = text
      li.onclick = () => {
        onPress(annotation)
        this.destroy()
      }
      ul.appendChild(li)
    })
    this.div.querySelector('ul').replaceWith(ul)
    return this
  }

  _updateTextSelectionPopuper () {
    if (!this.instance) {
      return
    }
    if (this.container instanceof Element) {
      return
    }
    const selection = document.getSelection()
    try {
      const range = selection.getRangeAt(0)
      this.instance.state.elements.reference = {
        getBoundingClientRect: range.getBoundingClientRect.bind(range)
      }
      this.update()
    } catch (err) {
      console.log('err')
    }
  }

  update () {
    this.instance && this.instance.update()
  }

  display () {
    if (!this.instance) {
      this.instance = createPopper(this.container, this.div, {
        placement: 'top',
        modifiers: [
          { name: 'offset', options: {offset: [0, 8]} }
        ]
      })
    }
    this.div.classList.remove('hidden')
  }

  destroy () {
    this.div.classList.add('hidden')
    if (this.instance) {
      this.instance.destroy()
    }
    this.instance = null
  }
}
