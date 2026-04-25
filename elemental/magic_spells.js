let mousex = null
let mousey = null
window.addEventListener('mousemove', (e)=> {
    mousex = e.clientX
    mousey = e.clientY
})

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

            const parsed_call = parseIntoHTML('splash()')
            // TODO: show call code, parsing animation (add to special "code" view?..)
            // TODO: remove listener and contents after animation
            const trigger_viz_elem = document.getElementById('splash-scroll').querySelector('.trigger-viz')
            trigger_viz_elem.innerHTML = parsed_call.html; //TODO: remove after animation

            function follow_mouse()  {
                trigger_viz_elem.style.left = mousex + 'px';
                trigger_viz_elem.style.top = mousey + 'px';
            }
            follow_mouse()

            window.addEventListener('mousemove', follow_mouse);

            const combined_ast = structuredClone(parsed.ast)
            combined_ast.body.push(...parsed_call.ast.body);

            animateParse(trigger_viz_elem.children[0], 100, 20).then(() => {
                let interp_speed = 0
                if(splashScroll.getState() == "parsed") interp_speed = 200
                interpretCode(document.getElementById('splash-scroll'), combined_ast, interp_speed, false, createMagicInitFunc(player)).then((result)=>{
                    console.log(result)
                    window.removeEventListener('mousemove', follow_mouse)
                    trigger_viz_elem.innerHTML = ''
                })

            })

        }
    })