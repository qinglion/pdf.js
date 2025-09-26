/* eslint-disable */
import { transformRectByElement } from '../feature/ui_utils'
import { BaseAnnotation } from './base'

export class RectangleAnnotation extends BaseAnnotation {
  build (event) {
    const element = document.createElement('div')
    const offset = this.context.offset
    const left = event.pageX - offset.x + window.pageXOffset
    const top = event.pageY - offset.y + window.pageYOffset
    element.offset = {x: left, y: top}
    element.className = 'rectangle'
    element.style.position = 'absolute'
    element.style.left = left + 'px'
    element.style.top = top + 'px'
    element.style.cursor = 'crosshair'
    element.style.border = '3px solid red'
    this.context.appendChild(element)
    return element
  }

  update (event) {
    const style = this.element.style
    const offset = this.element.offset
    const offsetX = event.pageX - this.context.offset.x
    const offsetY = event.pageY - this.context.offset.y
    style.width = Math.abs(offset.x - offsetX) + 'px'
    style.height = Math.abs(offset.y - offsetY) + 'px'
    if (event.pageX < (offset.x + this.context.offset.x)) {
      style.left = event.pageX - this.context.offset.x + window.pageXOffset + 'px'
    }
    if (event.pageY < (offset.y + this.context.offset.y)) {
      style.top = event.pageY - this.context.offset.y + window.pageYOffset + 'px'
    }
  }

  finish (event) {
    const data = transformRectByElement(this.element)
    if (this.element.clientWidth > 1 && this.element.clientHeight > 1) {
      this.eventBus.dispatch('draw.annotation', 'rectangle', data)
    }
  }
}
