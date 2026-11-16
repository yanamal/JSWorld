// Each spellcaster has their own persistent interpreter: spells they've learned stay available to all their later casts.
const playerCaster = new Caster('player', createMagicInitFunc(player));
const zerroCaster = new Caster('zerro', createMagicInitFunc(zerro));

// The player learns each of their scrolls' spells whenever the scroll's code is (re)parsed
const learnForPlayer = (parsed) => playerCaster.learn(parsed);

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
            caster: playerCaster,
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
            onParsed: learnForPlayer,
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
        onParsed: learnForPlayer,
        onExecute: () => {
            splashScroll.executeCall('splash()', {
                caster: playerCaster,
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
        // While the player is writing Zerro's spell, it's the player's: they learn it, and their test casts are relative to them
        onParsed: learnForPlayer,
        onExecute: () => {
            zerroScroll.executeCall('zerro()', {
                caster: playerCaster,
                onBeforeRun: () => getWorldState(player)
            });
        }
    }
)

// Hand the zerro spell over to Zerro: he copies the text of the scroll's last-parsed code and learns his own copy
// (re-parsed, so it's separate from the player's: casting it doesn't animate the player's scroll).
// Assumes the scroll's code parsed successfully.
function handZerroSpellToZerro() {
    return zerroCaster.learn(parseIntoHTML(zerroScroll.getSnapshot().wholeCode));
}

// Zerro casts his own copy of the zerro spell
function zerroCastsZerro() {
    return zerroCaster.cast(parseIntoHTML('zerro()'), {
        onBeforeRun: () => getWorldState(zerro)
    });
}

