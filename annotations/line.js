import { BaseAnnotation } from './base'
import SVG from 'svg.js'

const DEFAULTS = {
  LINE_Y: 1,
  LINE_X: 1
}

export class LineAnnotation extends BaseAnnotation {
  build (event) {
    const offset = this.context.offset
    const left = event.pageX - offset.x + window.pageXOffset
    const top = event.pageY - offset.y + window.pageYOffset

    this.instance = SVG(this.context)
    const style = this.instance.node.style

    this.instance.offset = {x: left, y: top}
    style.position = 'absolute'
    style.left = left + 'px'
    style.top = top + 'px'
    this.line = this.instance.line(1, 1, 1, 1).stroke('red').attr('stroke-width', 5)
    return this.instance.node
  }

  update (event) {
    const style = this.instance.node.style
    const offset = this.instance.offset
    const x = event.pageX - this.context.offset.x
    const y = event.pageY - this.context.offset.y

    const width = x - offset.x
    const height = y - offset.y
    if (width < 0) {
      style.left = event.pageX - this.context.offset.x + window.pageXOffset - 5 + 'px'
      this.line.attr('x2', DEFAULTS.LINE_X).attr('x1', Math.abs(width) || DEFAULTS.LINE_X)
    } else {
      this.line.attr('x2', width || DEFAULTS.LINE_X)
    }

    const shiftKey = this.lastInput && this.lastInput.shiftKey

    const y2 = shiftKey ? height : this.line.attr('y1')

    if (height < 0) {
      if (shiftKey) {
        style.top = event.pageY - this.context.offset.y + window.pageYOffset + 'px'
      }
      this.line.attr('y2', DEFAULTS.LINE_Y).attr('y1', Math.abs(y2) || DEFAULTS.LINE_Y)
    } else {
      this.line.attr('y2', y2 || DEFAULTS.LINE_Y)
    }
    const _height = Math.abs(height) < 10 ? 10 : Math.abs(height)
    const _width = Math.abs(width) < 10 ? 10 : Math.abs(width)
    this.instance.size(_width, _height)
  }

  finish () {
    const left = parseFloat(this.element.style.left)
    const top = parseFloat(this.element.style.top)
    const attr = this.line.attr()
    const data = {
      page: +this.context.closest('.page').dataset.pageNumber,
      coord: {
        x1: attr.x1 + left,
        y1: attr.y1 + top,
        x2: attr.x2 + left,
        y2: attr.y2 + top
      }
    }
    const width = this.line.width()
    const height = this.line.height()
    if (width > 5 || height > 5) {
      this.eventBus.dispatch('draw.annotation', 'line', data)
    }
  }
}
