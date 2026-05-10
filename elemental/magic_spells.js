let mousex = null;
let mousey = null;
const targetingCue = document.getElementById('targetingCue');

window.addEventListener('mousemove', (event) => {
    mousex = event.clientX;
    mousey = event.clientY;
});

function getTriggerViz(scrollId) {
    return document.getElementById(scrollId).querySelector('.trigger-viz');
}

function ensureMousePosition() {
    if (mousex === null || mousey === null) {
        mousex = player.x;
        mousey = player.y;
    }
}

function getRoundedLocalCoordsFromWorld(worldX, worldY) {
    const local = player.worldToLocal(worldX, worldY);
    return {
        x: Math.round(local.x),
        y: Math.round(local.y)
    };
}

function getTargetedCallText(spellName, worldX, worldY) {
    const local = getRoundedLocalCoordsFromWorld(worldX, worldY);
    return `${spellName}(${local.x}, ${local.y})`;
}

function showTargetingCue(spellName) {
    if (!targetingCue) return;
    targetingCue.textContent = `Targeting ${spellName}(x, y): click to cast`;
    targetingCue.hidden = false;
    document.body.classList.add('targeting-spell-active');
}

function hideTargetingCue() {
    if (!targetingCue) return;
    targetingCue.hidden = true;
    document.body.classList.remove('targeting-spell-active');
}

// Take an original trace as returned by the visual interpreter, and make a more readable summary of important things in each step
// TODO:this should really be general to codeScroll, but the logic is currently specific to the execution nuances in here.
function getReadableTrace(origTrace, asts, codeSnippets) {
    // asts and codeSnippest are both arrays of length N (usually 2) such that ast[i] has the ast that corresponds with code at codeSnippets[i].
    // origTrace has the execution trace of executing **all** snippets together (usually funciton definition followed by funciton call)
    // so we don't know which snippet/ast each individual part of the trace came from.

    //1. for each AST, create mapping from uuid to ast node (each node already has a uuid attribute from the interpreter)

    //2. For each step in the origTrace (which is an array of steps), get step.activeNode.uuid and find it in the mappings.
    // Figure out which snippet it came from. Using the ast node's start/end characters,
    // insert unicode delimeter (e.g. ★) into the code snippet at the start/end locations to indicate which part of the code was executed.

    // return a list of trace steps where each step has:
    // executedCode: code string modified with delimeters
    // producedValue: step.producedValue from the original step
    // nodeType: step.activeNode.nodeType
    // exception: step.exception

    const trace = Array.isArray(origTrace) ? origTrace : [];
    const astList = Array.isArray(asts) ? asts : [];
    const snippets = Array.isArray(codeSnippets) ? codeSnippets : [];

    function walkNodes(value, onNode) {
        if (!value) return;
        if (Array.isArray(value)) {
            for (const item of value) walkNodes(item, onNode);
            return;
        }
        if (typeof value !== 'object') return;
        onNode(value);
        for (const child of Object.values(value)) {
            walkNodes(child, onNode);
        }
    }

    const uuidToNodeRef = new Map();
    astList.forEach((ast, snippetIndex) => {
        walkNodes(ast, (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.uuid === undefined || node.uuid === null) return;
            const key = String(node.uuid);
            if (!uuidToNodeRef.has(key)) {
                uuidToNodeRef.set(key, { node, snippetIndex });
            }
        });
    });

    function getNodeBounds(node) {
        if (!node || typeof node !== 'object') return null;

        if (Number.isInteger(node.start) && Number.isInteger(node.end)) {
            return { start: node.start, end: node.end };
        }
        if (Array.isArray(node.range) && node.range.length >= 2) {
            const start = node.range[0];
            const end = node.range[1];
            if (Number.isInteger(start) && Number.isInteger(end)) {
                return { start, end };
            }
        }
        if (node.loc && typeof node.loc === 'object') {
            const start = node.loc.start && node.loc.start.offset;
            const end = node.loc.end && node.loc.end.offset;
            if (Number.isInteger(start) && Number.isInteger(end)) {
                return { start, end };
            }
        }
        return null;
    }

    function markExecutedCode(code, node) {
        const text = typeof code === 'string' ? code : '';
        const bounds = getNodeBounds(node);
        if (!bounds) return text;

        const start = Math.max(0, Math.min(text.length, bounds.start));
        const end = Math.max(start, Math.min(text.length, bounds.end));
        if (start === end) return text;

        return `${text.slice(0, start)}★${text.slice(start, end)}★${text.slice(end)}`;
    }

    return trace.map((step) => {
        const activeNode = step && step.activeNode ? step.activeNode : null;
        const stepUuid = activeNode && activeNode.uuid !== undefined && activeNode.uuid !== null
            ? String(activeNode.uuid)
            : null;
        const matched = stepUuid ? uuidToNodeRef.get(stepUuid) : null;
        const snippetIndex = matched ? matched.snippetIndex : 0;
        const snippet = snippets[snippetIndex] || '';
        const matchedNode = matched ? matched.node : null;

        return {
            executedCode: markExecutedCode(snippet, matchedNode),
            producedValue: step.producedValue ? step.producedValue : undefined,  // TODO: skip altogether if undefined
            nodeType: activeNode && activeNode.nodeType
                ? activeNode.nodeType
                : (matchedNode && (matchedNode.nodeType || matchedNode.type)) || null,
            exception: step.exception ? step.exception : undefined   // TODO: skip altogether if undefined
        };
    });
}

// TODO: update and use visual interpreter library
function getFixedTraceStepFilter(
    include_produced_value=true, // this step completed evaluating a node AND the evaluation returned a value
    include_exception=true, // this step produces an exception
    include_completed_node=true, // this step completed evaluating a node (regardless of whether the evaluation produced an explicit return value)
    include_side_effects=true, // this step did something that's considered a "side effect", e.g. changing the value of a variable
    include_pushed_node=false, // this step was a partial evaluation of a "parent" node that ended with pushing a child node onto the state stack
    exclude_types=['ExpressionStatement', 'BlockStatement']
    ) {
    // Note: the order of these return checks depends somewhat on how the different possible types of states relate to each other, and what seems to make sense to include/exclude
    // It's probably fine.
    return function(stepResult){
        if(exclude_types.includes(stepResult.activeNode.nodeType)) {
            return false;
        }
        if(include_exception && stepResult.exception) {
            return true;
        }
        if(include_completed_node && stepResult.completedNode) {
            return true;
        }
        if(include_produced_value && stepResult.producedValue) {
            return true;
        }
        if(include_side_effects && stepResult.hasSideEffect) {
            return true;
        }
        if(include_pushed_node && stepResult.pushedNode) {
            return true;
        }
        return false;
    }
}

function executeSpellCall({
    scrollId,
    scrollRef,
    parsedFunction,
    callText,
    spellName,
    invokedState,
    onDone  // additional function to call after spell is done executing - e.g. "stop having the trigger visualization follow the mouse"
}) {
    // get world state before spell call
    scrollRef.model.lastStateBeforeRun = getWorldState(player)

    // reset "foot" part of "parsed" view - it may contain a "trace slider" for navigating the trace of the *previous* execution.
    const parsedFoot = document.getElementById(scrollId).querySelector('.codescroll-state-parsed .code-foot');
    parsedFoot.innerHTML = '&nbsp;';

    const triggerVizElem = getTriggerViz(scrollId);
    const settled = (detail) => {
        window.dispatchEvent(new CustomEvent('elemental:spell-cast-settled', { detail }));
        if (onDone) onDone(detail);
        return detail;
    };

    // parse the function *call* code - e.g. whoosh(100, 100)
    // this is game-constructed code, not user-written, so we expect it to always parse successfully.
    const parsedCall = parseIntoHTML(callText);

    // put the parsed call code into the "trigger visualization" element.
    triggerVizElem.innerHTML = parsedCall.html;
    // stick together a combined AST of both the function body and the function call; both will be executed together.
    const combinedAst = structuredClone(parsedFunction.ast);
    combinedAst.body.push(...parsedCall.ast.body);

    return animateParse(triggerVizElem.children[0], 100, 20)
        .then(() => {
            // interpret code; animate (with speed = 200) if the spell scroll is in the "parsed" state - the user sees the code.
            // TODO: assumes player is the spell caster. This is not always going to be true.
            let interpSpeed = 0;
            if (scrollRef.getState() === 'parsed') interpSpeed = 200;
            return interpretCode(
                document.getElementById(scrollId),
                combinedAst,
                interpSpeed,
                false,
                createMagicInitFunc(player)
            );
        })
        .then((result) => {
            const fullTrace = Array.isArray(result.executionTrace) ? result.executionTrace : [];
            const condensedTrace = fullTrace.filter(getFixedTraceStepFilter());
            const condensedSlider = createTraceSlider(condensedTrace, document.getElementById(scrollId));
            // console.log(condensedTrace)

            // get readable trace: a more concise version that can be passed to debuggy,store it in the scroll.
            // if we end up calling debuggy for this run, we will use this readable trace.
            const spellCodeText = scrollRef.getSnapshot().wholeCode;
            const readableTrace = getReadableTrace(
                condensedTrace,
                [parsedFunction.ast, parsedCall.ast],
                [spellCodeText, callText]
            );
            console.log(readableTrace);
            scrollRef.model.lastTrace = readableTrace;

            // reset the trigger visualization; append the trace slider to the 'foot' part of the 'parsed' code scroll state.
            parsedFoot.appendChild(condensedSlider);
            triggerVizElem.innerHTML = '';

            const detail = {
                scrollId,
                spellName,
                ok: true,
                result,
                sliderElement: condensedSlider,
                invokedState
            };
            window.dispatchEvent(new CustomEvent('elemental:spell-cast-complete', { detail }));
            return settled(detail);
        })
        .catch((error) => {
            console.error(error);
            triggerVizElem.innerHTML = '';
            const detail = {
                scrollId,
                spellName,
                ok: false,
                error,
                invokedState
            };
            window.dispatchEvent(new CustomEvent('elemental:spell-cast-error', { detail }));
            return settled(detail);
        });
}

let targetedSpellInProgress = false;
function executeTargetedSpell({ scrollId, scrollRef, parsedFunction, spellName, onDone }) {
    if (targetedSpellInProgress) return false;
    targetedSpellInProgress = true;

    const invokedState = scrollRef.getState();
    ensureMousePosition();
    showTargetingCue(spellName);
    const triggerVizElem = getTriggerViz(scrollId);

    function followMouse() {
        triggerVizElem.style.left = mousex + 'px';
        triggerVizElem.style.top = mousey + 'px';
        triggerVizElem.textContent = getTargetedCallText(spellName, mousex, mousey);
    }
    followMouse();
    window.addEventListener('mousemove', followMouse);

    function finalizeTarget(event) {
        event.preventDefault();
        event.stopPropagation();
        mousex = event.clientX;
        mousey = event.clientY;

        window.removeEventListener('mousemove', followMouse);
        window.removeEventListener('click', finalizeTarget, true);
        hideTargetingCue();

        const callText = getTargetedCallText(spellName, mousex, mousey);
        executeSpellCall({
            scrollId,
            scrollRef,
            parsedFunction,
            callText,
            spellName,
            invokedState,
            onDone: (detail) => {
                targetedSpellInProgress = false;
                if (onDone) onDone(detail);
            }
        }).catch((error) => {
            console.error(error);
            targetedSpellInProgress = false;
            getTriggerViz(scrollId).innerHTML = '';
        });
    }

    window.addEventListener('click', finalizeTarget, true);
    return true;
}

function createTargetedSpellScroll({ scrollId, spellName, body, editingEnabled }) {
    let spellScroll = null;
    spellScroll = createCodeScroll(
        `#${scrollId}`,
        {
            header: `function ${spellName}(x, y) {`,
            body,
            footer: '}',
            trigger: `${spellName}(x, y)`
        },
        {
            initialState: 'collapsed',
            editingEnabled: !!editingEnabled,
            onExecute: ({ parsed }) => {
                executeTargetedSpell({
                    scrollId,
                    scrollRef: spellScroll,
                    parsedFunction: parsed,
                    spellName
                });
            },
            onTransitionComplete: ({ to }) => {
                if (to === 'parsed') {
                    const snapshot = spellScroll.getSnapshot();
                    window.dispatchEvent(new CustomEvent('elemental:spell-parse', { detail: {
                        scrollId,
                        spellName,
                        success: snapshot.parseSuccess === true,
                        snapshot
                    }}));
                }
            }
        }
    );
    return spellScroll;
}

function executeSplashScroll(scrollRef, parsed) {
    const scrollId = 'splash-scroll';
    const spellName = 'splash';
    const invokedState = scrollRef.getState();
    const triggerVizElem = getTriggerViz(scrollId);

    function followMouse() {
        triggerVizElem.style.left = mousex + 'px';
        triggerVizElem.style.top = mousey + 'px';
    }
    followMouse();

    window.addEventListener('mousemove', followMouse);
    return executeSpellCall({
        scrollId,
        scrollRef,
        parsedFunction: parsed,
        callText: 'splash()',
        spellName,
        invokedState,
        onDone: () => {
            window.removeEventListener('mousemove', followMouse);
        }
    });
}

const splashScroll = createCodeScroll(
    '#splash-scroll',
    {
        header: 'function splash() {',
        body: '    water(0, 0, 100);',
        footer: '}',
        trigger: 'splash()'
    },
    {
        initialState: 'collapsed',
        editingEnabled: false,
        onExecute: ({ parsed }) => {
            executeSplashScroll(splashScroll, parsed);
        }
    }
);

const whooshScroll = createTargetedSpellScroll({
    scrollId: 'whoosh-scroll',
    spellName: 'whoosh',
    body: '    wind(0, 0, x, y, 100);',
    editingEnabled: false
});

const putOutFireScroll = createTargetedSpellScroll({
    scrollId: 'put-out-fire-scroll',
    spellName: 'put_out_fire',
    body: `    water(x, y, 100);
    wind(0, 0, x, y, 100);`,
    editingEnabled: true
});

function executeSpellByName(spellName, onDone) {
    const scrolls = {
        splash:       { scrollRef: splashScroll,      targeted: false },
        whoosh:       { scrollRef: whooshScroll,      targeted: true  },
        put_out_fire: { scrollRef: putOutFireScroll,  targeted: true  }
    };
    const spell = scrolls[spellName];
    if (!spell || spell.scrollRef.getSnapshot().parseSuccess !== true) return false;
    if (!spell.targeted) {
        executeSplashScroll(spell.scrollRef, spell.scrollRef.getParsed());
        return true;
    }
    return executeTargetedSpell({
        scrollId: spell.scrollRef.container.id,
        scrollRef: spell.scrollRef,
        parsedFunction: spell.scrollRef.getParsed(),
        spellName,
        onDone
    });
}
