/* eslint-disable */
class ResizeHandler {
  constructor (el) {
    el.remember('_resizeHandler', this)
    this.parent = el.parent()
    this.el = el
    this.parameters = {}
    this.lastUpdateCall = null
    this.p = el.doc().node.createSVGPoint()
  }

  transformPoint (x, y, m) {
    this.p.x = x - (this.offset.x - window.pageXOffset)
    this.p.y = y - (this.offset.y - window.pageYOffset)

    return this.p.matrixTransform(m || this.m)
  }

  _extractPosition (event) {
    // Extract a position from a mouse/touch event.
    // Returns { x: .., y: .. }
    return {
      x: event.clientX != null ? event.clientX : event.touches[0].clientX,
      y: event.clientY != null ? event.clientY : event.touches[0].clientY
    }
  }

  init (options) {

    let _this = this

    this.stop()

    if (options === 'stop') {
      return SVG.off(window, 'wheel')
    }

    if (options instanceof Object && options.container instanceof Element) {
      this.container = options.container
      setTimeout(() => {
        this._updateConstraint()
      }, 500)
    }

    this.options = {}

    // Merge options and defaults
    for (let i in this.el.resize.defaults) {
      this.options[i] = this.el.resize.defaults[i]
      if (typeof options[i] !== 'undefined') {
        this.options[i] = options[i]
      }
    }

    // We listen to all these events which are specifying different edges
    this.el.on('lt.resize', function(e){ _this.resize(e || window.event) })  // Left-Top
    this.el.on('rt.resize', function(e){ _this.resize(e || window.event) })  // Right-Top
    this.el.on('rb.resize', function(e){ _this.resize(e || window.event) })  // Right-Bottom
    this.el.on('lb.resize', function(e){ _this.resize(e || window.event) })  // Left-Bottom

    this.el.on('t.resize', function(e){ _this.resize(e || window.event) })   // Top
    this.el.on('r.resize', function(e){ _this.resize(e || window.event) })   // Right
    this.el.on('b.resize', function(e){ _this.resize(e || window.event) })   // Bottom
    this.el.on('l.resize', function(e){ _this.resize(e || window.event) })   // Left

    this.el.on('rot.resize', function(e){ _this.resize(e || window.event) }) // Rotation

    this.el.on('point.resize', function(e){ _this.resize(e || window.event) }) // Point-Moving

    // This call ensures, that the plugin reacts to a change of snapToGrid immediately
    this.update()
    SVG.on(window, 'wheel', function () {
      window.requestAnimationFrame(() => {
        _this._updateConstraint()
      })
    })
  }

  stop (){
    this.el.off('lt.resize')
    this.el.off('rt.resize')
    this.el.off('rb.resize')
    this.el.off('lb.resize')

    this.el.off('t.resize')
    this.el.off('r.resize')
    this.el.off('b.resize')
    this.el.off('l.resize')

    this.el.off('rot.resize')

    this.el.off('point.resize')

    return this
  }

  resize (event) {
    let _this = this

    this.m = this.el.node.getScreenCTM().inverse()
    this.offset = { x: window.pageXOffset, y: window.pageYOffset }

    let txPt = this._extractPosition(event.detail.event)
    this.parameters = {
      type: this.el.type, // the type of element
      p: this.transformPoint(txPt.x, txPt.y),
      x: event.detail.x,      // x-position of the mouse when resizing started
      y: event.detail.y,      // y-position of the mouse when resizing started
      box: this.el.bbox(),    // The bounding-box of the element
      rotation: this.el.transform().rotation  // The current rotation of the element
    }

    this.resizeLimits = this.options.resizeLimits || this.resize.defaults.resizeLimits

    // Add font-size parameter if the element type is text
    if (this.el.type === "text") {
      this.parameters.fontSize = this.el.attr()["font-size"]
    }

    // the i-param in the event holds the index of the point which is moved, when using `deepSelect`
    if (event.detail.i !== undefined) {
      // get the point array
      let array = this.el.array().valueOf()

      // Save the index and the point which is moved
      this.parameters.i = event.detail.i
      this.parameters.pointCoords = [array[event.detail.i][0], array[event.detail.i][1]]
    }

    this._resizeLeft = function (snap, resizeFont, checkAspectRatio, checkAspectRatioReverse, updateOnlyChanges) {
      if (this.parameters.box.width - snap[0] >= this.resizeLimits.width) {
        let x, y, width, height
        if (checkAspectRatio) {
          snap = this.checkAspectRatio(snap, checkAspectRatioReverse)
        }

        if (this.parameters.type === "text") {
          if (resizeFont) {
            x = this.parameters.box.x + snap[0]
            y = this.parameters.box.y
            this._resize({x, y})
            this.el.attr("font-size", this.parameters.fontSize - snap[0])
          }
          return
        }

        width = this.parameters.box.width - snap[0]

        if (updateOnlyChanges) {
          x = this.parameters.box.x + snap[0]
        } else {
          x = this.parameters.box.x + snap[0]
          y = this.parameters.box.y
        }
        this._resize({x, y, width, height})
      }
    }

    this._resizeRight = function (snap, resizeFont, checkAspectRatio, checkAspectRatioReverse) {
      if (this.parameters.box.width + snap[0] >= this.resizeLimits.width) {
        let x, y, width, height
        if (checkAspectRatio) {
          snap = this.checkAspectRatio(snap, checkAspectRatioReverse)
        }

        if (this.parameters.type === "text") {
          if (resizeFont) {
            x = this.parameters.box.x - snap[0]
            y = this.parameters.box.y
            this._resize({x, y})
            this.el.attr("font-size", this.parameters.fontSize + snap[0])
          }
          return
        }

        x = this.parameters.box.x
        width = this.parameters.box.width + snap[0]
        this._resize({x, width})
      }
    }

    this._resizeTop = function (snap, checkAspectRatio, checkAspectRatioReverse, updateOnlyChanges) {
      if (this.parameters.box.height - snap[1] >= this.resizeLimits.height) {
        let x, y, width, height
        if (checkAspectRatio) {
          snap = this.checkAspectRatio(snap, checkAspectRatioReverse)
        }

        // Disable the font-resizing if it is not from the corner of bounding-box
        if (this.parameters.type === "text") {
          return
        }
        
        height = this.parameters.box.height - snap[1]

        if (updateOnlyChanges) {
          y = this.parameters.box.y + snap[1]
        } else {
          x = this.parameters.box.x
          y = this.parameters.box.y + snap[1]
        }
        this._resize({x, y, width, height})
      }
    }

    this._resizeBottom = function (snap, checkAspectRatio, checkAspectRatioReverse) {
      if (this.parameters.box.height + snap[1] >= this.resizeLimits.height) {
        let x, y, width, height
        if (checkAspectRatio) {
          snap = this.checkAspectRatio(snap, checkAspectRatioReverse)
        }

        if (this.parameters.type === "text") {
          return
        }
        y = this.parameters.box.y
        height = this.parameters.box.height + snap[1]
        this._resize({y, height})
      }
    }

    // Lets check which edge of the bounding-box was clicked and resize the this.el according to this
    switch (event.type) {

      // Left-Top-Edge
    case 'lt':
      // We build a calculating function for every case which gives us the new position of the this.el
      this.calc = function (diffX, diffY) {
        // The procedure is always the same
        // First we snap the edge to the given grid (snapping to 1px grid is normal resizing)
        let snap = this.snapToGrid(diffX, diffY)

        this._resizeTop(snap, true, false, true)
        this._resizeLeft(snap, true, true, false, true)
      }
      break
      // Right-Top
    case 'rt':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 1 << 1)

        this._resizeTop(snap, true, true, true)
        this._resizeRight(snap, true, true, true)
      }
      break
      // Right-Bottom
    case 'rb':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 0)

        this._resizeBottom(snap, true)
        this._resizeRight(snap, true, true)
      }
      break
      // Left-Bottom
    case 'lb':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 1)

        this._resizeBottom(snap, true, true)
        this._resizeLeft(snap, true, true, true, true)
      }
      break
      // Top
    case 't':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 1 << 1)
        this._resizeTop(snap)
      }
      break
      // Right
    case 'r':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 0)

        this._resizeRight(snap)
      }
      break
      // Bottom
    case 'b':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 0)

        this._resizeBottom(snap)
      }
      break
      // Left
    case 'l':
      // s.a.
      this.calc = function (diffX, diffY) {
        let snap = this.snapToGrid(diffX, diffY, 1)

        this._resizeLeft(snap)
      }
      break
      // Rotation
    case 'rot':
      // s.a.
      this.calc = function (diffX, diffY) {
        // yes this is kinda stupid but we need the mouse coords back...
        let current = {x: diffX + this.parameters.p.x, y: diffY + this.parameters.p.y}

        // start minus middle
        let sAngle = Math.atan2((this.parameters.p.y - this.parameters.box.y - this.parameters.box.height / 2), (this.parameters.p.x - this.parameters.box.x - this.parameters.box.width / 2))

        // end minus middle
        let pAngle = Math.atan2((current.y - this.parameters.box.y - this.parameters.box.height / 2), (current.x - this.parameters.box.x - this.parameters.box.width / 2))

        let angle = this.parameters.rotation + (pAngle - sAngle) * 180 / Math.PI + this.options.snapToAngle / 2

        // We have to move the element to the center of the box first and change the rotation afterwards
        // because rotation always works around a rotation-center, which is changed when moving the element
        // We also set the new rotation center to the center of the box.
        this.el.center(this.parameters.box.cx, this.parameters.box.cy).rotate(angle - (angle % this.options.snapToAngle), this.parameters.box.cx, this.parameters.box.cy)
      }
      break
      // Moving one single Point (needed when an element is deepSelected which means you can move every single point of the object)
    case 'point':
      this.calc = function (diffX, diffY) {
        // Snapping the point to the grid
        let snap = this.snapToGrid(diffX, diffY, this.parameters.pointCoords[0], this.parameters.pointCoords[1])

        // Get the point array
        let array = this.el.array().valueOf()

        // Changing the moved point in the array
        array[this.parameters.i][0] = this.parameters.pointCoords[0] + snap[0]
        array[this.parameters.i][1] = this.parameters.pointCoords[1] + snap[1]

        // And plot the new this.el
        this.el.plot(array)
      }
    }

    this.el.fire('resizestart', {dx: this.parameters.x, dy: this.parameters.y, event: event})
    // When resizing started, we have to register events for...
    // Touches.
    SVG.on(window, 'touchmove.resize', function(e) {
      _this.update(e || window.event)
    })
    SVG.on(window, 'touchend.resize', function() {
      _this.done()
    })
    // Mouse.
    SVG.on(window, 'mousemove.resize', function (e) {
      _this.update(e || window.event)
    })
    SVG.on(window, 'mouseup.resize', function () {
      _this.done()
    })
  }

  _resize ({x, y, width, height}) {
    const typeR = (n) => n >= 0 || n <= 0
    
    if (typeR(x)) {
      this.el.x(x)
    }
    if (typeR(y)) {
      this.el.y(y)
    }
    if (typeR(width)) {
      this.el.width(width)
    }
    if (typeR(height)) {
      this.el.height(height)
    }
    if (this.parent && this.parent.type === 'svg') {
      const _width = (width || this.el.width()) - this.parameters.box.x
      const _height = (height || this.el.height()) - this.parameters.box.y
      this.parent.size(_width, _height)
      this.parent.viewbox(0, 0, _width, _height)
    }
  }
  // The update-function redraws the element every time the mouse is moving
  update (event) {
    if (!event) {
      if (this.lastUpdateCall) {
        this.calc(this.lastUpdateCall[0], this.lastUpdateCall[1])
      }
      return
    }

    if (this.outOfContainer(event)) {
      return
    }

    // Calculate the difference between the mouseposition at start and now
    let txPt = this._extractPosition(event)

    let p = this.transformPoint(txPt.x, txPt.y)

    let diffX = p.x - this.parameters.p.x,
    diffY = p.y - this.parameters.p.y

    this.lastUpdateCall = [diffX, diffY]

    // Calculate the new position and height / width of the element
    this.calc(diffX, diffY)

    // Emit an event to say we have changed.
    this.el.fire('resizing', {dx: diffX, dy: diffY, event: event})
  }

  // Is called on mouseup.
  // Removes the update-function from the mousemove event
  done () {
    SVG.off(window, 'mousemove.resize')
    SVG.off(window, 'mouseup.resize')
    SVG.off(window, 'touchmove.resize')
    SVG.off(window, 'touchend.resize')
    if (this.lastUpdateCall) {
      this.lastUpdateCall = null
      this.el.fire('resizedone')
    }
  }

  // The flag is used to determine whether the resizing is used with a left-Point (first bit) and top-point (second bit)
  // In this cases the temp-values are calculated differently
  snapToGrid (diffX, diffY, flag, pointCoordsY) {
    let temp

    // If `pointCoordsY` is given, a single Point has to be snapped (deepSelect). That's why we need a different temp-value
    if (typeof pointCoordsY !== 'undefined') {
      // Note that flag = pointCoordsX in this case
      temp = [(flag + diffX) % this.options.snapToGrid, (pointCoordsY + diffY) % this.options.snapToGrid]
    } else {
      // We check if the flag is set and if not we set a default-value (both bits set - which means upper-left-edge)
      flag = flag == null ? 1 | 1 << 1 : flag
      temp = [(this.parameters.box.x + diffX + (flag & 1 ? 0 : this.parameters.box.width)) % this.options.snapToGrid, (this.parameters.box.y + diffY + (flag & (1 << 1) ? 0 : this.parameters.box.height)) % this.options.snapToGrid]
    }

    if(diffX < 0) {
      temp[0] -= this.options.snapToGrid
    }
    if(diffY < 0) {
      temp[1] -= this.options.snapToGrid
    }

    diffX -= (Math.abs(temp[0]) < this.options.snapToGrid / 2 ?
    temp[0] :
    temp[0] - (diffX < 0 ? -this.options.snapToGrid : this.options.snapToGrid))
    diffY -= (Math.abs(temp[1]) < this.options.snapToGrid / 2 ?
    temp[1] :
    temp[1] - (diffY < 0 ? -this.options.snapToGrid : this.options.snapToGrid))

    return this.constraintToBox(diffX, diffY, flag, pointCoordsY)

  }

  // keep element within constrained box
  constraintToBox (diffX, diffY, flag, pointCoordsY) {
    //return [diffX, diffY]
    let c = this.options.constraint || {}
    let orgX, orgY

    if (typeof pointCoordsY !== 'undefined') {
      orgX = flag
      orgY = pointCoordsY
    } else {
      orgX = this.parameters.box.x + (flag & 1 ? 0 : this.parameters.box.width)
      orgY = this.parameters.box.y + (flag & (1<<1) ? 0 : this.parameters.box.height)
    }

    if (typeof c.minX !== 'undefined' && orgX + diffX < c.minX) {
      diffX = c.minX - orgX
    }

    if (typeof c.maxX !== 'undefined' && orgX + diffX > c.maxX) {
      diffX = c.maxX - orgX
    }

    if (typeof c.minY !== 'undefined' && orgY + diffY < c.minY) {
      diffY = c.minY - orgY
    }

    if (typeof c.maxY !== 'undefined' && orgY + diffY > c.maxY) {
      diffY = c.maxY - orgY
    }

    return [diffX, diffY]
  }

  checkAspectRatio (snap, isReverse) {
    if (!this.options.saveAspectRatio) {
      return snap
    }
    let updatedSnap = snap.slice()
    let aspectRatio = this.parameters.box.width / this.parameters.box.height
    let newW = this.parameters.box.width + snap[0]
    let newH = this.parameters.box.height - snap[1]
    let newAspectRatio = newW / newH

    if (newAspectRatio < aspectRatio) {
      // Height is too big. Adapt it
      updatedSnap[1] = newW / aspectRatio - this.parameters.box.height
      isReverse && (updatedSnap[1] = -updatedSnap[1])
    } else if (newAspectRatio > aspectRatio) {
      // Width is too big. Adapt it
      updatedSnap[0] = this.parameters.box.width - newH * aspectRatio
      isReverse && (updatedSnap[0] = -updatedSnap[0])
    }
    return updatedSnap
  }

  outOfContainer (event) {
    const constraint = this.constraint
    if (constraint) {
      if (event.pageX < constraint.minX || event.pageX > constraint.maxX || event.pageY < constraint.minY || event.pageY > constraint.maxY) {
        return true
      }
    }
  }

  _updateConstraint () {
    if (!this.container && !(this.container instanceof Element)) {
      return
    }
    const offset = this.container.getBoundingClientRect()
    this.constraint = {
      minX: offset.x,
      maxX: offset.x + offset.width,
      minY: offset.y,
      maxY: offset.y + offset.height
    }
  }
}

SVG.extend(SVG.Element, {
  // Resize element with mouse
  resize: function (options) {
    (this.remember('_resizeHandler') || new ResizeHandler(this)).init(options || {})
    return this
  }
})

SVG.Element.prototype.resize.defaults = {
  snapToAngle: 0.1,       // Specifies the speed the rotation is happening when moving the mouse
  snapToGrid: 1,          // Snaps to a grid of `snapToGrid` Pixels
  constraint: {},         // keep element within constrained box
  resizeLimits: { width: 10, height: 10 }, // rect limit size on resize
  saveAspectRatio: false  // Save aspect ratio when resizing using lt, rt, rb or lb points
}
