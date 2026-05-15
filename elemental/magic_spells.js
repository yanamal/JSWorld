let mousex = null;
let mousey = null;
const targetingCue = document.getElementById('targetingCue');

window.addEventListener('mousemove', (event) => {
    mousex = event.clientX;
    mousey = event.clientY;
});

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

let targetedSpellInProgress = false;
function executeTargetedSpell({ scrollRef, spellName, onDone }) {
    if (targetedSpellInProgress) return false;
    targetedSpellInProgress = true;

    ensureMousePosition();
    showTargetingCue(spellName);

    scrollRef.startTriggerFollowingMouse(
        (vx, vy) => getTargetedCallText(spellName, vx, vy),
        mousex,
        mousey
    );

    function finalizeTarget(event) {
        event.preventDefault();
        event.stopPropagation();
        mousex = event.clientX;
        mousey = event.clientY;

        window.removeEventListener('click', finalizeTarget, true);
        hideTargetingCue();

        const callText = getTargetedCallText(spellName, mousex, mousey);
        scrollRef.executeCall(callText, {
            initFunc: () => createMagicInitFunc(player),
            onBeforeRun: () => getWorldState(player)
        }).then((detail) => {
            targetedSpellInProgress = false;
            if (onDone) onDone(detail);
        }).catch((error) => {
            console.error(error);
            targetedSpellInProgress = false;
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
            onExecute: () => {
                executeTargetedSpell({ scrollRef: spellScroll, spellName });
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
        onExecute: () => {
            splashScroll.executeCall('splash()', {
                initFunc: () => createMagicInitFunc(player),
                onBeforeRun: () => getWorldState(player)
            });
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

const zerroScroll = createCodeScroll(
    '#zerro-scroll',
    {
        header: 'function zerro() {',
        body: '    water(250, 0, 200)',
        footer: '}',
        trigger: 'zerro()'
    },
    {
        initialState: 'editing',
        editingEnabled: true,
        onExecute: () => {
            zerroScroll.executeCall('zerro()', {
                initFunc: () => createMagicInitFunc(zerro),
                onBeforeRun: () => getWorldState(zerro)
            });
        }
    }
)

