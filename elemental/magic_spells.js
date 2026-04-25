let mousex = null
let mousey = null
window.addEventListener('mousemove', (e)=> {
    mousex = e.clientX
    mousey = e.clientY
})

function getTriggerViz(scrollId) {
    return document.getElementById(scrollId).querySelector('.trigger-viz')
}

function ensureMousePosition() {
    if (mousex === null || mousey === null) {
        mousex = player.x
        mousey = player.y
    }
}

function getRoundedLocalCoordsFromWorld(worldX, worldY) {
    const local = player.worldToLocal(worldX, worldY)
    return {
        x: Math.round(local.x),
        y: Math.round(local.y)
    }
}

function getTargetedCallText(spellName, worldX, worldY) {
    const local = getRoundedLocalCoordsFromWorld(worldX, worldY)
    return `${spellName}(${local.x}, ${local.y})`
}

function executeSpellCall(scrollId, scrollRef, parsedFunction, callText, onDone) {
    const parsed_call = parseIntoHTML(callText)
    const trigger_viz_elem = getTriggerViz(scrollId)
    trigger_viz_elem.innerHTML = parsed_call.html

    const combined_ast = structuredClone(parsedFunction.ast)
    combined_ast.body.push(...parsed_call.ast.body)

    animateParse(trigger_viz_elem.children[0], 100, 20).then(() => {
        let interp_speed = 0
        if (scrollRef.getState() == "parsed") interp_speed = 200

        interpretCode(document.getElementById(scrollId), combined_ast, interp_speed, false, createMagicInitFunc(player)).then((result)=>{
            console.log(result)
            trigger_viz_elem.innerHTML = ''
            if (onDone) onDone()
        })
    })
}

let targetedSpellInProgress = false
function executeTargetedSpell({ scrollId, scrollRef, parsedFunction, spellName }) {
    if (targetedSpellInProgress) return
    targetedSpellInProgress = true

    ensureMousePosition()
    const trigger_viz_elem = getTriggerViz(scrollId)

    function follow_mouse() {
        trigger_viz_elem.style.left = mousex + 'px'
        trigger_viz_elem.style.top = mousey + 'px'
        trigger_viz_elem.textContent = getTargetedCallText(spellName, mousex, mousey)
    }
    follow_mouse()
    window.addEventListener('mousemove', follow_mouse)

    function finalizeTarget(event) {
        event.preventDefault()
        event.stopPropagation()
        mousex = event.clientX
        mousey = event.clientY

        window.removeEventListener('mousemove', follow_mouse)
        window.removeEventListener('click', finalizeTarget, true)

        const callText = getTargetedCallText(spellName, mousex, mousey)
        executeSpellCall(scrollId, scrollRef, parsedFunction, callText, () => {
            targetedSpellInProgress = false
        })
    }

    window.addEventListener('click', finalizeTarget, true)
}

function createTargetedSpellScroll({ scrollId, spellName, body }) {
    let spellScroll = null
    spellScroll = createCodeScroll(`#${scrollId}`,
        {
            header: `function ${spellName}(x, y) {`,
            body,
            footer: "}",
            trigger: `${spellName}(x, y)`
        }, {
            initialState: "collapsed",
            onExecute: ({ parsed }) => {
                executeTargetedSpell({
                    scrollId,
                    scrollRef: spellScroll,
                    parsedFunction: parsed,
                    spellName
                })
            }
        })
    return spellScroll
}

const splashScroll = createCodeScroll("#splash-scroll",
    {
        header: "function splash() {",
        body: "    water(0, 0, 100)",
        footer: "}",
        trigger: "splash()"
    }, {
        initialState: "collapsed",
        onExecute: ({ trigger, parseSuccess, scroll, parsed }) => {
            console.log(parsed.ast);

            const trigger_viz_elem = getTriggerViz('splash-scroll')

            function follow_mouse()  {
                trigger_viz_elem.style.left = mousex + 'px';
                trigger_viz_elem.style.top = mousey + 'px';
            }
            follow_mouse()

            window.addEventListener('mousemove', follow_mouse);
            executeSpellCall('splash-scroll', splashScroll, parsed, 'splash()', () => {
                window.removeEventListener('mousemove', follow_mouse)
            })
        }
    })

const whooshScroll = createTargetedSpellScroll({
    scrollId: 'whoosh-scroll',
    spellName: 'whoosh',
    body: "    water(x, y, 100)"
})

const putOutFireScroll = createTargetedSpellScroll({
    scrollId: 'put-out-fire-scroll',
    spellName: 'put_out_fire',
    body: "    // TODO: add spell behavior"
})
