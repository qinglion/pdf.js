// new feature

import {
    AnnotationEditorParamsType,
    AnnotationEditorType,
    Util,
  } from "../../shared/util.js";
  import { AnnotationEditor } from "./editor.js";
  import { opacityToHex } from "./tools.js";
  
  // The dimensions of the resizer is 15x15:
  // https://searchfox.org/mozilla-central/rev/1ce190047b9556c3c10ab4de70a0e61d893e2954/toolkit/content/minimal-xul.css#136-137
  // so each dimension must be greater than RESIZER_SIZE.
  const RESIZER_SIZE = 16;
  
  /**
   * Line editor for creating horizontal line annotations
   * Based on InkEditor but only draws horizontal lines
   */
  class LineEditor extends AnnotationEditor {
    #baseHeight = 0;
    #baseWidth = 0;
    #boundCanvasPointerdown = this.canvasPointerdown.bind(this);
    #boundCanvasPointermove = this.canvasPointermove.bind(this);
    #boundCanvasPointerup = this.canvasPointerup.bind(this);
    #boundCanvasPointerleave = this.canvasPointerleave.bind(this);
    #disableEditing = false;
    #isCanvasInitialized = false;
    #observer = null;
    #realWidth = 0;
    #realHeight = 0;
  
    #color;
    #thickness;
    #opacity;
  
    // Line state
    #currentLine = null; // { startX, startY, endX, endY }
    #lines = []; // Array of committed lines
  
    static _defaultColor = null;
    static _defaultOpacity = 1;
    static _defaultThickness = 2;
    static _l10nPromise;
    static _type = "line";
  
    constructor(params) {
      super({ ...params, name: "lineEditor" });
      this.#color =
        params.color ||
        LineEditor._defaultColor ||
        AnnotationEditor._defaultLineColor;
      this.#thickness = params.thickness || LineEditor._defaultThickness;
      this.#opacity = params.opacity ?? LineEditor._defaultOpacity;
  
      // Initialize transformation properties
      this.scaleFactor = 1;
      this.translationX = this.translationY = 0;
      this.x = 0;
      this.y = 0;
  
      if (params.lines) {
        this.#lines = params.lines;
      }
      
      console.log('[LineEditor] Constructor called', {
        color: this.#color,
        thickness: this.#thickness,
        opacity: this.#opacity,
        hasLines: !!params.lines
      });
    }
  
    static initialize(l10n) {
      this._l10nPromise = new Map(
        ["editor_line_aria_label", "editor_line2_aria_label"].map(str => [
          str,
          l10n.get(str),
        ])
      );
    }
  
    static updateDefaultParams(type, value) {
      switch (type) {
        case AnnotationEditorParamsType.LINE_THICKNESS:
          LineEditor._defaultThickness = value;
          break;
        case AnnotationEditorParamsType.LINE_COLOR:
          LineEditor._defaultColor = value;
          break;
        case AnnotationEditorParamsType.LINE_OPACITY:
          LineEditor._defaultOpacity = value / 100;
          break;
      }
    }
  
    updateParams(type, value) {
      switch (type) {
        case AnnotationEditorParamsType.LINE_THICKNESS:
          this.#updateThickness(value);
          break;
        case AnnotationEditorParamsType.LINE_COLOR:
          this.#updateColor(value);
          break;
        case AnnotationEditorParamsType.LINE_OPACITY:
          this.#updateOpacity(value);
          break;
      }
    }
  
    static get defaultPropertiesToUpdate() {
      return [
        [AnnotationEditorParamsType.LINE_THICKNESS, LineEditor._defaultThickness],
        [
          AnnotationEditorParamsType.LINE_COLOR,
          LineEditor._defaultColor || AnnotationEditor._defaultLineColor,
        ],
        [
          AnnotationEditorParamsType.LINE_OPACITY,
          Math.round(LineEditor._defaultOpacity * 100),
        ],
      ];
    }
  
    get propertiesToUpdate() {
      return [
        [AnnotationEditorParamsType.LINE_THICKNESS, this.#thickness],
        [AnnotationEditorParamsType.LINE_COLOR, this.#color],
        [
          AnnotationEditorParamsType.LINE_OPACITY,
          Math.round(this.#opacity * 100),
        ],
      ];
    }
  
    #updateThickness(thickness) {
      const savedThickness = this.#thickness;
      this.parent.addCommands({
        cmd: () => {
          this.#thickness = thickness;
          this.#redraw();
        },
        undo: () => {
          this.#thickness = savedThickness;
          this.#redraw();
        },
        mustExec: true,
        type: AnnotationEditorParamsType.LINE_THICKNESS,
        overwriteIfSameType: true,
        keepUndo: true,
      });
    }
  
    #updateColor(color) {
      const savedColor = this.#color;
      this.parent.addCommands({
        cmd: () => {
          this.#color = color;
          this.#redraw();
        },
        undo: () => {
          this.#color = savedColor;
          this.#redraw();
        },
        mustExec: true,
        type: AnnotationEditorParamsType.LINE_COLOR,
        overwriteIfSameType: true,
        keepUndo: true,
      });
    }
  
    #updateOpacity(opacity) {
      opacity /= 100;
      const savedOpacity = this.#opacity;
      this.parent.addCommands({
        cmd: () => {
          this.#opacity = opacity;
          this.#redraw();
        },
        undo: () => {
          this.#opacity = savedOpacity;
          this.#redraw();
        },
        mustExec: true,
        type: AnnotationEditorParamsType.LINE_OPACITY,
        overwriteIfSameType: true,
        keepUndo: true,
      });
    }
  
    /** @inheritdoc */
    rebuild() {
      super.rebuild();
      if (this.div === null) {
        return;
      }
  
      if (!this.canvas) {
        this.#createCanvas();
        this.#createObserver();
      }
  
      if (!this.isAttachedToDOM) {
        // At some point this editor was removed and we're rebuilding it,
        // hence we must add it to its parent.
        this.parent.add(this);
        this.#setCanvasDims();
      }
      this.#redraw();
    }
  
    /** @inheritdoc */
    remove() {
      if (this.canvas === null) {
        return;
      }
  
      if (!this.isEmpty()) {
        this.commit();
      }
  
      // Destroy the canvas.
      this.canvas.width = this.canvas.height = 0;
      this.canvas.remove();
      this.canvas = null;
  
      this.#observer?.disconnect();
      this.#observer = null;
  
      super.remove();
    }
  
    setParent(parent) {
      if (!this.parent && parent) {
        // We've a parent hence the rescale will be handled thanks to the
        // ResizeObserver.
        this._uiManager.removeShouldRescale(this);
      } else if (this.parent && parent === null) {
        // The editor is removed from the DOM, hence we handle the rescale thanks
        // to the onScaleChanging method.
        this._uiManager.addShouldRescale(this);
      }
      super.setParent(parent);
    }
  
    onScaleChanging() {
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      const width = this.width * parentWidth;
      const height = this.height * parentHeight;
      this.setDimensions(width, height);
    }
  
    /** @inheritdoc */
    enableEditMode() {
      console.log('[LineEditor] enableEditMode() called', {
        disableEditing: this.#disableEditing,
        hasCanvas: !!this.canvas
      });
      
      if (this.#disableEditing || this.canvas === null) {
        console.log('[LineEditor] enableEditMode() skipped');
        return;
      }
  
      super.enableEditMode();
      this.div.draggable = false;
      this.canvas.addEventListener("pointerdown", this.#boundCanvasPointerdown);
      console.log('[LineEditor] Edit mode enabled, pointerdown listener added');
    }
  
    /** @inheritdoc */
    disableEditMode() {
      if (!this.isInEditMode() || this.canvas === null) {
        return;
      }
  
      super.disableEditMode();
      this.div.draggable = true;
      this.canvas.removeEventListener("pointerdown", this.#boundCanvasPointerdown);
    }
  
    /** @inheritdoc */
    commit() {
      if (this.#disableEditing) {
        return;
      }
  
      super.commit();
  
      this.isEditing = false;
      this.disableEditMode();
  
      // This editor must be on top of the main line editor.
      this.setInForeground();
  
      this.#disableEditing = true;
      this.div.classList.add("disabled");
  
      this.#fitToContent(/* firstTime = */ true);
  
      this.parent.addLineEditorIfNeeded(/* isCommitting = */ true);
  
      // When commiting, the position of this editor is changed, hence we must
      // move it to the right position in the DOM.
      this.parent.moveEditorInDOM(this);
      // After the div has been moved in the DOM, the focus may have been stolen
      // by document.body, hence we just keep it here.
      this.div.focus();
    }
  
    /** @inheritdoc */
    focusin(event) {
      super.focusin(event);
      this.enableEditMode();
    }
  
    /**
     * onpointerdown callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointerdown(event) {
      console.log('[LineEditor] canvasPointerdown', {
        button: event.button,
        isInEditMode: this.isInEditMode(),
        disableEditing: this.#disableEditing,
        offsetX: event.offsetX,
        offsetY: event.offsetY
      });
      
      if (event.button !== 0 || !this.isInEditMode() || this.#disableEditing) {
        console.log('[LineEditor] canvasPointerdown ignored');
        return;
      }
  
      // Initialize canvas dimensions on first draw
      this.isEditing = true;
      if (!this.#isCanvasInitialized) {
        this.#isCanvasInitialized = true;
        this.#setCanvasDims();
        this.#color ||= LineEditor._defaultColor || AnnotationEditor._defaultLineColor;
        this.#thickness ||= LineEditor._defaultThickness;
        this.#opacity ??= LineEditor._defaultOpacity;
        
        console.log('[LineEditor] Canvas initialized on first draw');
      }
  
      // We want to draw on top of any other editors.
      // Since it's the last child, there's no need to give it a higher z-index.
      this.setInForeground();
  
      if (event.type !== "mouse") {
        this.div.focus();
      }
  
      event.stopPropagation();
  
      this.canvas.addEventListener("pointerleave", this.#boundCanvasPointerleave);
      this.canvas.addEventListener("pointermove", this.#boundCanvasPointermove);
      this.canvas.addEventListener("pointerup", this.#boundCanvasPointerup);
  
      // Start drawing horizontal line
      const y = event.offsetY;
      this.#currentLine = {
        startX: event.offsetX,
        startY: y,
        endX: event.offsetX,
        endY: y, // Keep Y the same for horizontal line
      };
      
      console.log('[LineEditor] Started drawing line', this.#currentLine);
      
      // Draw immediately to show the starting point
      this.#redraw();
    }
  
    /**
     * onpointermove callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointermove(event) {
      event.stopPropagation();
  
      if (!this.#currentLine) {
        return;
      }
  
      // Update only the endX, keep endY same as startY for horizontal line
      this.#currentLine.endX = event.offsetX;
      
      console.log('[LineEditor] canvasPointermove', {
        endX: this.#currentLine.endX,
        line: this.#currentLine
      });
      
      this.#redraw();
    }
  
    /**
     * onpointerup callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointerup(event) {
      console.log('[LineEditor] canvasPointerup', {
        button: event.button,
        hasCurrentLine: !!this.#currentLine
      });
      
      if (event.button !== 0 || !this.#currentLine) {
        return;
      }
  
      event.stopPropagation();
  
      this.#endDrawing(event);
      // Note: setInBackground() is not needed here because commit() handles z-index
    }
  
    /**
     * onpointerleave callback for the canvas we're drawing on.
     * @param {PointerEvent} event
     */
    canvasPointerleave(event) {
      this.#endDrawing(event);
      // Note: setInBackground() is not needed here because commit() handles z-index
    }
  
    /**
     * End the drawing.
     * @param {PointerEvent} event
     */
    #endDrawing(event) {
      console.log('[LineEditor] #endDrawing');
      
      this.canvas.removeEventListener(
        "pointerleave",
        this.#boundCanvasPointerleave
      );
      this.canvas.removeEventListener(
        "pointermove",
        this.#boundCanvasPointermove
      );
      this.canvas.removeEventListener(
        "pointerup",
        this.#boundCanvasPointerup
      );
  
      // Commit the current line
      if (this.#currentLine) {
        const dx = this.#currentLine.endX - this.#currentLine.startX;
        const length = Math.abs(dx);
        
        console.log('[LineEditor] Line length:', length);
        
        if (length > 5) {
          // Store this single line
          this.#lines = [{ ...this.#currentLine }];
          this.#currentLine = null;
          
          console.log('[LineEditor] Line committed, calling commit()');
          
          // Immediately commit this line (different from InkEditor's multi-line approach)
          // commit() will call addLineEditorIfNeeded() internally
          this.commit();
        } else {
          console.log('[LineEditor] Line too short, discarded');
          this.#currentLine = null;
          this.#redraw();
        }
      } else {
        this.#currentLine = null;
      }
    }
  
    /**
     * Redraw all lines
     */
    #redraw() {
      if (!this.canvas) {
        console.log('[LineEditor] #redraw skipped - no canvas');
        return;
      }
  
      if (this.isEmpty()) {
        this.#updateTransform();
        return;
      }
  
      const ctx = this.canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.#updateTransform();
  
      ctx.strokeStyle = `${this.#color}${opacityToHex(this.#opacity)}`;
      ctx.lineWidth = (this.#thickness * this.parent.scaleFactor) / this.scaleFactor;
      ctx.lineCap = "round";
  
      console.log('[LineEditor] #redraw', {
        canvasSize: `${this.canvas.width}x${this.canvas.height}`,
        color: ctx.strokeStyle,
        thickness: ctx.lineWidth,
        committedLines: this.#lines.length,
        hasCurrentLine: !!this.#currentLine
      });
  
      // Draw committed lines
      for (const line of this.#lines) {
        ctx.beginPath();
        ctx.moveTo(line.startX, line.startY);
        ctx.lineTo(line.endX, line.endY);
        ctx.stroke();
        console.log('[LineEditor] Drew committed line:', line);
      }
  
      // Draw current line being drawn
      if (this.#currentLine) {
        ctx.beginPath();
        ctx.moveTo(this.#currentLine.startX, this.#currentLine.startY);
        ctx.lineTo(this.#currentLine.endX, this.#currentLine.endY);
        ctx.stroke();
        console.log('[LineEditor] Drew current line:', this.#currentLine);
      }
    }
  
    #getInitialBBox() {
      const { width, height, rotation } = this.parent.viewport;
      switch (rotation) {
        case 90:
          return [0, width, width, height];
        case 180:
          return [width, height, width, height];
        case 270:
          return [height, 0, width, height];
        default:
          return [0, 0, width, height];
      }
    }
  
    /**
     * Update the canvas transform.
     */
    #updateTransform() {
      const padding = this.#getPadding() / 2;
      this.ctx.setTransform(
        this.scaleFactor,
        0,
        0,
        this.scaleFactor,
        this.translationX * this.scaleFactor + padding,
        this.translationY * this.scaleFactor + padding
      );
    }
  
    #setCanvasDims() {
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.canvas.width = Math.ceil(this.width * parentWidth);
      this.canvas.height = Math.ceil(this.height * parentHeight);
      
      console.log('[LineEditor] #setCanvasDims', {
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        editorWidth: this.width,
        editorHeight: this.height,
        parentWidth,
        parentHeight
      });
  
      this.#updateTransform();
    }
  
    /**
     * Set line dimensions.
     * @param {number} width - The width of the line.
     * @param {number} height - The height of the line.
     */
    setDimensions(width, height) {
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.width = width / parentWidth;
      this.height = height / parentHeight;
      this.#setDimensions();
  
      if (this.#disableEditing) {
        this.#setScaleFactor(width, height);
      }
    }
  
    #setDimensions() {
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      const width = this.width * parentWidth;
      const height = this.height * parentHeight;
      this.canvas.style.visibility = "hidden";
  
      if (
        this.#realWidth === width &&
        this.#realHeight === height
      ) {
        this.canvas.style.visibility = "visible";
        return;
      }
  
      this.#realWidth = width;
      this.#realHeight = height;
      this.canvas.style.visibility = "visible";
    }
  
    #setScaleFactor(width, height) {
      const padding = this.#getPadding();
      const scaleFactorW = (width - padding) / this.#baseWidth;
      const scaleFactorH = (height - padding) / this.#baseHeight;
      this.scaleFactor = Math.min(scaleFactorW, scaleFactorH);
    }
  
    /**
     * Create the canvas element.
     */
    #createCanvas() {
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.canvas.height = 0;
      this.canvas.className = "lineEditorCanvas";
      
      // 添加调试样式，确保 canvas 可见且可交互
      this.canvas.style.touchAction = "none";
  
      LineEditor._l10nPromise
        .get("editor_line_aria_label")
        .then(msg => this.canvas?.setAttribute("aria-label", msg));
      this.div.append(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      
      console.log('[LineEditor] #createCanvas completed', {
        canvas: this.canvas,
        className: this.canvas.className,
        parent: this.canvas.parentElement
      });
    }
  
    /**
     * Create the resize observer.
     */
    #createObserver() {
      let timeoutId = null;
      this.#observer = new ResizeObserver(entries => {
        const rect = entries[0].contentRect;
        if (rect.width && rect.height) {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            this.fixDims();
          }, 100);
        }
      });
      this.#observer.observe(this.div);
    }
  
    /** @inheritdoc */
    get isResizable() {
      return !this.isEmpty() && this.#disableEditing;
    }
  
    /** @inheritdoc */
    render() {
      console.log('[LineEditor] render() called', { hasDiv: !!this.div });
      
      if (this.div) {
        return this.div;
      }
  
      let baseX, baseY;
      if (this.width) {
        baseX = this.x;
        baseY = this.y;
      }
  
      super.render();
  
      const [x, y, w, h] = this.#getInitialBBox();
      this.setAt(x, y, 0, 0);
      this.setDims(w, h);
  
      this.#createCanvas();
      this.#createObserver();
  
      if (this.width) {
        // This editor was created in using copy (ctrl+c).
        console.log('[LineEditor] Restoring from saved state');
        const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
        this.setAt(
          baseX * parentWidth,
          baseY * parentHeight,
          this.width * parentWidth,
          this.height * parentHeight
        );
        this.#isCanvasInitialized = true;
        this.#setCanvasDims();
        this.setDims(this.width * parentWidth, this.height * parentHeight);
        this.#redraw();
        this.div.classList.add("disabled");
      } else {
        // This editor is created in using the floating button.
        console.log('[LineEditor] Creating new editor (ready for drawing)');
        this.div.classList.add("editing");
        this.enableEditMode();
      }
  
      console.log('[LineEditor] render() completed', {
        canvas: !!this.canvas,
        canvasSize: this.canvas ? `${this.canvas.width}x${this.canvas.height}` : 'null',
        divClasses: this.div.className
      });
  
      return this.div;
    }
  
    #getPadding() {
      return this.#disableEditing
        ? Math.ceil(this.#thickness * this.parent.scaleFactor)
        : 0;
    }
  
    /**
     * Get the bounding box containing all the lines.
     * @returns {Array<number>}
     */
    #getBbox() {
      if (this.#lines.length === 0) {
        return [0, 0, 0, 0];
      }
  
      let xMin = Infinity;
      let xMax = -Infinity;
      let yMin = Infinity;
      let yMax = -Infinity;
  
      for (const line of this.#lines) {
        xMin = Math.min(xMin, line.startX, line.endX);
        yMin = Math.min(yMin, line.startY, line.endY);
        xMax = Math.max(xMax, line.startX, line.endX);
        yMax = Math.max(yMax, line.startY, line.endY);
      }
  
      return [xMin, yMin, xMax, yMax];
    }
  
    /**
     * Fit the editor to its content.
     * @param {boolean} firstTime
     */
    #fitToContent(firstTime = false) {
      console.log('[LineEditor] #fitToContent called', {
        firstTime,
        isEmpty: this.isEmpty(),
        disableEditing: this.#disableEditing,
        linesCount: this.#lines.length
      });
      
      if (this.isEmpty()) {
        console.log('[LineEditor] #fitToContent: editor is empty, skipping');
        return;
      }
  
      if (!this.#disableEditing) {
        console.log('[LineEditor] #fitToContent: still editing, just redraw');
        this.#redraw();
        return;
      }
  
      try {
        console.log('[LineEditor] #fitToContent: getting bbox...');
        const bbox = this.#getBbox();
        console.log('[LineEditor] #fitToContent: bbox =', bbox);
      const padding = this.#getPadding();
      this.#baseWidth = Math.max(RESIZER_SIZE, bbox[2] - bbox[0]);
      this.#baseHeight = Math.max(RESIZER_SIZE, bbox[3] - bbox[1]);
  
      const width = Math.ceil(padding + this.#baseWidth * this.scaleFactor);
      const height = Math.ceil(padding + this.#baseHeight * this.scaleFactor);
  
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.width = width / parentWidth;
      this.height = height / parentHeight;
  
      if (this.#disableEditing) {
        this.#setScaleFactor(width, height);
      }
  
      console.log('[LineEditor] #fitToContent calculations', {
        bbox,
        padding,
        baseWidth: this.#baseWidth,
        baseHeight: this.#baseHeight,
        scaleFactor: this.scaleFactor,
        width,
        height,
        parentWidth,
        parentHeight,
        widthPercent: this.width,
        heightPercent: this.height
      });
  
      const prevTranslationX = this.translationX;
      const prevTranslationY = this.translationY;
  
      this.translationX = -bbox[0];
      this.translationY = -bbox[1];
      
      console.log('[LineEditor] #fitToContent translations', {
        prevTranslationX,
        prevTranslationY,
        newTranslationX: this.translationX,
        newTranslationY: this.translationY
      });
      
      this.#setCanvasDims();
      this.#redraw();
  
      this.#realWidth = width;
      this.#realHeight = height;
  
      this.setDims(width, height);
      const unscaledPadding = firstTime ? padding / this.scaleFactor / 2 : 0;
      const translateX = prevTranslationX - this.translationX - unscaledPadding;
      const translateY = prevTranslationY - this.translationY - unscaledPadding;
      
      console.log('[LineEditor] #fitToContent final translate', {
        translateX,
        translateY,
        unscaledPadding
      });
      
      this.translate(translateX, translateY);
      
      console.log('[LineEditor] #fitToContent completed successfully');
      } catch (error) {
        console.error('[LineEditor] #fitToContent ERROR:', error);
        console.error('[LineEditor] Stack trace:', error.stack);
      }
    }
  
    /**
     * Fix the dimensions.
     * When we add the editor to the DOM, the dimensions are computed from the
     * bounding box of the path but it's not the same in every browser.
     * So we need to fix them after a short time.
     */
    fixDims() {
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      const { style } = this.div;
      const { height, width } = style;
      const widthPercent = parseFloat(width);
      const heightPercent = parseFloat(height);
      if (!Number.isNaN(widthPercent) && !Number.isNaN(heightPercent)) {
        this.width = widthPercent / 100;
        this.height = heightPercent / 100;
        this.setDims(parentWidth * this.width, parentHeight * this.height);
      }
    }
  
    /** @inheritdoc */
    isEmpty() {
      return this.#lines.length === 0 && !this.#currentLine;
    }
  
    /** @inheritdoc */
    serialize() {
      if (this.isEmpty()) {
        return null;
      }
  
      const rect = this.getRect(0, 0);
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
  
      // Convert lines to percentage coordinates
      const lines = this.#lines.map(line => ({
        startX: line.startX / parentWidth,
        startY: line.startY / parentHeight,
        endX: line.endX / parentWidth,
        endY: line.endY / parentHeight,
      }));
  
      return {
        annotationType: AnnotationEditorType.LINE,
        color: AnnotationEditor._colorManager.convert(this.#color),
        thickness: this.#thickness,
        opacity: this.#opacity,
        lines,
        rect,
        pageIndex: this.parent.pageIndex,
        rotation: this.rotation,
      };
    }
  
    /** @inheritdoc */
    static deserialize(data, parent) {
      const editor = super.deserialize(data, parent);
      editor.#color = Util.makeHexColor(...data.color);
      editor.#thickness = data.thickness;
      editor.#opacity = data.opacity;
  
      if (data.lines) {
        const [parentWidth, parentHeight] = parent.viewportBaseDimensions;
        editor.#lines = data.lines.map(line => ({
          startX: line.startX * parentWidth,
          startY: line.startY * parentHeight,
          endX: line.endX * parentWidth,
          endY: line.endY * parentHeight,
        }));
      }
  
      editor.#disableEditing = true;
  
      return editor;
    }
  }
  
  export { LineEditor };