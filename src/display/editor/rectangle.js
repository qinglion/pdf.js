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
 * Rectangle editor for creating rectangular selections
 */
class RectangleEditor extends AnnotationEditor {
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

  // Rectangle state
  #currentRect = null; // { startX, startY, endX, endY }
  #rects = []; // Array of committed rectangles (single one in our logic)

  static _defaultColor = null;
  static _defaultOpacity = 1;
  static _defaultThickness = 2;
  static _l10nPromise;
  static _type = "rectangle";

  constructor(params) {
    super({ ...params, name: "rectangleEditor" });
    this.#color =
      params.color ||
      RectangleEditor._defaultColor ||
      AnnotationEditor._defaultLineColor;
    this.#thickness = params.thickness || RectangleEditor._defaultThickness;
    this.#opacity = params.opacity ?? RectangleEditor._defaultOpacity;

    // Initialize transformation properties
    this.scaleFactor = 1;
    this.translationX = this.translationY = 0;
    this.x = 0;
    this.y = 0;

    if (params.rectangles) {
      this.#rects = params.rectangles;
    }
    
    console.log('[RectangleEditor] Constructor called', {
      color: this.#color,
      thickness: this.#thickness,
      opacity: this.#opacity,
      hasRects: !!params.rectangles
    });
  }

  static initialize(l10n) {
    this._l10nPromise = new Map([
      ["editor_rectangle_aria_label", l10n.get("editor_rectangle_aria_label")],
    ]);
  }

  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.RECTANGLE_THICKNESS:
        RectangleEditor._defaultThickness = value;
        break;
      case AnnotationEditorParamsType.RECTANGLE_COLOR:
        RectangleEditor._defaultColor = value;
        break;
      case AnnotationEditorParamsType.RECTANGLE_OPACITY:
        RectangleEditor._defaultOpacity = value / 100;
        break;
    }
  }

  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.RECTANGLE_THICKNESS:
        this.#updateThickness(value);
        break;
      case AnnotationEditorParamsType.RECTANGLE_COLOR:
        this.#updateColor(value);
        break;
      case AnnotationEditorParamsType.RECTANGLE_OPACITY:
        this.#updateOpacity(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.RECTANGLE_THICKNESS,
        RectangleEditor._defaultThickness,
      ],
      [
        AnnotationEditorParamsType.RECTANGLE_COLOR,
        RectangleEditor._defaultColor || AnnotationEditor._defaultLineColor,
      ],
      [
        AnnotationEditorParamsType.RECTANGLE_OPACITY,
        Math.round(RectangleEditor._defaultOpacity * 100),
      ],
    ];
  }

  get propertiesToUpdate() {
    return [
      [AnnotationEditorParamsType.RECTANGLE_THICKNESS, this.#thickness],
      [AnnotationEditorParamsType.RECTANGLE_COLOR, this.#color],
      [
        AnnotationEditorParamsType.RECTANGLE_OPACITY,
        Math.round(this.#opacity * 100),
      ],
    ];
  }

  #updateThickness(thickness) {
    const savedThickness = this.#thickness;
    this.parent.addCommands({
      cmd: () => {
        this.#thickness = thickness;
        if (this.#disableEditing) {
          // Thickness affects padding; when committed we must refit to avoid clipping
          this.#fitToContent(false);
        } else {
          this.#redraw();
        }
      },
      undo: () => {
        this.#thickness = savedThickness;
        if (this.#disableEditing) {
          this.#fitToContent(false);
        } else {
          this.#redraw();
        }
      },
      mustExec: true,
      type: AnnotationEditorParamsType.RECTANGLE_THICKNESS,
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
      type: AnnotationEditorParamsType.RECTANGLE_COLOR,
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
      type: AnnotationEditorParamsType.RECTANGLE_OPACITY,
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
    console.log('[RectangleEditor] enableEditMode() called', {
      disableEditing: this.#disableEditing,
      hasCanvas: !!this.canvas
    });
    
    if (this.#disableEditing || this.canvas === null) {
      console.log('[RectangleEditor] enableEditMode() skipped');
      return;
    }

    super.enableEditMode();
    this.div.draggable = false;
    this.canvas.addEventListener("pointerdown", this.#boundCanvasPointerdown);
    console.log('[RectangleEditor] Edit mode enabled, pointerdown listener added');
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

    // This editor must be on top of the main rectangle editor.
    this.setInForeground();

    this.#disableEditing = true;
    this.div.classList.add("disabled");

    this.#fitToContent(/* firstTime = */ true);

    this.parent.addRectangleEditorIfNeeded(/* isCommitting = */ true);

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
    console.log('[RectangleEditor] canvasPointerdown', {
      button: event.button,
      isInEditMode: this.isInEditMode(),
      disableEditing: this.#disableEditing,
      offsetX: event.offsetX,
      offsetY: event.offsetY
    });
    
    if (event.button !== 0 || !this.isInEditMode() || this.#disableEditing) {
      console.log('[RectangleEditor] canvasPointerdown ignored');
      return;
    }

    // Initialize canvas dimensions on first draw
    this.isEditing = true;
    if (!this.#isCanvasInitialized) {
      this.#isCanvasInitialized = true;
      this.#setCanvasDims();
      this.#color ||= RectangleEditor._defaultColor || AnnotationEditor._defaultLineColor;
      this.#thickness ||= RectangleEditor._defaultThickness;
      this.#opacity ??= RectangleEditor._defaultOpacity;
      
      console.log('[RectangleEditor] Canvas initialized on first draw');
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

    // Start drawing rectangle with start corner at pointer
    this.#currentRect = {
      startX: event.offsetX,
      startY: event.offsetY,
      endX: event.offsetX,
      endY: event.offsetY,
    };
    
    console.log('[RectangleEditor] Started drawing rect', this.#currentRect);
    
    // Draw immediately to show the starting point
    this.#redraw();
  }

  /**
   * onpointermove callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasPointermove(event) {
    event.stopPropagation();

    if (!this.#currentRect) {
      return;
    }

    // Update both endX and endY for rectangle diagonal
    this.#currentRect.endX = event.offsetX;
    this.#currentRect.endY = event.offsetY;
    
    console.log('[RectangleEditor] canvasPointermove', {
      endX: this.#currentRect.endX,
      endY: this.#currentRect.endY,
      rect: this.#currentRect
    });
    
    this.#redraw();
  }

  /**
   * onpointerup callback for the canvas we're drawing on.
   * @param {PointerEvent} event
   */
  canvasPointerup(event) {
    console.log('[RectangleEditor] canvasPointerup', {
      button: event.button,
      hasCurrentRect: !!this.#currentRect
    });
    
    if (event.button !== 0 || !this.#currentRect) {
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
    console.log('[RectangleEditor] #endDrawing');
    
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

    // Commit the current rectangle
    if (this.#currentRect) {
      const width = Math.abs(this.#currentRect.endX - this.#currentRect.startX);
      const height = Math.abs(this.#currentRect.endY - this.#currentRect.startY);
      
      console.log('[RectangleEditor] Rect size:', { width, height });
      
      if (width > 5 && height > 5) {
        // Store this single rectangle
        this.#rects = [{ ...this.#currentRect }];
        this.#currentRect = null;
        
        console.log('[RectangleEditor] Rect committed, calling commit()');
        
        // Immediately commit this rectangle
        this.commit();
      } else {
        console.log('[RectangleEditor] Rect too small, discarded');
        this.#currentRect = null;
        this.#redraw();
      }
    } else {
      this.#currentRect = null;
    }
  }

  /**
   * Redraw rectangle(s)
   */
  #redraw() {
    if (!this.canvas) {
      console.log('[RectangleEditor] #redraw skipped - no canvas');
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

    console.log('[RectangleEditor] #redraw', {
      canvasSize: `${this.canvas.width}x${this.canvas.height}`,
      color: ctx.strokeStyle,
      thickness: ctx.lineWidth,
      committedRects: this.#rects.length,
      hasCurrentRect: !!this.#currentRect
    });

    // Draw committed rectangles
    for (const rect of this.#rects) {
      const x = Math.min(rect.startX, rect.endX);
      const y = Math.min(rect.startY, rect.endY);
      const w = Math.abs(rect.endX - rect.startX);
      const h = Math.abs(rect.endY - rect.startY);
      ctx.strokeRect(x, y, w, h);
      console.log('[RectangleEditor] Drew committed rect:', { x, y, w, h });
    }

    // Draw current rectangle being drawn
    if (this.#currentRect) {
      const x = Math.min(this.#currentRect.startX, this.#currentRect.endX);
      const y = Math.min(this.#currentRect.startY, this.#currentRect.endY);
      const w = Math.abs(this.#currentRect.endX - this.#currentRect.startX);
      const h = Math.abs(this.#currentRect.endY - this.#currentRect.startY);
      ctx.strokeRect(x, y, w, h);
      console.log('[RectangleEditor] Drew current rect:', { x, y, w, h });
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
    
    console.log('[RectangleEditor] #setCanvasDims', {
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
    this.canvas.className = "rectangleEditorCanvas";
    
    // 添加调试样式，确保 canvas 可见且可交互
    this.canvas.style.touchAction = "none";

    RectangleEditor._l10nPromise
      .get("editor_rectangle_aria_label")
      .then(msg => this.canvas?.setAttribute("aria-label", msg));
    this.div.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    
    console.log('[RectangleEditor] #createCanvas completed', {
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
    console.log('[RectangleEditor] render() called', { hasDiv: !!this.div });
    
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
      console.log('[RectangleEditor] Restoring from saved state');
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
      console.log('[RectangleEditor] Creating new editor (ready for drawing)');
      this.div.classList.add("editing");
      this.enableEditMode();
    }

    console.log('[RectangleEditor] render() completed', {
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
   * Get the bounding box containing the rectangles.
   * @returns {Array<number>}
   */
  #getBbox() {
    if (this.#rects.length === 0) {
      return [0, 0, 0, 0];
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const rect of this.#rects) {
      const x1 = Math.min(rect.startX, rect.endX);
      const y1 = Math.min(rect.startY, rect.endY);
      const x2 = Math.max(rect.startX, rect.endX);
      const y2 = Math.max(rect.startY, rect.endY);
      xMin = Math.min(xMin, x1);
      yMin = Math.min(yMin, y1);
      xMax = Math.max(xMax, x2);
      yMax = Math.max(yMax, y2);
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
      rectsCount: this.#rects.length
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
    return this.#rects.length === 0 && !this.#currentRect;
  }

  /** @inheritdoc */
  serialize() {
    if (this.isEmpty()) {
      return null;
    }

    const rect = this.getRect(0, 0);
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;

    // Convert rectangles to percentage coordinates
    const rectangles = this.#rects.map(rect => ({
      startX: rect.startX / parentWidth,
      startY: rect.startY / parentHeight,
      endX: rect.endX / parentWidth,
      endY: rect.endY / parentHeight,
    }));

    return {
      annotationType: AnnotationEditorType.RECTANGLE,
      color: AnnotationEditor._colorManager.convert(this.#color),
      thickness: this.#thickness,
      opacity: this.#opacity,
      rectangles,
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

    if (data.rectangles) {
      const [parentWidth, parentHeight] = parent.viewportBaseDimensions;
      editor.#rects = data.rectangles.map(rect => ({
        startX: rect.startX * parentWidth,
        startY: rect.startY * parentHeight,
        endX: rect.endX * parentWidth,
        endY: rect.endY * parentHeight,
      }));
    }

    editor.#disableEditing = true;

    return editor;
  }
}

export { RectangleEditor };
