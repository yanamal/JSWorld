
// ============================================
// JS-INTERPRETER SETUP
// ============================================

/**
 * Each spell wrapper calls the real spell function, which now accepts
 * an optional onComplete callback. The async wrapper passes js-interpreter's
 * callback as that onComplete, so the interpreter pauses until the
 * animation is fully done.
 */
function createMagicInitFunc(entity) {
    return function(interpreter, globalObject) {

        // --- fire(x, y) ---
        // Fire appears instantly, so we complete immediately.
        // We still make it async for consistency and to allow
        // a small dramatic pause if desired.
        interpreter.setProperty(globalObject, 'fire',
            interpreter.createAsyncFunction(function(x, y, callback) {
                entity.fire(x, y);
                // Small pause so the fire is visible before next spell
                setTimeout(callback, 300);
            })
        );

        // --- water(x, y, r) ---
        // We must wait for the expansion animation to complete
        // before resuming, so the next spell sees the full puddle.
        interpreter.setProperty(globalObject, 'water',
            interpreter.createAsyncFunction(function(x, y, r, callback) {
                entity.water(x, y, r, callback);
                //                    ^^^^^^^^
                // We pass the interpreter's callback as onComplete to water().
                // water() will call it when the puddle finishes expanding.
            })
        );

        // --- wind(x1, y1, x2, y2, w) ---
        // Similarly, wait for the wind animation (and water erosion) to finish.
        interpreter.setProperty(globalObject, 'wind',
            interpreter.createAsyncFunction(function(x1, y1, x2, y2, w, callback) {
                entity.wind(x1, y1, x2, y2, w, callback);
                //                              ^^^^^^^^
                // wind() calls this when the corridor fully dissipates.
            })
        );

        // Expose a synchronous print/log for debugging inside student code
        interpreter.setProperty(globalObject, 'print',
            interpreter.createNativeFunction(function(value) {
                console.log('[student code]', value);
            })
        );

        // wait(ms) — useful for adding pauses between spells
        interpreter.setProperty(globalObject, 'wait',
            interpreter.createAsyncFunction(function(ms, callback) {
                setTimeout(callback, ms);
            })
        );
    };
}

/**
 * Run a string of student code through JS-Interpreter.
 * We use a stepping approach rather than interpreter.run() so that
 * async spells can pause execution mid-step without blocking the
 * browser's main thread.
 */
function executeStudentCode(code, entity) {
    let interp;
    try {
        interp = new Interpreter(code, createMagicInitFunc(entity));
    } catch (e) {
        console.error('[Magic System] Failed to parse student code:', e.message);
        return;
    }

    function nextStep() {
        try {
            if (interp.run()) {
                // Interpreter has more to do.
                // Either running sync code, or waiting for async callback.
                // Poll again shortly.
                console.log('interrupted')
                setTimeout(nextStep, 10);
            } else {
                console.log('[Magic System] Student code finished.');
            }
        } catch (e) {
            console.error('[Magic System] Runtime error in student code:', e.message);
        }
    }

    console.log('[Magic System] Running...');
    nextStep();
}


// Expose to console
window.runStudentCode = (code) => executeStudentCode(code, player);

// Convenience: run a multiline template literal directly
window.runMagic = (strings, ...values) => {
    const code = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
    executeStudentCode(code, player);
};
