(function (global) {
    "use strict";

    const RUNTIME_STYLE_ID = "codescroll-runtime-style";

    function isFn(value) {
        return typeof value === "function";
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function animateMaybe(el, keyframes, options) {
        if (!el || !isFn(el.animate)) {
            return wait((options && options.duration) || 0);
        }
        return new Promise((resolve) => {
            const anim = el.animate(keyframes, options);
            anim.addEventListener("finish", () => resolve(), { once: true });
            anim.addEventListener("cancel", () => resolve(), { once: true });
        });
    }

    function clearAnimations(el) {
        if (!el || !isFn(el.getAnimations)) {
            return;
        }
        const animations = el.getAnimations({ subtree: true });
        for (const anim of animations) {
            anim.cancel();
        }
    }

    function ensureRuntimeStyles() {
        if (document.getElementById(RUNTIME_STYLE_ID)) {
            return;
        }
        const style = document.createElement("style");
        style.id = RUNTIME_STYLE_ID;
        style.textContent = `
.codescroll {
    display: inline-block;
    vertical-align: top;
}

.codescroll .codescroll-state {
    position: relative;
    overflow: visible;
}

.codescroll .codescroll-state[hidden] {
    display: none !important;
}

.codescroll .codescroll-state-editing {
    z-index: 100;
}

.codescroll .codescroll-state-parsed {
    z-index: 100;
}

.codescroll .code-head {
    overflow: hidden;
    white-space: pre;
}

.codescroll .code-head.codescroll-execute-disabled {
    cursor: not-allowed;
}

.codescroll .codescroll-reveal {
    position: relative;
    overflow: visible;
}

.codescroll .code-body,
.codescroll .code-foot {
    padding-left: 10px;
    padding-right: 10px;
}

.codescroll .code-body {
    min-height: 30px;
    padding-top: 8px;
    padding-bottom: 8px;
}

.codescroll .scroll-tail {
    margin-left: auto;
    margin-right: auto;
    text-align: center;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
    padding-top: 3px;
    padding-bottom: 2px;
    user-select: none;
    cursor: pointer;
}

.codescroll .codescroll-head-content {
    display: block;
    width: calc(100% - 12px);
    margin-left: 6px;
    margin-right: 6px;
    overflow: hidden;
}

.codescroll .codescroll-head-text {
    display: inline-block;
    white-space: pre;
    will-change: transform, opacity;
}

.codescroll .codescroll-blank {
    white-space: pre;
}

.codescroll .codescroll-control-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.codescroll .codescroll-play-btn {
  left: 40%;
  right: 40%;
  color: #1d7a2f;
  border: 1px solid gray;
  padding: 2px;
  box-shadow: 2px 2px 2px gray;
}

.codescroll .codescroll-play-btn:disabled {
    color: #666;
    box-shadow: none;
    cursor: not-allowed;
    opacity: 0.7;
}

.codescroll .codescroll-parse-btn {
    color: #1d7a2f;
}

.codescroll .codescroll-edit-btn {
    color: #1f4f8a;
    right: 30px;
}

.codescroll .codescroll-close-btn {
    color: #7d1e1e;
}

.codescroll .codescroll-editor-host {
    width: 100%;
    min-height: 66px;
}

.codescroll .codescroll-fallback-editor {
    width: calc(100% - 2px);
    min-height: 66px;
    box-sizing: border-box;
    border: 1px solid #8f7032;
    background: rgba(255, 255, 255, 0.32);
    font-family: Consolas, monospace;
    font-size: 14px;
    resize: vertical;
}

.codescroll .codescroll-error {
    color: #7f1d1d;
    margin: 0;
}

.codescroll .codescroll-parse-error-indicator {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: #b91c1c;
    font-size: 14px;
    font-weight: 700;
    pointer-events: none;
    user-select: none;
}

.codescroll .codescroll-parse-error-indicator-collapsed {
    right: 8px;
}

.codescroll .codescroll-parse-error-indicator-parsed {
    left: 8px;
}
`;
        document.head.appendChild(style);
    }

    function createDiv(className, text) {
        const div = document.createElement("div");
        if (className) {
            div.className = className;
        }
        if (typeof text !== "undefined") {
            div.textContent = text;
        }
        return div;
    }

    function normalizeDefinition(definition) {
        if (!definition || typeof definition !== "object") {
            throw new Error("CodeScroll definition must be an object.");
        }
        const out = {
            header: definition.header,
            body: definition.body,
            footer: definition.footer,
            trigger: definition.trigger
        };
        for (const key of ["header", "body", "footer", "trigger"]) {
            if (typeof out[key] !== "string") {
                throw new Error(`CodeScroll definition.${key} must be a string.`);
            }
        }
        return out;
    }

    class CodeScroll {
        constructor(container, definition, options) {
            if (!container) {
                throw new Error("CodeScroll requires a parent element.");
            }
            ensureRuntimeStyles();
            this.container = container;
            this.definition = normalizeDefinition(definition);
            this.options = options || {};
            this.model = {
                header: this.definition.header,
                body: this.definition.body,
                footer: this.definition.footer,
                trigger: this.definition.trigger,
                editingEnabled: this.options.editingEnabled !== false,
                currentState: "collapsed",
                parsed: null,
                parseSuccess: null,
                lastWholeCode: null
            };
            this._transitionChain = Promise.resolve();
            this._buildDom();
            this._syncEditingAvailability();
            this._initEditor();
            this.setState(this.options.initialState || "collapsed", { silent: true });

            // Parse initial code when creating
            const parsed = this._parseCurrentCode();
            this._renderParsedHtml(parsed);
        }

        _buildDom() {
            // TODO: use html?
            const root = this.container;
            root.classList.add("codescroll");
            root.innerHTML = "";
            if (!root.style.position) {
                root.style.position = "relative";
            }

            this.stateElems = {
                collapsed: createDiv("codescroll-state codescroll-state-collapsed"),
                editing: createDiv("codescroll-state codescroll-state-editing"),
                parsed: createDiv("codescroll-state codescroll-state-parsed")
            };

            // collapsed
            const cHead = createDiv("code-head");
            this.collapsedHead = cHead;
            const cHeadContent = createDiv("codescroll-head-content");
            this.collapsedTriggerText = createDiv("codescroll-head-text", this.model.trigger);
            cHeadContent.appendChild(this.collapsedTriggerText);
            cHead.appendChild(cHeadContent);
            this.collapsedParseErrorIndicator = createDiv(
                "codescroll-parse-error-indicator codescroll-parse-error-indicator-collapsed",
                "✖"
            );
            this.collapsedParseErrorIndicator.title = "Code has parse errors";
            this.collapsedParseErrorIndicator.hidden = true;
            cHead.appendChild(this.collapsedParseErrorIndicator);
            this.collapsedTail = createDiv("scroll-tail");
            this.collapsedTail.textContent = "▼";
            this.stateElems.collapsed.appendChild(cHead);
            this.collapsedTailReveal = createDiv("codescroll-reveal");
            this.collapsedTailReveal.appendChild(this.collapsedTail);
            this.stateElems.collapsed.appendChild(this.collapsedTailReveal);

            // editing
            this.editingHead = createDiv("code-head");
            this.editingHead.style.position = "relative";
            const eHeadContent = createDiv("codescroll-head-content");
            this.editingHeadText = createDiv("codescroll-head-text", this.model.header);
            eHeadContent.appendChild(this.editingHeadText);
            this.editingHead.appendChild(eHeadContent);
            this.editingCloseButton = document.createElement("button");
            this.editingCloseButton.className = "codescroll-control-btn codescroll-close-btn";
            this.editingCloseButton.type = "button";
            this.editingCloseButton.title = "Close and parse";
            this.editingCloseButton.textContent = "✕";
            this.editingHead.appendChild(this.editingCloseButton);

            this.editingBody = createDiv("code-body");
            this.editorHost = createDiv("codescroll-editor-host");
            this.editingBody.appendChild(this.editorHost);

            this.editingFoot = createDiv("code-foot");
            this.editingFooterText = createDiv("", this.model.footer);
            this.editingFoot.style.position = "relative";
            this.parseButton = document.createElement("button");
            this.parseButton.className = "codescroll-control-btn codescroll-parse-btn";
            this.parseButton.type = "button";
            this.parseButton.title = "Parse code";
            this.parseButton.textContent = "✓";
            this.editingFoot.appendChild(this.editingFooterText);
            this.editingFoot.appendChild(this.parseButton);

            this.stateElems.editing.appendChild(this.editingHead);
            this.editingReveal = createDiv("codescroll-reveal");
            this.editingReveal.appendChild(this.editingBody);
            this.editingReveal.appendChild(this.editingFoot);
            this.stateElems.editing.appendChild(this.editingReveal);

            // parsed
            this.parsedHead = createDiv("code-head");
            this.parsedHead.style.position = "relative";
            this.parsedHeadBlank = createDiv("codescroll-head-content codescroll-blank", "\u00A0");

            this.closeButton = document.createElement("button");
            this.closeButton.className = "codescroll-control-btn codescroll-close-btn";
            this.closeButton.type = "button";
            this.closeButton.title = "Collapse scroll";
            this.closeButton.textContent = "✕";
            this.parsedHead.appendChild(this.parsedHeadBlank);
            this.parsedHead.appendChild(this.closeButton);


            this.executeButton = document.createElement("button");
            this.executeButton.className = "codescroll-control-btn codescroll-play-btn"
            this.executeButton.type = "button";
            this.executeButton.title = "Execute Code";
            this.executeButton.textContent = "▶";
            this.parsedHead.appendChild(this.executeButton);
            this.parsedParseErrorIndicator = createDiv(
                "codescroll-parse-error-indicator codescroll-parse-error-indicator-parsed",
                "✖"
            );
            this.parsedParseErrorIndicator.title = "Code has parse errors";
            this.parsedParseErrorIndicator.hidden = true;
            this.parsedHead.appendChild(this.parsedParseErrorIndicator);

            this.editButton = document.createElement("button");
            this.editButton.className = "codescroll-control-btn codescroll-edit-btn";
            this.editButton.type = "button";
            this.editButton.title = "Back to editing";
            this.editButton.textContent = "↩";
            this.parsedHead.appendChild(this.editButton);


            this.parsedBody = createDiv("code-body");
            this.parsedFoot = createDiv("code-foot");
            this.parsedFoot.innerHTML = "&nbsp;";
            this.stateElems.parsed.appendChild(this.parsedHead);
            this.parsedReveal = createDiv("codescroll-reveal");
            this.parsedReveal.appendChild(this.parsedBody);
            this.parsedReveal.appendChild(this.parsedFoot);
            this.stateElems.parsed.appendChild(this.parsedReveal);

            // TODO:prepend special "executing-call" element (for parsing/executing state of actual trigger with params)
            const tv = createDiv('trigger-viz');
            root.appendChild(this.stateElems.collapsed);
            root.appendChild(this.stateElems.editing);
            root.appendChild(this.stateElems.parsed);
            root.appendChild(tv);

            // Interactions
            cHead.addEventListener("click", (event) => {
                if (!this._canExecute()) {
                    event.preventDefault();
                    return;
                }
                this.execute(event);
            });
            this.collapsedTail.addEventListener("click", (event) => {
                event.stopPropagation();
                if (!this._isEditingEnabled()) {
                    event.preventDefault();
                    return;
                }
                this.transitionTo("editing");
            });
            this.parseButton.addEventListener("click", (event) => {
                event.stopPropagation();
                this.transitionTo("parsed");
            });
            this.editingCloseButton.addEventListener("click", (event) => {
                event.stopPropagation();
                this._closeFromEditing();
            });
            this.closeButton.addEventListener("click", (event) => {
                event.stopPropagation();
                this.transitionTo("collapsed");
            });
            this.editButton.addEventListener("click", (event) => {
                event.stopPropagation();
                if (!this._isEditingEnabled()) {
                    event.preventDefault();
                    return;
                }
                this.transitionTo("editing");
            });
            this.executeButton.addEventListener("click", (event) =>{
                event.stopPropagation();
                if (!this._canExecute()) {
                    event.preventDefault();
                    return;
                }
                this.execute(event);
            })
        }

        _closeFromEditing() {
            this.transitionTo("parsed").then(() => {
                if (this.model.parseSuccess === true) {
                    this.transitionTo("collapsed");
                }
            });
        }

        _initEditor() {
            const bodyValue = this.model.body;
            if (global.ace && isFn(global.ace.edit)) {
                this.aceEditor = global.ace.edit(this.editorHost);
                this.aceEditor.session.setMode("ace/mode/javascript");
                this.aceEditor.setOption("showPrintMargin", false);
                this.aceEditor.setOption("highlightActiveLine", true);
                this.aceEditor.setOption("fontFamily", "Consolas, monospace");
                this.aceEditor.setOption("fontSize", "14px");
                this.aceEditor.setOption("minLines", 3);
                this.aceEditor.setOption("maxLines", 50);
                this.aceEditor.setValue(bodyValue, -1);
                return;
            }
            this.fallbackEditor = document.createElement("textarea");
            this.fallbackEditor.className = "codescroll-fallback-editor";
            this.fallbackEditor.value = bodyValue;
            this.editorHost.appendChild(this.fallbackEditor);
        }

        _getBodyText() {
            if (this.aceEditor) {
                return this.aceEditor.getValue();
            }
            return this.fallbackEditor ? this.fallbackEditor.value : "";
        }

        _setBodyText(newBody) {
            if (this.aceEditor) {
                this.aceEditor.setValue(newBody, -1);
                return;
            }
            if (this.fallbackEditor) {
                this.fallbackEditor.value = newBody;
            }
        }

        _refreshBodyFromEditor() {
            this.model.body = this._getBodyText();
            return this.model.body;
        }

        _estimateStateWidth(stateName) {
            const charsToPx = 8.5;
            const collapsedBase = 42;
            const expandedBase = 84;
            if (stateName === "collapsed") {
                return Math.max(130, Math.ceil(this.model.trigger.length * charsToPx + collapsedBase));
            }
            const bodyText = this._getBodyText();
            const lines = [this.model.header, ...bodyText.split("\n"), this.model.footer];
            const longest = lines.reduce((acc, line) => Math.max(acc, line.length), 0);
            return Math.max(290, Math.ceil(longest * charsToPx + expandedBase));
        }

        _setWidthForState(stateName, animateMs) {
            const width = this._estimateStateWidth(stateName);
            if (animateMs && animateMs > 0) {
                this.container.style.transition = `width ${animateMs}ms ease`;
                this.container.style.width = `${width}px`;
                setTimeout(() => {
                    this.container.style.transition = "";
                }, animateMs + 20);
                return;
            }
            this.container.style.width = `${width}px`;
        }

        _showOnly(stateName) {
            for (const el of Object.values(this.stateElems)) {
                clearAnimations(el);
            }
            this._setRevealClipping(false);
            for (const [name, el] of Object.entries(this.stateElems)) {
                if (name === stateName) {
                    el.hidden = false;
                    el.style.position = "relative";
                    el.style.left = "";
                    el.style.top = "";
                    el.style.width = "";
                    el.style.zIndex = "";
                    el.style.transform = "";
                    el.style.opacity = "";
                } else {
                    el.hidden = true;
                }
            }
        }

        _overlayState(name, zIndex) {
            const el = this.stateElems[name];
            clearAnimations(el);
            el.hidden = false;
            el.style.position = "absolute";
            el.style.left = "0";
            el.style.top = "0";
            el.style.width = "100%";
            el.style.zIndex = String(zIndex);
            return el;
        }

        _setRevealClipping(enabled) {
            const mode = enabled ? "hidden" : "visible";
            if (this.collapsedTailReveal) {
                this.collapsedTailReveal.style.overflow = mode;
            }
            if (this.editingReveal) {
                this.editingReveal.style.overflow = mode;
            }
            if (this.parsedReveal) {
                this.parsedReveal.style.overflow = mode;
            }
        }

        _cleanupOverlayStyles(name) {
            const el = this.stateElems[name];
            el.style.position = "";
            el.style.left = "";
            el.style.top = "";
            el.style.width = "";
            el.style.zIndex = "";
            el.style.transform = "";
            el.style.opacity = "";
        }

        _finalizeTransition(from, to, extraCallback) {
            this.model.currentState = to;
            this._showOnly(to);
            this._setWidthForState(to);
            if (to === "editing" && this.aceEditor) {
                this.aceEditor.resize();
            }
            if (isFn(extraCallback)) {
                extraCallback(this);
            }
            this._runTransitionCallbacks(from, to);

            // get rid of any stray code tooltips (TODO: more targeted and in a more appropriate place?)
            document.querySelector('.code-tooltip')?.remove()
        }

        _runTransitionCallbacks(from, to) {
            const key = `${from}->${to}`;
            const tCallbacks = this.options.transitionCallbacks || {};
            if (isFn(tCallbacks[key])) {
                tCallbacks[key](this);
            }
            if (isFn(this.options.onTransitionComplete)) {
                this.options.onTransitionComplete({ from, to, scroll: this });
            }
        }

        _parseCurrentCode() {
            const body = this._refreshBodyFromEditor();
            const whole = `${this.model.header}\n${body}\n${this.model.footer}`;
            this.model.lastWholeCode = whole;

            this.parsedFoot.innerHTML = "&nbsp;"; // reset any "replay" from previous parse

            if (!isFn(global.parseIntoHTML)) {
                // TODO: skip isFn checks in general? if for some reason these functions don't exist, there is no point in trying to make anything work
                this.model.parsed = {
                    ast: null,
                    html: `<pre class="codescroll-error">${escapeHtml("parseIntoHTML is not available.")}</pre>`,
                    parse_success: false,
                    error: { message: "parseIntoHTML is not available." }
                };
                this.model.parseSuccess = false;
                this._syncExecutionAvailability();
                return this.model.parsed;
            }
            try {
                const parsed = global.parseIntoHTML(whole);
                this.model.parsed = parsed;
                this.model.parseSuccess = !!(parsed && parsed.parse_success);
                this._syncExecutionAvailability();
                return parsed;
            } catch (error) {
                this.model.parsed = {
                    ast: null,
                    html: `<pre class="codescroll-error">${escapeHtml(error && error.message ? error.message : "Parse failed.")}</pre>`,
                    parse_success: false,
                    error: { message: error && error.message ? error.message : "Parse failed." }
                };
                this.model.parseSuccess = false;
                this._syncExecutionAvailability();
                return this.model.parsed;
            }
        }

        _canExecute() {
            return this.model.parseSuccess === true;
        }

        _isEditingEnabled() {
            return this.model.editingEnabled !== false;
        }

        _syncEditingAvailability() {
            const editingEnabled = this._isEditingEnabled();
            if (this.collapsedTail) {
                this.collapsedTail.textContent = editingEnabled ? "▼" : "";
                this.collapsedTail.style.cursor = editingEnabled ? "pointer" : "default";
                this.collapsedTail.title = editingEnabled ? "Edit code" : "Editing is disabled";
            }
            if (this.editButton) {
                this.editButton.disabled = !editingEnabled;
                this.editButton.title = editingEnabled ? "Back to editing" : "Editing is disabled";
            }
        }

        _syncExecutionAvailability() {
            const canExecute = this._canExecute();
            if (this.collapsedHead) {
                this.collapsedHead.classList.toggle("codescroll-execute-disabled", !canExecute);
                this.collapsedHead.style.cursor = canExecute ? "pointer" : "not-allowed";
            }
            if (this.executeButton) {
                this.executeButton.disabled = !canExecute;
                this.executeButton.title = canExecute
                    ? "Execute Code"
                    : "Cannot execute: current code failed to parse";
            }
            if (this.collapsedParseErrorIndicator) {
                this.collapsedParseErrorIndicator.hidden = canExecute;
            }
            if (this.parsedParseErrorIndicator) {
                this.parsedParseErrorIndicator.hidden = canExecute;
            }
        }

        _renderParsedHtml(parsed) {
            if (parsed && typeof parsed.html === "string" && parsed.html.length > 0) {
                this.parsedBody.innerHTML = parsed.html;
            } else {
                const msg = parsed && parsed.error && parsed.error.message
                    ? parsed.error.message
                    : "No parse output.";
                this.parsedBody.innerHTML = `<pre class="codescroll-error">${escapeHtml(msg)}</pre>`;
            }
            this.parsedCodeElem = this.parsedBody.firstElementChild || this.parsedBody;
        }

        setState(stateName, opts) {
            const options = opts || {};
            if (!this.stateElems[stateName]) {
                throw new Error(`Unknown CodeScroll state: ${stateName}`);
            }
            const from = this.model.currentState;
            this.model.currentState = stateName;
            this._showOnly(stateName);
            this._setWidthForState(stateName);
            if (stateName === "editing" && this.aceEditor) {
                this.aceEditor.resize();
            }
            if (!options.silent && from !== stateName) {
                this._runTransitionCallbacks(from, stateName);
            }
            return this;
        }

        transitionTo(targetState, opts) {
            const options = opts || {};
            if (!this.stateElems[targetState]) {
                return Promise.reject(new Error(`Unknown CodeScroll state: ${targetState}`));
            }
            this._transitionChain = this._transitionChain.then(() => this._runTransition(targetState, options));
            return this._transitionChain;
        }

        async _runTransition(targetState, options) {
            const from = this.model.currentState;
            if (from === targetState) {
                return this;
            }
            if (targetState === "editing" && !this._isEditingEnabled()) {
                return this;
            }
            if (from === "editing" && targetState === "parsed") {
                await this._transitionEditingToParsed(options);
                return this;
            }
            if (from === "parsed" && targetState === "collapsed") {
                await this._transitionParsedToCollapsed(options);
                return this;
            }
            if (from === "parsed" && targetState === "editing") {
                await this._transitionParsedToEditing(options);
                return this;
            }
            if (from === "collapsed" && targetState === "editing") {
                await this._transitionCollapsedToEditing(options);
                return this;
            }
            this._finalizeTransition(from, targetState, options.onComplete);
            return this;
        }

        async _transitionEditingToParsed(options) {
            const from = "editing";
            const to = "parsed";

            const parsed = this._parseCurrentCode();
            this._renderParsedHtml(parsed);
            this._setWidthForState("parsed");

            const editingEl = this.stateElems.editing;
            const parsedEl = this.stateElems.parsed;
            this._overlayState("editing", 2);
            this._overlayState("parsed", 2);
            parsedEl.style.transformOrigin = "center center";
            editingEl.style.transformOrigin = "center center";
            parsedEl.style.transform = "rotateX(-90deg)";
            parsedEl.style.opacity = "0";

            await animateMaybe(editingEl, [
                { transform: "rotateX(0deg)", opacity: 1 },
                { transform: "rotateX(90deg)", opacity: 0 }
            ], { duration: 220, easing: "ease-in", fill: "forwards" });

            editingEl.hidden = true;
            parsedEl.style.opacity = "1";
            await animateMaybe(parsedEl, [
                { transform: "rotateX(-90deg)", opacity: 0 },
                { transform: "rotateX(0deg)", opacity: 1 }
            ], { duration: 220, easing: "ease-out", fill: "forwards" });

            this._cleanupOverlayStyles("editing");
            this._cleanupOverlayStyles("parsed");
            this._finalizeTransition(from, to, options.onComplete);

            if (isFn(global.animateParse) && this.parsedCodeElem) {
                try {
                    await global.animateParse(this.parsedCodeElem);
                } catch (error) {
                    // animation failures are non-fatal
                }
            }
        }

        async _transitionParsedToCollapsed(options) {
            const from = "parsed";
            const to = "collapsed";
            this._setWidthForState("parsed");
            this._setRevealClipping(true);

            const parsedEl = this.stateElems.parsed;
            this._overlayState("parsed", 3);
            this._overlayState("collapsed", 4);
            this.collapsedTriggerText.style.transform = "translateY(-90%)";
            this.collapsedTriggerText.style.opacity = "0";
            this.collapsedTail.style.transform = "translateY(-120%)";
            this.collapsedTail.style.opacity = "0";

            const parsedBodyFoot = [this.parsedBody, this.parsedFoot];
            const hideClose = animateMaybe(this.closeButton, [
                { opacity: 1 },
                { opacity: 0 }
            ], { duration: 80, easing: "linear", fill: "forwards" });

            const slideBodyFoot = Promise.all(parsedBodyFoot.map((el) => animateMaybe(el, [
                { transform: "translateY(0%)", opacity: 1 },
                { transform: "translateY(-105%)", opacity: 0 }
            ], { duration: 230, easing: "ease-in", fill: "forwards" })));

            await Promise.all([hideClose, slideBodyFoot]);

            await Promise.all([
                animateMaybe(this.collapsedTail, [
                    { transform: "translateY(-120%)", opacity: 0 },
                    { transform: "translateY(0%)", opacity: 1 }
                ], { duration: 170, easing: "ease-out", fill: "forwards" }),
                animateMaybe(this.collapsedTriggerText, [
                    { transform: "translateY(-90%)", opacity: 0 },
                    { transform: "translateY(0%)", opacity: 1 }
                ], { duration: 180, easing: "ease-out", fill: "forwards" })
            ]);

            this._setWidthForState("collapsed", 140);
            await wait(150);

            this.closeButton.style.opacity = "";
            this.parsedBody.style.transform = "";
            this.parsedBody.style.opacity = "";
            this.parsedFoot.style.transform = "";
            this.parsedFoot.style.opacity = "";
            this.collapsedTriggerText.style.transform = "";
            this.collapsedTriggerText.style.opacity = "";
            this.collapsedTail.style.transform = "";
            this.collapsedTail.style.opacity = "";

            this._cleanupOverlayStyles("collapsed");
            this._cleanupOverlayStyles("parsed");
            this._finalizeTransition(from, to, options.onComplete);
        }

        async _transitionParsedToEditing(options) {
            const from = "parsed";
            const to = "editing";
            this._setWidthForState("editing");

            const parsedEl = this.stateElems.parsed;
            const editingEl = this.stateElems.editing;
            this._overlayState("parsed", 2);
            this._overlayState("editing", 2);
            editingEl.style.transformOrigin = "center center";
            parsedEl.style.transformOrigin = "center center";
            editingEl.style.transform = "rotateX(-90deg)";
            editingEl.style.opacity = "0";

            await animateMaybe(parsedEl, [
                { transform: "rotateX(0deg)", opacity: 1 },
                { transform: "rotateX(90deg)", opacity: 0 }
            ], { duration: 220, easing: "ease-in", fill: "forwards" });

            parsedEl.hidden = true;
            editingEl.style.opacity = "1";
            await animateMaybe(editingEl, [
                { transform: "rotateX(-90deg)", opacity: 0 },
                { transform: "rotateX(0deg)", opacity: 1 }
            ], { duration: 220, easing: "ease-out", fill: "forwards" });

            this._cleanupOverlayStyles("parsed");
            this._cleanupOverlayStyles("editing");
            this._finalizeTransition(from, to, options.onComplete);
        }

        async _transitionCollapsedToEditing(options) {
            const from = "collapsed";
            const to = "editing";
            this._setWidthForState("editing");
            this._setRevealClipping(true);

            this._overlayState("collapsed", 4);
            this._overlayState("editing", 3);

            this.editingHeadText.style.transform = "translateY(90%)";
            this.editingHeadText.style.opacity = "0";
            this.editingBody.style.transform = "translateY(-105%)";
            this.editingFoot.style.transform = "translateY(-105%)";

            await Promise.all([
                animateMaybe(this.collapsedTriggerText, [
                    { transform: "translateY(0%)", opacity: 1 },
                    { transform: "translateY(100%)", opacity: 0 }
                ], { duration: 180, easing: "ease-in", fill: "forwards" }),
                animateMaybe(this.collapsedTail, [
                    { transform: "translateY(0%)", opacity: 1 },
                    { transform: "translateY(-120%)", opacity: 0 }
                ], { duration: 170, easing: "ease-in", fill: "forwards" }),
                animateMaybe(this.editingBody, [
                    { transform: "translateY(-105%)", opacity: 1 },
                    { transform: "translateY(0%)", opacity: 1 }
                ], { duration: 250, easing: "ease-out", fill: "forwards" }),
                animateMaybe(this.editingFoot, [
                    { transform: "translateY(-105%)", opacity: 1 },
                    { transform: "translateY(0%)", opacity: 1 }
                ], { duration: 250, easing: "ease-out", fill: "forwards" })
            ]);

            await animateMaybe(this.editingHeadText, [
                { transform: "translateY(90%)", opacity: 0 },
                { transform: "translateY(0%)", opacity: 1 }
            ], { duration: 170, easing: "ease-out", fill: "forwards" });

            this.editingHeadText.style.transform = "";
            this.editingHeadText.style.opacity = "";
            this.editingBody.style.transform = "";
            this.editingFoot.style.transform = "";
            this.collapsedTriggerText.style.transform = "";
            this.collapsedTriggerText.style.opacity = "";
            this.collapsedTail.style.transform = "";
            this.collapsedTail.style.opacity = "";

            this._cleanupOverlayStyles("editing");
            this._cleanupOverlayStyles("collapsed");
            this._finalizeTransition(from, to, options.onComplete);
        }

        execute(event) {
            if (!this._canExecute()) {
                return false;
            }
            if (isFn(this.options.onExecute)) {
                this.options.onExecute({
                    event: event || null,
                    trigger: this.model.trigger,
                    parsed: this.model.parsed,
                    parseSuccess: this.model.parseSuccess,
                    scroll: this
                });
            }
            return true;
        }

        getWholeCode() {
            return `${this.model.header}\n${this._refreshBodyFromEditor()}\n${this.model.footer}`;
        }

        getParsed() {
            return this.model.parsed;
        }

        getState() {
            return this.model.currentState;
        }

        getSnapshot() {
            return {
                header: this.model.header,
                body: this._refreshBodyFromEditor(),
                footer: this.model.footer,
                trigger: this.model.trigger,
                editingEnabled: this.model.editingEnabled,
                currentState: this.model.currentState,
                parsed: this.model.parsed,
                parseSuccess: this.model.parseSuccess,
                wholeCode: this.model.lastWholeCode || this.getWholeCode()
            };
        }

        setEditingEnabled(enabled) {
            this.model.editingEnabled = enabled !== false;
            this._syncEditingAvailability();
            return this;
        }

        isEditingEnabled() {
            return this._isEditingEnabled();
        }

        setBody(bodyText) {
            this.model.body = String(bodyText);
            this._setBodyText(this.model.body);
            return this;
        }
    }

    function createCodeScroll(containerOrSelector, definition, options) {
        const container = typeof containerOrSelector === "string"
            ? document.querySelector(containerOrSelector)
            : containerOrSelector;
        if (!container) {
            throw new Error("createCodeScroll could not find container element.");
        }
        return new CodeScroll(container, definition, options);
    }

    global.CodeScroll = CodeScroll;
    global.createCodeScroll = createCodeScroll;
}(window));
