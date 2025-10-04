/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AnnotationLayer } from "pdfjs-lib";
import { NullL10n } from "./ui_utils";
import { SimpleLinkService } from "./pdf_link_service.js";
// new feature
import { Util } from "pdfjs-lib";
import { transformPSPDFKitRect, transformPSPDFKitQuadPoints, transformPSPDFKitLineCoordinates } from "../feature/ui_utils";
// new feature end

/**
 * @typedef {Object} AnnotationLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderInteractiveForms
 * @property {IPDFLinkService} linkService
 * @property {DownloadManager} downloadManager
 * @property {IL10n} l10n - Localization service.
 */

class AnnotationLayerBuilder {
  /**
   * @param {AnnotationLayerBuilderOptions} options
   */
  constructor({
    pageDiv,
    pdfPage,
    linkService,
    downloadManager,
    annotationStorage = null,
    imageResourcesPath = "",
    renderInteractiveForms = true,
    l10n = NullL10n,
  }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = imageResourcesPath;
    this.renderInteractiveForms = renderInteractiveForms;
    this.l10n = l10n;
    this.annotationStorage = annotationStorage;

    this.div = null;
    this._cancelled = false;
  }

  /**
   * new feature, add annotation layer builder
   * 
   * @param {PageViewport} viewport
   * @param {string} intent (default value is 'display')
   * @returns {Promise<void>} A promise that is resolved when rendering of the
   *   annotations is complete.
   */
  render(viewport, intent = "display") {
    const annotations = this.linkService.pdfDocument.fetchAnnotations(this.pdfPage.pageNumber)
    // return this.pdfPage.getAnnotations({ intent }).then(annotations => {
      if (this._cancelled) {
        return;
      }
      if (annotations.length === 0) {
        return;
      }

      annotations.forEach((annotation) => {
        if (annotation.parameters.type) {
          const rect = transformPSPDFKitRect(viewport, annotation.parameters.rect)
          annotation.set('rect', Util.normalizeRect(rect))

          const quadPoints = annotation.parameters.quadPoints
          const lineCoordinates = annotation.parameters.lineCoordinates
          if (quadPoints) {
            const _quadPoints = transformPSPDFKitQuadPoints(viewport, quadPoints)
            annotation.set('quadPoints', _quadPoints)
          }
          if (lineCoordinates) {
            const _lineCoordinates = transformPSPDFKitLineCoordinates(viewport, lineCoordinates)
            annotation.set('lineCoordinates', _lineCoordinates)
          }
        }
      })

      const formatedAnnotations = []
      annotations.forEach((annotation) => {
        try {
          formatedAnnotations.push(annotation.toJSON())
        } catch (err) {
          console.log('skip')
        }
      })

      let parameters = {
        viewport: viewport.clone({ dontFlip: true, }),
        div: this.div,
        annotations: formatedAnnotations,
        page: this.pdfPage,
        imageResourcesPath: this.imageResourcesPath,
        renderInteractiveForms: this.renderInteractiveForms,
        linkService: this.linkService,
        downloadManager: this.downloadManager,
      };
      let initialized = !!this.div
      if (!this.div) {
        const div = this.pageDiv.querySelector('.annotationLayer');
        if (div) {
          this.div = parameters.div = div;
          initialized = true
        } else {
          this.div = document.createElement('div');
          this.div.className = 'annotationLayer';
          this.pageDiv.appendChild(this.div);
          parameters.div = this.div;
        }
      }

      if (initialized) {
        // If an annotationLayer already exists, refresh its children's
        // transformation matrices.
        AnnotationLayer.update(parameters);
      } else {
        // Create an annotation layer div and render the annotations
        // if there is at least one annotation.
        if (annotations.length === 0) {
          return;
        }
        AnnotationLayer.render(parameters);
        this.l10n.translate(this.div);
      }
    // });
  }

  cancel() {
    this._cancelled = true;
  }

  hide() {
    if (!this.div) {
      return;
    }
    this.div.setAttribute("hidden", "true");
  }
}

/**
 * @implements IPDFAnnotationLayerFactory
 */
class DefaultAnnotationLayerFactory {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @param {AnnotationStorage} [annotationStorage]
   * @param {string} [imageResourcesPath] - Path for image resources, mainly
   *   for annotation icons. Include trailing slash.
   * @param {boolean} renderInteractiveForms
   * @param {IL10n} l10n
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder(
    pageDiv,
    pdfPage,
    annotationStorage = null,
    imageResourcesPath = "",
    renderInteractiveForms = true,
    l10n = NullL10n
  ) {
    return new AnnotationLayerBuilder({
      pageDiv,
      pdfPage,
      imageResourcesPath,
      renderInteractiveForms,
      linkService: new SimpleLinkService(),
      l10n,
      annotationStorage,
    });
  }
}

export { AnnotationLayerBuilder, DefaultAnnotationLayerFactory };
