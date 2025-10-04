/* Copyright 2017 Mozilla Foundation
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

import { GrabToPan } from "./grab_to_pan.js";
// new feature
import { RectangleAnnotation } from "../annotations/rectangle.js";
import { LineAnnotation } from "../annotations/line.js";
// new feature end

const CursorTool = {
  SELECT: 0, // The default value.
  HAND: 1,
  ZOOM: 2,

  // new feature
  REMARK: 3,
  LINE: 4,
  // new feature end
};

/**
 * @typedef {Object} PDFCursorToolsOptions
 * @property {HTMLDivElement} container - The document container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} [cursorToolOnLoad] - The cursor tool that will be enabled
 *   on load; the constants from {CursorTool} should be used. The default value
 *   is `CursorTool.SELECT`.
 */

class PDFCursorTools {
  /**
   * @param {PDFCursorToolsOptions} options
   */
  constructor({ container, eventBus, cursorToolOnLoad = CursorTool.SELECT }) {
    this.container = container;
    this.eventBus = eventBus;

    // this.active = CursorTool.SELECT;
    this.active = -1; // new feature
    this.activeBeforePresentationMode = null;

    this.handTool = new GrabToPan({
      element: this.container,
    });

    // new feature
    this.remarkTool = new RectangleAnnotation({
      element: this.container,
      eventBus: eventBus,
    });
    this.lineTool = new LineAnnotation({
      element: this.container,
      eventBus: eventBus,
    });
    // new feature end

    this._addEventListeners();

    // Defer the initial `switchTool` call, to give other viewer components
    // time to initialize *and* register 'cursortoolchanged' event listeners.
    Promise.resolve().then(() => {
      this.switchTool(cursorToolOnLoad);
    });
  }

  /**
   * @type {number} One of the values in {CursorTool}.
   */
  get activeTool() {
    return this.active;
  }
  // new feature
  reset() {
    this.switchTool(CursorTool.SELECT);
  }
  // new feature end

  /**
   * NOTE: This method is ignored while Presentation Mode is active.
   * @param {number} tool - The cursor mode that should be switched to,
   *                        must be one of the values in {CursorTool}.
   */
  switchTool(tool) {
    if (this.activeBeforePresentationMode !== null) {
      return; // Cursor tools cannot be used in Presentation Mode.
    }
    if (tool === this.active) {
      return; // The requested tool is already active.
    }

    const disableActiveTool = () => {
      switch (this.active) {
        case CursorTool.SELECT:
          this.eventBus.dispatch("disableselectionpopover"); // new feature
          break;
        case CursorTool.HAND:
          this.handTool.deactivate();
          break;
        // new feature start
        case CursorTool.REMARK:
          this.remarkTool.deactivate();
          break;
        case CursorTool.LINE:
          this.lineTool.deactivate();
          break;
        // new feature end
        case CursorTool.ZOOM:
        /* falls through */
      }
    };

    // Enable the new cursor tool.
    switch (tool) {
      case CursorTool.SELECT:
        disableActiveTool();
        this.eventBus.dispatch("enableselectionpopover"); // new feature
        break;
      case CursorTool.HAND:
        disableActiveTool();
        this.handTool.activate();
        break;

      // new feature
      case CursorTool.REMARK:
        disableActiveTool();
        this.remarkTool.activate();
        break;
      case CursorTool.LINE:
        disableActiveTool();
        this.lineTool.activate();
        break;
      // new feature end
      case CursorTool.ZOOM:
      /* falls through */
      default:
        console.error(`switchTool: "${tool}" is an unsupported value.`);
        return;
    }
    // Update the active tool *after* it has been validated above,
    // in order to prevent setting it to an invalid state.
    this.active = tool;

    this._dispatchEvent();
  }

  /**
   * @private
   */
  _dispatchEvent() {
    this.eventBus.dispatch("cursortoolchanged", {
      source: this,
      tool: this.active,
    });
  }

  /**
   * @private
   */
  _addEventListeners() {
    this.eventBus._on("switchcursortool", evt => {
      this.switchTool(evt.tool);
    });

    this.eventBus._on("presentationmodechanged", evt => {
      if (evt.switchInProgress) {
        return;
      }
      let previouslyActive;

      if (evt.active) {
        previouslyActive = this.active;

        this.switchTool(CursorTool.SELECT);
        this.activeBeforePresentationMode = previouslyActive;
      } else {
        previouslyActive = this.activeBeforePresentationMode;

        this.activeBeforePresentationMode = null;
        this.switchTool(previouslyActive);
      }
    });
  }
}

export { CursorTool, PDFCursorTools };
