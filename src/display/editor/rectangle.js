// new feature

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  Util,
} from "../../shared/util.js";
import { AnnotationEditor } from "./editor.js";
import { opacityToHex } from "./tools.js";

/**
 * Rectangle editor for creating rectangular selections
 */
class RectangleEditor extends AnnotationEditor {
  #boundPointerDown = this.pointerDown.bind(this);
  #boundPointerMove = this.pointerMove.bind(this);
  #boundPointerUp = this.pointerUp.bind(this);

  #color;
  #thickness;
  #opacity;
  #isDrawing = false;
  #startX = 0;
  #startY = 0;
  #rect = null;

  static _defaultColor = null;
  static _defaultThickness = 2;
  static _defaultOpacity = 1;
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
  }

  static initialize(l10n) {
    this._l10nPromise = new Map(
      ["editor_rectangle_aria_label"].map(str => [str, l10n.get(str)])
    );
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
        this.#redraw();
      },
      undo: () => {
        this.#thickness = savedThickness;
        this.#redraw();
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

  #redraw() {
    if (!this.#rect || !this.canvas) return;

    const ctx = this.canvas.getContext("2d");
    const [x, y, w, h] = this.#rect;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = `${this.#color}${opacityToHex(this.#opacity)}`;
    ctx.lineWidth = this.#thickness;
    ctx.strokeRect(x, y, w, h);
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

  getInitialTranslation() {
    return [0, 0];
  }

  render() {
    if (this.div) {
      return this.div;
    }

    let baseX, baseY;
    if (this.width) {
      baseX = this.x;
      baseY = this.y;
    }

    super.render();

    this.#createCanvas();

    if (this.width) {
      // 从已保存数据恢复
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.setAt(
        baseX * parentWidth,
        baseY * parentHeight,
        this.width * parentWidth,
        this.height * parentHeight
      );
      this.#setCanvasDims();
      this.#redraw();
      this.div.classList.add("disabled");
    } else {
      // 新建，允许绘制
      const [x, y, w, h] = this.#getInitialBBox();
      this.setAt(x, y, 0, 0);
      this.setDims(w, h);
      this.#setCanvasDims();
      this.div.classList.add("drawing");
      this.canvas.addEventListener("pointerdown", this.#boundPointerDown);
    }

    return this.div;
  }

  pointerDown(event) {
    if (event.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    this.#startX = event.clientX - rect.left;
    this.#startY = event.clientY - rect.top;
    this.#isDrawing = true;

    this.canvas.addEventListener("pointermove", this.#boundPointerMove);
    this.canvas.addEventListener("pointerup", this.#boundPointerUp);
    this.canvas.setPointerCapture(event.pointerId);
  }

  pointerMove(event) {
    if (!this.#isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    const x = Math.min(this.#startX, currentX);
    const y = Math.min(this.#startY, currentY);
    const w = Math.abs(currentX - this.#startX);
    const h = Math.abs(currentY - this.#startY);

    this.#rect = [x, y, w, h];
    this.#redraw();
  }

  pointerUp(event) {
    if (!this.#isDrawing) return;

    this.#isDrawing = false;
    this.canvas.removeEventListener("pointermove", this.#boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.#boundPointerUp);
    this.canvas.releasePointerCapture(event.pointerId);

    if (this.#rect && this.#rect[2] > 5 && this.#rect[3] > 5) {
      this.commit();
    } else {
      this.remove();
    }
  }

  #setCanvasDims() {
    if (!this.canvas) return;
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.canvas.width = Math.ceil(this.width * parentWidth);
    this.canvas.height = Math.ceil(this.height * parentHeight);
  }

  commit() {
    if (!this.#rect) return;
    
    // 根据绘制的矩形调整编辑器尺寸和位置
    const [x, y, w, h] = this.#rect;
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    
    // 更新百分比坐标
    this.x += x / parentWidth;
    this.y += y / parentHeight;
    this.width = w / parentWidth;
    this.height = h / parentHeight;
    
    // 重设位置和尺寸
    this.setDims(w, h);
    this.translate(x, y);
    
    // 调整 rect 为相对于新位置的坐标
    this.#rect = [0, 0, w, h];
    this.#setCanvasDims();
    this.#redraw();
    
    super.commit();
    
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.#boundPointerDown);
    }
    
    if (this.div) {
      this.div.classList.remove("drawing");
      this.div.classList.add("disabled");
    }
    
    this.parent.addUndoableEditor(this);
  }

  isEmpty() {
    return !this.#rect || (this.#rect[2] === 0 && this.#rect[3] === 0);
  }

  remove() {
    if (this.canvas) {
      this.canvas.width = this.canvas.height = 0;
      this.canvas.remove();
      this.canvas = null;
    }
    super.remove();
  }

  rebuild() {
    super.rebuild();
    if (this.div === null) {
      return;
    }

    if (!this.canvas) {
      this.#createCanvas();
    }

    if (!this.isAttachedToDOM) {
      this.parent.add(this);
      this.#setCanvasDims();
    }
    this.#redraw();
  }

  #createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "rectangleEditorCanvas";
    
    RectangleEditor._l10nPromise
      .get("editor_rectangle_aria_label")
      .then(msg => this.canvas?.setAttribute("aria-label", msg));
    
    this.div.append(this.canvas);
  }

  serialize() {
    if (this.isEmpty()) return null;

    const rect = this.getRect(0, 0);
    return {
      annotationType: AnnotationEditorType.RECTANGLE,
      color: AnnotationEditor._colorManager.convert(this.#color),
      thickness: this.#thickness,
      opacity: this.#opacity,
      rect,
      pageIndex: this.parent.pageIndex,
      rotation: this.rotation,
    };
  }

  static deserialize(data, parent) {
    const editor = super.deserialize(data, parent);
    editor.#color = Util.makeHexColor(...data.color);
    editor.#thickness = data.thickness;
    editor.#opacity = data.opacity;

    // rect 已经在 super.deserialize 中处理了位置和尺寸
    // 我们只需要设置矩形绘制坐标为相对于编辑器的坐标
    const [parentWidth, parentHeight] = parent.viewportBaseDimensions;
    const w = editor.width * parentWidth;
    const h = editor.height * parentHeight;
    
    editor.#rect = [0, 0, w, h];
    return editor;
  }
}

export { RectangleEditor };
