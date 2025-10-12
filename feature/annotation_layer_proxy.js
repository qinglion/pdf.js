/* new feature */
import { Util, AnnotationType } from "pdfjs-lib";
import {
  transformPSPDFKitRect,
  transformPSPDFKitQuadPoints,
  transformPSPDFKitLineCoordinates,
} from "./ui_utils";
import { AnnotationBuilder } from "./annotation_builder";

class AnnotationLayerProxy {
  constructor({ instance, eventBus, pdfLinkService, downloadManager }) {
    this.instance = instance;
    this.eventBus = eventBus;
    this.pdfLinkService = pdfLinkService;
    this.downloadManager = downloadManager;
    this.events = {
      draw: this.handleDrawAnnotation.bind(this),
      resize: this.handleResizeAnnotation.bind(this),
      move: this.handleMoveAnnotation.bind(this),
    };
    this.bindEvents();
  }

  bindEvents() {
    this.eventBus._on("draw.annotation", this.events.draw);
    this.eventBus._on("resize.annotation", this.events.resize);
    this.eventBus._on("move.annotation", this.events.move);
  }

  unbindAll() {
    this.eventBus._off("draw.annotation", this.events.draw);
    this.eventBus._off("resize.annotation", this.events.resize);
    this.eventBus._off("move.annotation", this.events.move);
  }

  get pdfDocument() {
    return this.instance.pdfDocument;
  }

  get pdfViewer() {
    return this.instance.pdfViewer;
  }

  async handleDrawAnnotation(type, data) {
    let pageIndex = parseInt(data.page) - 1;
    await this.pdfViewer.pagesPromise;
    const page = this.pdfViewer.getPageView(pageIndex);

    switch (type) {
      case "rectangle":
        return this.handleDrawRectangleAnnotation(page, data.coord);
      case "line":
        return this.handleDrawLineAnnotation(page, data);
      default:
        throw new Error(`unrecognised type:${type}`);
    }
  }

  async handleDrawRectangleAnnotation(page, coord) {
    const rect = this._caculateRect(page, coord);
    if (rect) {
      const { annotation, pdfPage, viewport } = this._convertRectToAnnotation({
        annotationType: AnnotationType.SQUARE,
        rect: rect,
        page: page.id,
      });
      this.eventBus.dispatch("annotations.create", {
        page: pdfPage,
        viewport,
        annotation,
      });
    }
  }

  async handleDrawLineAnnotation(page, data) {
    const viewport = page.viewport.clone({ dontFlip: true });
    const { x1, y1, x2, y2 } = data.coord;
    const height = viewport.viewBox[3];

    let [_x1, _y1] = viewport.convertToPdfPoint(x1, y1);
    let [_x2, _y2] = viewport.convertToPdfPoint(x2, y2);
    _y1 = height - _y1;
    _y2 = height - _y2;

    const lineCoordinates = [_x1, _y2, _x2, _y1];
    let rect = Util.normalizeRect(lineCoordinates);
    rect = [rect[0] - 3, rect[1] - 4, rect[2] + 3, rect[3] + 5];

    const annotation = AnnotationBuilder.create({
      page: page.id,
      annotationType: AnnotationType.LINE,
      lineCoordinates,
      rect,
    });
    this.eventBus.dispatch("annotations.create", {
      page: page.pdfPage,
      viewport,
      annotation,
    });
  }

  handleResizeAnnotation(type, data) {
    switch (type) {
      case "rectangle":
        return this.handleResizeRectangleAnnotation(data);
      default:
        throw new Error(`unrecognised type:${type}`);
    }
  }

  handleResizeRectangleAnnotation(annotationElement) {
    this.handleMoveRectangleAnnotation(annotationElement);
  }

  handleMoveAnnotation(type, data) {
    switch (type) {
      case "rectangle":
        return this.handleMoveRectangleAnnotation(data);
      default:
        throw new Error(`unrecognised type:${type}`);
    }
  }

  handleMoveRectangleAnnotation(annotationElement) {
    const { page, container, data } = annotationElement;
    const annotation = this.pdfDocument.fetchAnnotation(data.id);
    // const {tx, ty, bx, by} = _getCoordinate(container)
    const viewport = annotationElement.viewport.clone({ scale: 1 });
    const rect = this._transformViewportToPDFPoint(viewport, container);

    annotation.set("rect", rect);
    if (!annotation.page) {
      annotation.set("page", page.pageNum);
    }
    this.pdfViewer.popover.update();
    this.eventBus.dispatch("annotations.update", {
      element: annotationElement,
      annotation,
    });
  }

  _caculateRect(page, coord) {
    const viewport = page.viewport.clone({ dontFlip: true });

    return this._pageCoordinateToPDFPoint(
      viewport,
      coord.tx,
      coord.ty,
      coord.bx,
      coord.by
    );
  }

  _getRandomString() {
    return parseInt(
      Date.now() + "" + Math.ceil(Math.random().toFixed(15) * 1e16)
    ).toString(16);
  }

  _convertToPDFPoint(viewport, x, y) {
    return viewport.convertToPdfPoint(x, y);
  }

  _convertToViewportPoint(viewport, x, y) {
    return viewport.convertToViewportPoint(x, y);
  }

  // 转换 window 坐标到PDF 坐标
  _pageCoordinateToPDFPoint(viewport, fx, fy, lx, ly) {
    const [topLeftX, topLeftY] = this._convertToPDFPoint(viewport, fx, fy);
    const [buttomRightX, bottomRightY] = this._convertToPDFPoint(
      viewport,
      lx,
      ly
    );
    const viewBox = viewport.viewBox;
    const rect = [
      topLeftX,
      viewBox[3] + viewBox[1] - bottomRightY,
      buttomRightX,
      viewBox[3] + viewBox[1] - topLeftY,
    ].map(r => +r.toFixed(5));

    return Util.normalizeRect(rect);
  }

  // 转换viewport到 window 坐标
  _viewportToCoordinate(viewport, fx, fy, lx, ly) {
    return [
      ...this._convertToViewportPoint(viewport, fx, fy),
      ...this._convertToViewportPoint(viewport, lx, ly),
    ].map(Math.round);
  }

  // 转换viewport到 PDF 坐标
  _transformViewportToPDFPoint(viewport, element) {
    const view = viewport.viewBox;
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = element;
    const rect = [
      offsetLeft,
      view[3] - offsetTop + view[1],
      offsetLeft + offsetWidth,
      view[3] - offsetTop - offsetHeight + view[1],
    ];
    return Util.normalizeRect(rect);
  }

  _convertRectToAnnotation(annotation) {
    let params, _annotation;
    const extract = index => {
      const page = this.pdfViewer.getPageView(index);
      // await this.pdfViewer._ensurePdfPageLoaded(page)
      return {
        page: page,
        pdfPage: page.pdfPage,
        viewport: page.viewport,
      };
    };
    if (annotation.type && annotation.type.startsWith("pspdfkit")) {
      params = extract(annotation.pageIndex);
      const rect = transformPSPDFKitRect(params.viewport, annotation.bbox);
      annotation.bbox = Util.normalizeRect(rect);

      _annotation = AnnotationBuilder.create(annotation);

      const { quadPoints, lineCoordinates } = _annotation.parameters;

      if (quadPoints) {
        _annotation.set(
          "quadPoints",
          transformPSPDFKitQuadPoints(params.viewport, quadPoints)
        );
      }
      if (lineCoordinates) {
        const _lineCoordinates = transformPSPDFKitLineCoordinates(
          params.viewport,
          lineCoordinates
        );
        _annotation.set("lineCoordinates", _lineCoordinates);
      }
    } else {
      params = extract(annotation.page - 1);
      _annotation = AnnotationBuilder.create(annotation);
    }

    return {
      annotation: _annotation,
      pdfPage: params.pdfPage,
      viewport: params.viewport.clone({ dontFlip: true }),
    };
  }
}

export { AnnotationLayerProxy };
