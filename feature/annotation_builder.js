/* new feature */
import { AnnotationType, shadow, AnnotationElementFactory, DOMSVGFactory } from 'pdfjs-lib'

const freeze = (value) => {
  try {
    return Object.freeze(value)
  } catch (err) {
    return value
  }
}

class AnnotationBuilder {
  static load (annotations) {
    return annotations.map(this.create.bind(this))
  }
  static create (parameters) {
    parameters = this._parseAnnotation(parameters)
    const subtype = parameters.annotationType

    switch (subtype) {
      case AnnotationType.LINK:
        return new LinkAnnotation(parameters)

      case AnnotationType.TEXT:
        return new TextAnnotation(parameters)

      case AnnotationType.WIDGET:
        const fieldType = parameters.data.fieldType

        switch (fieldType) {
          case 'Tx':
            return new TextWidgetAnnotation(parameters)
          case 'Btn':
            if (parameters.data.radioButton) {
              return new RadioButtonWidgetAnnotation(parameters)
            } else if (parameters.data.checkBox) {
              return new CheckboxWidgetAnnotation(parameters)
            }
            return new PushButtonWidgetAnnotation(parameters)
          case 'Ch':
            return new ChoiceWidgetAnnotation(parameters)
        }
        return new WidgetAnnotation(parameters)

      case AnnotationType.POPUP:
        return new PopupAnnotation(parameters)

      case AnnotationType.FREETEXT:
        return new FreeTextAnnotation(parameters)

      case AnnotationType.LINE:
        return new LineAnnotation(parameters)

      case AnnotationType.SQUARE:
        return new SquareAnnotation(parameters)

      case AnnotationType.CIRCLE:
        return new CircleAnnotation(parameters)

      case AnnotationType.POLYLINE:
        return new PolylineAnnotation(parameters)

      case AnnotationType.CARET:
        return new CaretAnnotation(parameters)

      case AnnotationType.INK:
        return new InkAnnotation(parameters)

      case AnnotationType.POLYGON:
        return new PolygonAnnotation(parameters)

      case AnnotationType.HIGHLIGHT:
        return new HighlightAnnotation(parameters)

      case AnnotationType.UNDERLINE:
        return new UnderlineAnnotation(parameters)

      case AnnotationType.SQUIGGLY:
        return new SquigglyAnnotation(parameters)

      case AnnotationType.STRIKEOUT:
        return new StrikeOutAnnotation(parameters)

      case AnnotationType.STAMP:
        return new StampAnnotation(parameters)

      case AnnotationType.FILEATTACHMENT:
        return new FileAttachmentAnnotation(parameters)

      default:
        return new BaseAnnotation(parameters)
    }
  }

  static _parseAnnotation (parameters) {
    const annotationType = parameters.type || ''
    if (!annotationType.match(/^pspdfkit/)) {
      return parameters
    }
    let annotation = {
      id: parameters.id,
      page: parameters.pageIndex + 1,
      rect: parameters.bbox
      // rect: [
      //   rects[0],
      //   rects[1] + (parameters.strokeWidth || 0) * 2,
      //   rects[2] + rects[0],
      //   rects[3] + rects[1] + (parameters.strokeWidth || 0) * 2
      // ]
    }
    if (parameters.quadPoints) {
      annotation.quadPoints = parameters.quadPoints
    }
    if (parameters.content) {
      annotation.content = parameters.content
    }
    annotation.type = parameters.type
    switch (parameters.type) {
      case 'pspdfkit/shape/rectangle':
        annotation.annotationType = AnnotationType.SQUARE
        break
      case 'pspdfkit/markup/highlight':
        annotation.quadPoints = parameters.rects.map(rect => {
          return [
            {x: rect[0], y: rect[1]},
            {x: rect[0] + rect[2], y: rect[1]},
            {x: rect[0], y: rect[1] + rect[3]},
            {x: rect[0] + rect[2], y: rect[1] + rect[3]}
          ]
        })
        annotation.annotationType = AnnotationType.HIGHLIGHT
        break
      case 'pspdfkit/ink':
        annotation.annotationType = AnnotationType.INK
        break
      case 'pspdfkit/shape/line':
        annotation.lineCoordinates = [
          ...parameters.startPoint,
          ...parameters.endPoint
        ]
        annotation.annotationType = AnnotationType.LINE
        break
      case 'pspdfkit/shape/ellipse':
        annotation.annotationType = AnnotationType.CIRCLE
        break
      case 'pspdfkit/shape/polygon':
        annotation.annotationType = AnnotationType.POLYGON
        break
      case 'pspdfkit/shape/polyline':
        annotation.annotationType = AnnotationType.POLYLINE
        break
      case 'pspdfkit/link':
        annotation.annotationType = AnnotationType.LINK
        break
      case 'pspdfkit/markup/squiggly':
        annotation.annotationType = AnnotationType.SQUIGGLY
        break
      case 'pspdfkit/markup/strikeout':
        annotation.annotationType = AnnotationType.STRIKEOUT
        break
      case 'pspdfkit/markup/underline':
        annotation.annotationType = AnnotationType.UNDERLINE
        break
      case 'pspdfkit/markup/redaction':
        break
      case 'pspdfkit/text':
        annotation.annotationType = AnnotationType.TEXT
        break
      case 'pspdfkit/note':
        break
      case 'pspdfkit/image':
        annotation.annotationType = AnnotationType.FILEATTACHMENT
        break
      case 'pspdfkit/stamp':
        annotation.annotationType = AnnotationType.STAMP
        break
      case 'pspdfkit/widget':
        annotation.annotationType = AnnotationType.WIDGET
        break
      case 'pspdfkit/comment-marker':
        break
      default:
        annotation.annotationType = parameters.annotationType
    }
    return annotation
  }
}

class BaseAnnotation {
  constructor (parameters) {
    this.parameters = Object.create(null)
    for (let key in parameters) {
      shadow(this.parameters, key, freeze(parameters[key]))
    }
    if (!parameters.creationDate) {
      this.createdAt = this._rawTime()
    }

    if (!parameters.id) {
      this.id = this._generateSequenceID()
    }
  }

  get page () {
    return this.parameters.page
  }

  get id () {
    return this.parameters.id
  }

  set id (value) {
    this.set('id', freeze(value))
  }

  // render () {
  //   AnnotationLayer.render(this.parameters)
  // }

  get borderStyle () {
    return {
      width: 5,
      style: 1,
      dashArray: [3],
      horizontalCornerRadius: 0,
      verticalCornerRadius: 0
    }
  }

  get defaultColor () {
    return new Uint8ClampedArray([36, 131, 199])
  }

  _generateSequenceID () {
    return Date.now().toString(16) + Math.ceil(Math.random().toFixed(15) * 1e16).toString(16)
  }

  _rawTime () {
    return new Date().toISOString().replace(/(-|T|:|(\.\d+))/g, '')
  }

  toJSON () {
    throw new Error('Not implementation!')
  }

  render ({pdfPage, viewport, linkService, downloadManager}) {
    let container = document.querySelector(`.page[data-page-number='${pdfPage.pageNumber}']`)
    let layer = container.querySelector('.annotationLayer')
    if (!layer) {
      layer = document.createElement('div')
      layer.classList.add('annotationLayer')
      container.appendChild(layer)
    }
    const annotationElement = AnnotationElementFactory.create({
      data: this.toJSON(),
      layer,
      page: pdfPage,
      viewport,
      linkService,
      downloadManager,
      imageResourcesPath: '',
      renderInteractiveForms: false,
      svgFactory: new DOMSVGFactory()
    })
    layer.appendChild(annotationElement.render())
    return annotationElement
  }

  set (name, value) {
    let shadowValue = value
    try {
      shadowValue = freeze(value)
    } catch (err) {
    }
    shadow(this.parameters, name, shadowValue)
  }
}

class LinkAnnotation extends BaseAnnotation {
}

class TextAnnotation extends BaseAnnotation {
}
class WidgetAnnotation extends BaseAnnotation {
}
class TextWidgetAnnotation extends BaseAnnotation {
}
class CheckboxWidgetAnnotation extends BaseAnnotation {
}
class RadioButtonWidgetAnnotation extends BaseAnnotation {
}
class PushButtonWidgetAnnotation extends BaseAnnotation {
}
class ChoiceWidgetAnnotation extends BaseAnnotation {
}
class PopupAnnotation extends BaseAnnotation {
}
class FreeTextAnnotation extends BaseAnnotation {
}
class LineAnnotation extends BaseAnnotation {
  get borderStyle () {
    return {
      width: 3,
      style: 1,
      dashArray: [3],
      horizontalCornerRadius: 0,
      verticalCornerRadius: 0
    }
  }
  toJSON () {
    return {
      annotationFlags: this.parameters.annotationType,
      borderStyle: this.borderStyle,
      color: this.defaultColor,
      contents: '',
      hasAppearance: true,
      id: this.id,
      modificationDate: `D:${this.createdAt}`,
      rect: this.parameters.rect,
      subtype: 'Line',
      creationDate: `D:${this.createdAt}`,
      hasPopup: false,
      title: '',
      annotationType: 4,
      lineCoordinates: this.parameters.lineCoordinates,
      page: this.page
    }
  }
}

class SquareAnnotation extends BaseAnnotation {
  toJSON () {
    return {
      annotationFlags: this.parameters.annotationType,
      borderStyle: this.borderStyle,
      color: this.defaultColor,
      contents: '',
      hasAppearance: '',
      id: this.id,
      modificationDate: `D:${this.createdAt}`,
      rect: this.parameters.rect,
      subtype: 'Square',
      creationDate: `D:${this.createdAt}`,
      hasPopup: false,
      title: '',
      annotationType: 5,
      page: this.page
    }
  }
}

class CircleAnnotation extends BaseAnnotation {
}
class PolylineAnnotation extends BaseAnnotation {
}
class PolygonAnnotation extends BaseAnnotation {
}
class CaretAnnotation extends BaseAnnotation {
}
class InkAnnotation extends BaseAnnotation {
}
class HighlightAnnotation extends BaseAnnotation {
  get content () {
    return this.parameters.content
  }

  toJSON () {
    return {
      annotationFlags: 4,
      borderStyle: {width: 0, style: 1, dashArray: [3], horizontalCornerRadius: 0, verticalCornerRadius: 0},
      color: new Uint8ClampedArray([252, 238, 124]),
      contents: '',
      hasAppearance: true,
      id: this.id,
      modificationDate: `D:${this.createdAt}`,
      rect: this.parameters.rect,
      subtype: `Highlight`,
      creationDate: `D:${this.createdAt}`,
      hasPopup: false,
      title: '',
      annotationType: 9,
      quadPoints: this.parameters.quadPoints,
      page: this.page
    }
  }
}
class UnderlineAnnotation extends BaseAnnotation {
}
class SquigglyAnnotation extends BaseAnnotation {
}
class StrikeOutAnnotation extends BaseAnnotation {
}
class StampAnnotation extends BaseAnnotation {
}
class FileAttachmentAnnotation extends BaseAnnotation {
}

export { AnnotationBuilder }
