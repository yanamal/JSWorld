# CodeScroll

A UI component representing a "code scroll" — a function definition the player can read, edit, parse, and execute. Defined in `common/codescroll.js`; styles in `common/codescroll.css`.

Requires the following globals (provided by the visual interpreter library):
- `parseIntoHTML(code)` → `{ html, ast, parse_success, error? }`
- `animateParse(element, duration?, stagger?)` → Promise
- `interpretCode(container, ast, speed, strict, initFunc)` → Promise → `{ executionTrace }`
- `createTraceSlider(condensedTrace, container)` → HTMLElement

---

## Creating a scroll

```js
const scroll = createCodeScroll(containerOrSelector, definition, options);
```

`createCodeScroll` is a convenience wrapper around `new CodeScroll(...)`. Both are exposed on `window`.

### `definition` object

| Field | Type | Description |
|---|---|---|
| `header` | string | Top line of the function, shown in all expanded states. E.g. `"function whoosh(x, y) {"` |
| `body` | string | Initial body text, editable by the player |
| `footer` | string | Closing line, shown below the body. E.g. `"}"` |
| `trigger` | string | Short call-form shown in collapsed state. E.g. `"whoosh(x, y)"` |

### `options` object

| Field | Type | Default | Description |
|---|---|---|---|
| `initialState` | `'collapsed'` \| `'editing'` \| `'parsed'` | `'collapsed'` | State the scroll starts in |
| `editingEnabled` | boolean | `true` | Whether the player can open the editor |
| `onExecute` | function | — | Called when the user triggers execution (clicks the collapsed head or the ▶ button). Receives `{ event, trigger, parsed, parseSuccess, scroll }`. The world is responsible for doing something with it (e.g. calling `scroll.executeCall`). |
| `onTransitionComplete` | function | — | Called after any state transition completes. Receives `{ from, to, scroll }`. |
| `transitionCallbacks` | object | — | Map of `"from->to"` strings to callbacks, e.g. `{ "editing->parsed": (scroll) => ... }`. Called in addition to `onTransitionComplete`. |

---

## States

A scroll is always in exactly one of three states:

- **`collapsed`** — compact view showing only the trigger text. Clicking the head triggers execution; clicking `▼` opens editing (if enabled).
- **`editing`** — full view with an editable code body (Ace editor if available, textarea fallback). `✓` parses and transitions to `parsed`; `✕` also parses and collapses if successful.
- **`parsed`** — full view showing syntax-highlighted read-only code. `▶` triggers execution; `↩` goes back to editing; `✕` collapses.

### Transitions with animation

```
collapsed ←→ editing ←→ parsed → collapsed
```

Not all direct transitions are animated — only the paths listed above have custom animations. Any other `transitionTo` call falls back to an instant switch.

---

## Public API

### State control

#### `scroll.transitionTo(stateName)` → Promise
Animates to the target state. Queued — calls chain automatically. Returns a Promise that resolves when the transition completes.

```js
await scroll.transitionTo('parsed');
```

#### `scroll.setState(stateName, opts?)`
Instantly switches state with no animation. `opts.silent = true` suppresses transition callbacks. Returns `this`.

#### `scroll.getState()` → string
Returns the current state name.

---

### Editing

#### `scroll.setEditingEnabled(enabled)` → `this`
Enables or disables the editing path (the `▼` tail and `↩` button). Can be called at any time.

#### `scroll.isEditingEnabled()` → boolean

#### `scroll.setBody(bodyText)` → `this`
Replaces the editor content. Does not re-parse.

---

### Reading state

#### `scroll.getSnapshot()` → object
Returns a plain object with the current scroll state, suitable for passing to external systems:

```js
{
  header, body, footer, trigger,
  editingEnabled,
  currentState,
  parsed,          // result of last parseIntoHTML call (or null)
  parseSuccess,    // boolean | null
  wholeCode,       // header + "\n" + body + "\n" + footer
  parseErrorData   // see getParseErrorData()
}
```

#### `scroll.getWholeCode()` → string
Returns `header + "\n" + currentEditorBody + "\n" + footer`.

#### `scroll.getParsed()` → object | null
Returns the raw `parseIntoHTML` result from the last parse, or `null` if never parsed.

#### `scroll.getParseErrorData()` → object
Returns structured error info from the most recent parse attempt:

```js
{
  parse_success,           // boolean
  parser_error_message,    // string | null
  parser_error,            // error object | null
  ace_error_message,       // string | null (from Ace editor annotations)
  ace_annotations,         // array | null
  whole_code               // string
}
```

---

### Execution

#### `scroll.executeCall(callText, options)` → Promise
Runs the full execution sequence: parse the call text, animate the triggerViz, interpret the combined AST, build the trace slider, store the readable trace. The world calls this after any needed user input (e.g. targeting clicks) is complete.

```js
scroll.executeCall('whoosh(45, -12)', {
    initFunc:    () => createMagicInitFunc(player),  // factory — called at run time
    onBeforeRun: () => getWorldState(player)          // result stored in scroll.model.lastStateBeforeRun
});
```

| Option | Type | Description |
|---|---|---|
| `initFunc` | `() => initObject` | Factory called just before `interpretCode`. Returns the environment object the interpreter uses to resolve world-specific functions. |
| `onBeforeRun` | `() => any` | Called before execution starts; return value is stored in `scroll.model.lastStateBeforeRun` for later use (e.g. debugging). |

Dispatches these window events on completion:
- **`codescroll:cast-settled`** — always fires, whether the run succeeded or failed. Detail: `{ scrollId, ok, invokedState, result? error? sliderElement? }`.
- **`codescroll:cast-complete`** — fires on success. Same detail plus `result` and `sliderElement`.
- **`codescroll:cast-error`** — fires on failure. Same detail plus `error`.

`invokedState` is the state the scroll was in when `executeCall` was called (`'collapsed'` or `'parsed'`).

After a successful run, `scroll.model.lastTrace` holds a readable trace (array of `{ executedCode, producedValue, nodeType, exception }` steps with `★` delimiters marking the active AST node).

---

### Trigger visualisation (triggerViz)

The triggerViz is a floating element that shows the specific call being executed (e.g. `whoosh(45, -12)`). It is managed by the scroll; the world just needs to call two methods around the user-input phase.

#### `scroll.startTriggerFollowingMouse(getContentFn, initialX?, initialY?)`
Makes the triggerViz visible and tracks the mouse. Call this when user input starts (e.g. targeting phase). `getContentFn(viewportX, viewportY)` is called on each mousemove and should return the text to display (e.g. the current call text with live coordinates). Initial viewport coordinates can be passed to position it immediately before the first mousemove.

```js
scroll.startTriggerFollowingMouse(
    (vx, vy) => `whoosh(${Math.round(local.x)}, ${Math.round(local.y)})`,
    mousex, mousey
);
```

#### `scroll.setTriggerAtHome()`
Stops mouse-following and animates the triggerViz to its "home" position for the current state:
- **collapsed**: overlays the collapsed head text
- **parsed**: sits below the parsed code body

Background and box-shadow fade out during the animation. Call this when user input ends, or call it indirectly via `executeCall` (which calls it at the start of each run).

The triggerViz is automatically cleared (content and visibility) whenever `_parseCurrentCode` runs, i.e. on every editing→parsed transition.

---

### Notable model fields

These are on `scroll.model` and written by the scroll itself; read them from outside as needed:

| Field | Written by | Contents |
|---|---|---|
| `lastTrace` | `executeCall` | Readable trace from the most recent execution — array of `{ executedCode, producedValue, nodeType, exception }` |
| `lastStateBeforeRun` | `executeCall` (via `onBeforeRun`) | Whatever `onBeforeRun()` returned; intended for world state snapshots used in debugging |

---

### Direct DOM references

The container element is available as `scroll.container`. The Ace editor instance (if Ace loaded) is at `scroll.aceEditor`.

---

## Wiring up a new world

Minimal pattern for a non-targeted spell (no user input phase):

```js
const myScroll = createCodeScroll('#my-scroll', {
    header: 'function doThing() {',
    body:   '    // player writes code here',
    footer: '}',
    trigger: 'doThing()'
}, {
    initialState: 'collapsed',
    editingEnabled: true,
    onExecute: () => {
        myScroll.executeCall('doThing()', {
            initFunc:    () => buildWorldEnv(),
            onBeforeRun: () => captureWorldState()
        });
    }
});
```

For a spell with a user targeting phase, call `startTriggerFollowingMouse` when targeting begins, then `executeCall` when the user commits:

```js
onExecute: () => {
    myScroll.startTriggerFollowingMouse(
        (vx, vy) => `cast(${toLocalX(vx)}, ${toLocalY(vy)})`,
        lastMouseX, lastMouseY
    );
    window.addEventListener('click', function handler(e) {
        window.removeEventListener('click', handler, true);
        const callText = `cast(${toLocalX(e.clientX)}, ${toLocalY(e.clientY)})`;
        myScroll.executeCall(callText, {
            initFunc:    () => buildWorldEnv(),
            onBeforeRun: () => captureWorldState()
        });
    }, true);
}
```
