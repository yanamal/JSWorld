(function (global) {
    "use strict";

    // Mark the part of `code` that corresponds to `node` with ★s, e.g. "put_out_fire(★100★, 0)"
    function markExecutedCode(code, node) {
        if (node.start === node.end) return code;
        return `${code.slice(0, node.start)}★${code.slice(node.start, node.end)}★${code.slice(node.end)}`;
    }

    // Turn an execution trace into a list of readable steps (e.g. for debuggy):
    // { executedCode, nodeType, producedValue?, exception? }, where executedCode is the whole snippet the step's node is in
    // (the call, or the definition of a function it stepped into), with the node marked by ★s.
    function getReadableTrace(trace, visualInterpreter) {
        return trace.map((step) => {
            const activeNode = step.activeNode;
            const found = activeNode && activeNode.uuid !== undefined ? visualInterpreter.getNode(activeNode.uuid) : null;
            return {
                executedCode: found ? markExecutedCode(found.snippet.code, found.node) : null,
                nodeType: activeNode ? activeNode.nodeType : null,
                ...(step.producedValue != null && { producedValue: step.producedValue }),
                ...(step.exception != null     && { exception: step.exception }),
            };
        });
    }

    /**
     * A spellcaster (the player, Zerro, a lunar lander control unit, ...) with its own persistent interpreter:
     * functions it has learned stay available to all its later casts, and helpers it hasn't learned aren't.
     * initFunc is the JS-Interpreter init function defining what this caster can wield (e.g. the base elemental functions).
     *
     * Learning and casting are queued: one at a time, in order.
     */
    class Caster {
        constructor(name, initFunc) {
            this.name = name;
            // (not global.VisualInterpreter: a top-level class declaration doesn't become a property of window)
            this.visualInterpreter = new VisualInterpreter(initFunc);
            this.casts = []; // cast records, oldest first (see cast())
            this._queue = Promise.resolve();
        }

        _enqueue(fn) {
            const result = this._queue.then(fn);
            this._queue = result.catch(() => {}); // the caller still gets any rejection via result
            return result;
        }

        // Run a parsed definition (e.g. a scroll's function), so that later casts can call it.
        // Running a new version of an existing function redefines it.
        learn(parsed) {
            return this._enqueue(() => this.visualInterpreter.run(parsed, { animTime: 0 }));
        }

        /**
         * Run a parsed call (e.g. parseIntoHTML('put_out_fire(100, 0)')), animating any of its code that is visible.
         * onBeforeRun is called right before the run actually starts (after any queued casts); its result is recorded as stateBefore.
         * Resolves to a cast record (also appended to this.casts):
         * { callText, parsedCall, stateBefore, executionTrace, condensedTrace, readableTrace, exception, value }
         */
        cast(parsedCall, { onBeforeRun = null, animTime = 200 } = {}) {
            return this._enqueue(async () => {
                const stateBefore = onBeforeRun ? onBeforeRun() : null;
                const result = await this.visualInterpreter.run(parsedCall, { animTime });
                const condensedTrace = result.executionTrace.filter(global.getTraceStepFilter());
                const record = {
                    callText: parsedCall.code,
                    parsedCall,
                    stateBefore,
                    executionTrace: result.executionTrace,
                    condensedTrace,
                    readableTrace: getReadableTrace(condensedTrace, this.visualInterpreter),
                    exception: result.exception,
                    value: result.value
                };
                console.log(record.readableTrace);
                this.casts.push(record);
                return record;
            });
        }
    }

    global.Caster = Caster;
}(window));
