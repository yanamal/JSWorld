(function () {
    'use strict';

    const spellUi = window.elementalSpellUi;
    if (!spellUi) {
        console.error('[tutorial] elementalSpellUi is not available');
        return;
    }

    const mainSpeechEl = document.getElementById('wizardMainSpeech');
    const sideSpeechEl = document.getElementById('wizardSideSpeech');
    const testButtonEl = document.getElementById('testItButton');
    const finaleEl = document.getElementById('tutorialFinale');
    const finaleBodyEl = document.getElementById('tutorialFinaleBody');
    const debuggyAssistant = typeof window.createDebuggyAssistant === 'function'
        ? window.createDebuggyAssistant()
        : null;

    const STEP_TEXT = {
        step0: `
You can do almost anything with programming! But let's start with some simple elemental magic. You'll control this small wizard living in a 2D world.

**Click anywhere on the screen to move around!**
`,
        step1: `
I've given you your first **function**: think of it as a spell you can **call** (cast) whenever you need it. The \`splash()\` function creates a splash of water around you. Click on the function to call it!

**Put out all 3 fires by calling \`splash()\` near each one!**
`,
        step2: `
That's great, but now there are lots of puddles. I'll give you another function: \`whoosh\` creates wind that will brush away the water. This one takes in **parameters**: \`whoosh(x, y)\` will make a wind tunnel between you and the position \`x, y\`. You can control it by clicking on the scroll, then clicking wherever you want \`x, y\` to be!

**Use the \`whoosh\` function to clean up at least half the water.**
`,
        step3: `
Wouldn't it be convenient if we could make up a new spell that would put out the fire and clean it up all at once?

Well, of course we can! Through the magic of programming, we can create new functions that do as many things as we like. Actually, I started writing this spell but then got distracted and it doesn't quite work right. 

**See if you can fix the \`put_out_fire\` spell!** Edit it and click \`✓\`. When you think it's ready, click "**Play with fire!**" and I'll create some fire to test it with.
`
    };

    const SIDE_TEXT = {
        playWithFire: "When you think you've got `put_out_fire` working right, click \"**Play with fire!**\" — I'll spawn some fire to put out.",
        parseOrExecutionError: 'Hmm, something went wrong there.',
        parseSuccess: "The function parsed! That means the code didn't have any errors in it. You can use the \" ▶ \" button to call the function. " +
            "In this view, it will show you what happens step-by-step!",
        replay: 'In this view, after you call the function, you can examine what happened using the instant replay. \n (you can do this with `whoosh` and `splash` too, now!)',
        firesLeft: 'Hmm, looks like you missed the fire...',
        waterLeft: 'Not bad, but I still see some water left over!',
    };

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function renderMarkdown(el, markdownText) {
        if (!el) return;
        const text = String(markdownText || '').trim();
        if (window.marked && typeof window.marked.parse === 'function') {
            el.innerHTML = window.marked.parse(text);
        } else {
            el.textContent = text;
        }
        el.hidden = false;
    }

    class TutorialSequence {
        constructor() {
            this.currentStepIndex = -1;
            this.isAdvancing = false;
            this.highlights = new Map();
            this.stepState = {
                waterPixelsAtStep2Start: 0,
                firstParseSuccessSeen: false,
                firstErrorSeen: false,
                firstReplaySeen: false,
                testRunActive: false,
                waitingForTestCast: false
            };

            this.steps = [
                {
                    id: 'move-around',
                    onEnter: async () => {
                        this.hideAllScrolls();
                        this.hideTestButton();
                        this.hideSideSpeech();
                        this.showMainSpeech(STEP_TEXT.step0);
                    },
                    onEvent: ({ type }) => {
                        if (type === 'player-move-start') {
                            this.completeCurrentStep();
                        }
                    }
                },
                {
                    id: 'first-spell',
                    onEnter: async () => {
                        this.hideSideSpeech();
                        this.hideTestButton();
                        if (typeof window.clearFires === 'function') {
                            window.clearFires();
                        }
                        this.spawnFirstStepFires();
                        spellUi.revealScroll('splash');
                        this.showMainSpeech(STEP_TEXT.step1);
                        this.highlightElement(
                            'step1-splash-head',
                            this.getSpellControl('splash', '.codescroll-state-collapsed .code-head'),
                            ['click']
                        );
                    },
                    onEvent: ({ type }) => {
                        if (type === 'spell-cast-settled' && window.fires.length === 0) {
                            this.completeCurrentStep();
                        }
                    }
                },
                {
                    id: 'wind-cleanup',
                    onEnter: async () => {
                        this.hideSideSpeech();
                        this.hideTestButton();
                        spellUi.revealScroll('whoosh');
                        this.stepState.waterPixelsAtStep2Start = this.countWaterPixels();
                        this.showMainSpeech(STEP_TEXT.step2);
                        this.highlightElement(
                            'step2-whoosh-head',
                            this.getSpellControl('whoosh', '.codescroll-state-collapsed .code-head'),
                            ['click']
                        );
                    },
                    onEvent: ({ type }) => {
                        if (type !== 'spell-cast-settled') return;
                        const threshold = Math.floor(this.stepState.waterPixelsAtStep2Start / 2);
                        if (this.countWaterPixels() <= threshold) {
                            this.completeCurrentStep();
                        }
                    }
                },
                {
                    id: 'put-out-fire',
                    onEnter: async () => {
                        this.resetStep3OneTimeFlags();
                        if (typeof window.clearWater === 'function') {
                            window.clearWater();
                        }
                        if (typeof window.clearFires === 'function') {
                            window.clearFires();
                        }

                        spellUi.revealScroll('put_out_fire');
                        this.showMainSpeech(STEP_TEXT.step3);
                        this.showTestButton();
                        if (debuggyAssistant) {
                            debuggyAssistant.setVisible(true);
                            debuggyAssistant.setStatus(
                                '🐥 I am your debugging ducky. I will help you build a deduction tree when tests fail.',
                                false
                            );
                        }

                        const putOutScroll = spellUi.getScroll('put_out_fire');
                        if (putOutScroll) {
                            putOutScroll.setState('collapsed');
                            await wait(260);
                            await putOutScroll.transitionTo('editing');
                        }

                        // TODO: maybe use proper getScroll stuff
                        splashScroll.setEditingEnabled(true)
                        whooshScroll.setEditingEnabled(true)

                        this.showSideSpeech(SIDE_TEXT.playWithFire);

                        this.highlightElement(
                            'step3-parse-btn',
                            this.getSpellControl('put_out_fire', '.codescroll-state-editing .codescroll-parse-btn'),
                            ['click']
                        );
                    },
                    onEvent: () => {
                        // Step completion is handled by the explicit "Play with fire!" flow.
                    }
                }
            ];

            this.handlePlayerMoveStart = (event) => {
                this.sendStepEvent('player-move-start', event.detail);
            };

            this.handleSpellCastSettled = (event) => {
                this.sendStepEvent('spell-cast-settled', event.detail);
            };

            this.handleSpellParse = (event) => {
                const detail = event.detail || {};
                if (!this.isCurrentStep('put-out-fire') || detail.spellName !== 'put_out_fire') return;

                if (detail.success && !this.stepState.firstParseSuccessSeen) {
                    this.stepState.firstParseSuccessSeen = true;
                    this.showSideSpeech(SIDE_TEXT.parseSuccess);
                    this.highlightElement(
                        'step3-play-btn',
                        this.getSpellControl('put_out_fire', '.codescroll-state-parsed .codescroll-play-btn'),
                        ['click']
                    );
                }

                if (!detail.success && !this.stepState.firstErrorSeen) {
                    this.stepState.firstErrorSeen = true;
                    this.showSideSpeech(SIDE_TEXT.parseOrExecutionError);
                    this.highlightElement(
                        'step3-edit-btn',
                        this.getSpellControl('put_out_fire', '.codescroll-state-parsed .codescroll-edit-btn'),
                        ['click']
                    );
                }
            };

            this.handleSpellCastError = (event) => {
                const detail = event.detail || {};
                if (!this.isCurrentStep('put-out-fire') || detail.spellName !== 'put_out_fire') return;
                if (this.stepState.firstErrorSeen) return;

                this.stepState.firstErrorSeen = true;
                this.showSideSpeech(SIDE_TEXT.parseOrExecutionError);
                this.highlightElement(
                    'step3-edit-btn',
                    this.getSpellControl('put_out_fire', '.codescroll-state-parsed .codescroll-edit-btn'),
                    ['click']
                );
            };

            this.handleSpellCastComplete = (event) => {
                const detail = event.detail || {};
                if (!this.isCurrentStep('put-out-fire') || detail.spellName !== 'put_out_fire') return;
                if (this.stepState.firstReplaySeen) return;
                if (detail.invokedState !== 'parsed') return;

                this.stepState.firstReplaySeen = true;
                this.showSideSpeech(SIDE_TEXT.replay);

                this.highlightElement(
                    'step3-replay-slider',
                    detail.sliderElement,
                    ['pointerdown', 'mousedown', 'touchstart', 'click']
                );
                this.highlightElement(
                    'step3-test-button',
                    testButtonEl,
                    ['click']
                );
            };

            this.handleTestButtonClick = () => {
                this.runStep3TestSequence();
            };
        }

        start() {
            window.addEventListener('elemental:player-move-start', this.handlePlayerMoveStart);
            window.addEventListener('elemental:spell-cast-settled', this.handleSpellCastSettled);
            window.addEventListener('elemental:spell-parse', this.handleSpellParse);
            window.addEventListener('elemental:spell-cast-error', this.handleSpellCastError);
            window.addEventListener('elemental:spell-cast-complete', this.handleSpellCastComplete);
            testButtonEl.addEventListener('click', this.handleTestButtonClick);
            this.enterStep(0);
        }

        async enterStep(index) {
            this.clearAllHighlights();
            this.currentStepIndex = index;
            const step = this.steps[index];
            if (!step) {
                this.showFinale();
                return;
            }
            if (step.onEnter) {
                await step.onEnter();
            }
        }

        async completeCurrentStep() {
            if (this.isAdvancing) return;
            this.isAdvancing = true;
            this.clearAllHighlights();

            const currentStep = this.steps[this.currentStepIndex];
            if (currentStep && currentStep.id === 'put-out-fire') {
                this.hideTestButton();
                this.hideSideSpeech();
            }

            const nextIndex = this.currentStepIndex + 1;
            await this.enterStep(nextIndex);
            this.isAdvancing = false;
        }

        sendStepEvent(type, detail) {
            const step = this.steps[this.currentStepIndex];
            if (!step || typeof step.onEvent !== 'function') return;
            step.onEvent({ type, detail });
        }

        isCurrentStep(stepId) {
            const step = this.steps[this.currentStepIndex];
            return !!step && step.id === stepId;
        }

        showMainSpeech(markdownText) {
            renderMarkdown(mainSpeechEl, markdownText);
        }

        showSideSpeech(markdownText) {
            renderMarkdown(sideSpeechEl, markdownText);
        }

        hideSideSpeech() {
            sideSpeechEl.hidden = true;
            sideSpeechEl.innerHTML = '';
        }

        showTestButton() {
            testButtonEl.hidden = false;
            testButtonEl.disabled = false;
        }

        hideTestButton() {
            testButtonEl.hidden = true;
            testButtonEl.disabled = false;
        }

        hideAllScrolls() {
            spellUi.hideScroll('splash');
            spellUi.hideScroll('whoosh');
            spellUi.hideScroll('put_out_fire');
        }

        getSpellControl(spellName, selector) {
            const container = spellUi.getScrollContainer(spellName);
            if (!container) return null;
            return container.querySelector(selector);
        }

        highlightElement(key, element, eventTypes) {
            this.clearHighlight(key);
            if (!element) return;

            const listeners = [];
            const clear = () => {
                for (const [type, handler] of listeners) {
                    element.removeEventListener(type, handler, true);
                }
                element.classList.remove('tutorial-highlight-pulse');
                this.highlights.delete(key);
            };

            for (const type of eventTypes) {
                const handler = () => clear();
                listeners.push([type, handler]);
                element.addEventListener(type, handler, true);
            }

            element.classList.add('tutorial-highlight-pulse');
            this.highlights.set(key, clear);
        }

        clearHighlight(key) {
            const clear = this.highlights.get(key);
            if (clear) {
                clear();
            }
        }

        clearAllHighlights() {
            const clearFns = Array.from(this.highlights.values());
            for (const clear of clearFns) {
                clear();
            }
            this.highlights.clear();
        }

        resetStep3OneTimeFlags() {
            this.stepState.firstParseSuccessSeen = false;
            this.stepState.firstErrorSeen = false;
            this.stepState.firstReplaySeen = false;
            this.stepState.testRunActive = false;
            this.stepState.waitingForTestCast = false;
        }

        countWaterPixels() {
            if (typeof window.countWaterPixels === 'function') {
                const px =  window.countWaterPixels();
                return px;
            }
            return 0;
        }

        spawnFirstStepFires() {
            const viewportMin = Math.min(window.innerWidth, window.innerHeight);
            const farMax = Math.max(160, Math.floor(viewportMin * 0.42));
            const existingPoints = [];

            const first = this.pickWorldPointInRing(50, 100, existingPoints);
            if (first) existingPoints.push(first);
            const second = this.pickWorldPointInRing(120, farMax, existingPoints);
            if (second) existingPoints.push(second);
            const third = this.pickWorldPointInRing(120, farMax, existingPoints);

            for (const point of [first, second, third]) {
                if (!point) continue;
                this.spawnFireAtWorld(point.x, point.y);
            }
        }

        spawnSingleTestFire() {
            const margin = 400;
            const worldX = this.randomInRange(margin, window.innerWidth - margin);
            const worldY = this.randomInRange(margin, window.innerHeight - margin);
            this.spawnFireAtWorld(worldX, worldY);
        }

        spawnFireAtWorld(worldX, worldY) {
            const local = player.worldToLocal(worldX, worldY);
            player.fire(Math.round(local.x), Math.round(local.y));
        }

        pickWorldPointInRing(minDistance, maxDistance, existingPoints) {
            const margin = 70;
            for (let attempt = 0; attempt < 80; attempt += 1) {
                const angle = Math.random() * Math.PI * 2;
                const distance = this.randomInRange(minDistance, maxDistance);
                const x = player.x + Math.cos(angle) * distance;
                const y = player.y + Math.sin(angle) * distance;

                if (x < margin || x > window.innerWidth - margin) continue;
                if (y < margin || y > window.innerHeight - margin) continue;

                let tooClose = false;
                for (const other of existingPoints) {
                    const dx = x - other.x;
                    const dy = y - other.y;
                    if (Math.sqrt(dx * dx + dy * dy) < 85) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    return { x, y };
                }
            }

            return {
                x: this.randomInRange(margin, window.innerWidth - margin),
                y: this.randomInRange(margin, window.innerHeight - margin)
            };
        }

        randomInRange(min, max) {
            if (max <= min) return min;
            return min + Math.random() * (max - min);
        }

        async runStep3TestSequence() {
            if (!this.isCurrentStep('put-out-fire')) return;
            if (this.stepState.testRunActive) return;

            this.stepState.testRunActive = true;
            testButtonEl.disabled = true;

            const putOutScroll = spellUi.getScroll('put_out_fire');
            if (!putOutScroll) {
                this.finishTestRun();
                return;
            }

            await putOutScroll.transitionTo('parsed');
            const snapshot = putOutScroll.getSnapshot();
            if (snapshot.parseSuccess !== true) {
                this.finishTestRun();
                return;
            }

            if (typeof window.clearWater === 'function') {
                window.clearWater();
            }
            if (typeof window.clearFires === 'function') {
                window.clearFires();
            }
            this.spawnSingleTestFire();

            this.stepState.waitingForTestCast = true;
            const targetingStarted = spellUi.executeSpellByName('put_out_fire', (detail) => {
                this.handleTestCastResult(detail);
            });

            if (!targetingStarted) {
                this.stepState.waitingForTestCast = false;
                this.finishTestRun();
            }
        }

        handleTestCastResult(detail) {
            const water_tolerance = 200; // max. tolerable water remaining
            if (!this.stepState.waitingForTestCast) return;

            this.stepState.waitingForTestCast = false;
            const noFiresLeft = window.fires.length === 0;
            const waterPixels = this.countWaterPixels();
            const passed = !!detail && detail.ok === true && noFiresLeft && waterPixels <= water_tolerance;

            if (passed) {
                this.finishTestRun();
                this.completeCurrentStep();
                return;
            }
            else if(!noFiresLeft) {
                this.showSideSpeech(SIDE_TEXT.firesLeft);
            }
            else if(waterPixels > water_tolerance) {
                this.showSideSpeech(SIDE_TEXT.waterLeft);
            }

            // Test was not successful - begin or continue debugging assistant flow.
            const putOutScroll = spellUi.getScroll('put_out_fire');
            if (debuggyAssistant && putOutScroll) {
                debuggyAssistant.beginAssistance({
                    stateBefore: putOutScroll.model.lastStateBeforeRun,
                    playerCode: putOutScroll.getSnapshot().wholeCode,
                    executionTrace: putOutScroll.model.lastTrace
                });
            }


            // clear fire and water from screen
            if (typeof window.clearWater === 'function') {
                window.clearWater();
            }
            if (typeof window.clearFires === 'function') {
                window.clearFires();
            }
            this.finishTestRun();
        }

        finishTestRun() {
            this.stepState.testRunActive = false;
            testButtonEl.disabled = false;
        }

        showFinale() {
            this.hideSideSpeech();
            this.hideTestButton();
            finaleBodyEl.textContent = '';
            finaleEl.hidden = false;
            requestAnimationFrame(() => {
                finaleEl.classList.add('visible');
            });
        }
    }

    const tutorial = new TutorialSequence();
    tutorial.start();
})();
