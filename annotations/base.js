const STATE = {
  PENDING: 'pending',
  READY: 'ready',
  DRAWING: 'drawing',
  FINISHED: 'finished'
}

export class BaseAnnotation {
  constructor ({element, eventBus}) {
    this.container = element
    this.eventBus = eventBus
    this.reset()
    this.eventHandlers = {
      mousedown: this.startDrawing.bind(this),
      mousemove: this.contextDetectiveOrDraw.bind(this),
      mouseup: this.finishDrawing.bind(this),
      wheel: this.contextDetectiveOrDraw.bind(this),
      keydown: this.judge.bind(this),
      keyup: this.handleKeyUp.bind(this)
    }
  }

  build (event) {
    throw new Error('Not Implementation')
  }

  ready (context) {
    this.state = STATE.READY
    this.context = context
  }

  drawing (event) {
    this.state = STATE.DRAWING
    const offset = this.context.getBoundingClientRect()
    this.context.offset = offset
    this.element = this.build(event)
    if (!this.element) {
      throw new Error('initElement should be retrun a element')
    }
  }

  finish (event) {
    throw new Error('Not implementation')
  }

  _finish (event) {
    this.state = STATE.FINISHED
    this.finish(event)
    this.remove()
    this.reset()
  }

  cancel (event) {
    this.reset()
    this.remove()
  }

  reset () {
    this.state = STATE.PENDING
  }

  activate () {
    this.active = true
    this.container.classList.add('crosshair')
    for (const event in this.eventHandlers) {
      document.addEventListener(event, this.eventHandlers[event])
    }
  }

  deactivate () {
    this.active = false
    this.container.classList.remove('crosshair')
    for (const event in this.eventHandlers) {
      document.removeEventListener(event, this.eventHandlers[event])
    }
  }

  toggle () {
    if (this.active) {
      this.deactivate()
    } else {
      this.activate()
    }
  }

  judge (event) {
    switch (event.keyCode) {
      case 27:
        this.cancel()
        break
      case 16:
        if (this.state === STATE.DRAWING || this.state === STATE.READY || this.state === STATE.PENDING) {
          this.lastInput = event
        }
    }
  }

  handleKeyUp (event) {
    switch (event.keyCode) {
      case 16:
        this.lastInput = null
    }
  }

  // mousemove and wheel
  contextDetectiveOrDraw (event) {
    // initialize drawing context
    if (this.state === STATE.PENDING) {
      const context = this._contextDetective(event)
      return context && this.ready(context)
    }
    // update drawing context
    if (this.state === STATE.READY) {
      this._dealWithchangeContext(event)
    }
    // resize rectangle
    if (this.state === STATE.DRAWING) {
      this._update(event)
    }
  }
  // mousedown
  startDrawing (event) {
    const target = event.target
    if (!(target.closest && target.closest('.textLayer'))) {
      return
    }
    if (['rect', 'svg', 'circle'].includes(event.target.tagName)) {
      return
    }
    // initialize rectangle div
    if (this.state === STATE.READY) {
      this.drawing(event)
    }
  }
  // mouseup
  finishDrawing (event) {
    if (this.state === STATE.DRAWING) {
      this._finish(event)
    }
  }

  remove () {
    this.element && this.element.remove()
  }

  _update (event) {
    if (!this._outOfRange(event)) {
      this.update(event)
    }
  }

  update (event) {
    throw new Error('Not Implementation!')
  }

  _contextDetective (event) {
    const target = event.target
    if (target.classList.contains('textLayer')) {
      return target
    } else {
      return target.closest && target.closest('.textLayer')
    }
  }
  // 鼠标位置是否超过context范围
  _outOfRange (event) {
    const offset = this.context.offset
    return !(offset.x < event.pageX && offset.y < event.pageY && offset.x + offset.width > event.pageX && offset.y + offset.height > event.pageY)
  }

  _dealWithchangeContext (event) {
    const context = this._contextDetective(event)
    if (context) {
      if (context !== this.context) {
        this.context = context
      }
    }
  }
}
