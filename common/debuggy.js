(function (global) {
    'use strict';

    const DEBUGGY_WORKER_URL = 'https://debuggy.kuziavra.workers.dev';
    const DEBUGGY_STYLE_ID = 'debuggy-assistant-runtime-style';

    function isFn(value) {
        return typeof value === 'function';
    }

    async function fetchDebuggyHelp(state_before, player_code, execution_trace, deduction_tree, active_node) {
        const stateData = { state_before, player_code, execution_trace, deduction_tree, active_node };

        try {
            const res = await fetch(DEBUGGY_WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(stateData)
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Debuggy request failed (${res.status}): ${text}`);
            }

            return await res.json();
        } catch (error) {
            console.error('[debuggy] Error calling AI:', error);
            throw error;
        }
    }

    function getDebuggyMessageContent(data) {
        return String(data?.choices?.[0]?.message?.content || '');
    }

    function parseDebuggyTaggedItems(messageContent) {
        const items = [];
        const text = String(messageContent || '');
        const tagRegex = /<(clue|question)>([\s\S]*?)<\/\1>/gi;
        let match = tagRegex.exec(text);
        while (match) {
            const type = String(match[1] || '').toLowerCase();
            const itemText = String(match[2] || '').trim();
            if ((type === 'clue' || type === 'question') && itemText) {
                items.push({ type, text: itemText });
            }
            match = tagRegex.exec(text);
        }
        return items;
    }

    function ensureDebuggyStyles() {
        if (document.getElementById(DEBUGGY_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = DEBUGGY_STYLE_ID;
        style.textContent = `
.debuggy-assistant {
    position: fixed;
    right: 16px;
    bottom: 14px;
    width: min(440px, calc(100vw - 18px));
    max-height: min(62vh, 620px);
    z-index: 220;
    color: #1f150e;
    font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
    display: none;
}

.debuggy-assistant.debuggy-visible {
    display: block;
}

.debuggy-shell {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.debuggy-avatar {
    font-size: 36px;
    line-height: 1;
    transform: translateY(8px);
}

.debuggy-bubble {
    position: relative;
    flex: 1;
    border: 2px solid #5b432f;
    border-radius: 12px;
    background: linear-gradient(180deg, #fff8df 0%, #f6e7be 100%);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.33);
    padding: 10px;
    overflow: hidden;
}

.debuggy-bubble::after {
    content: '';
    position: absolute;
    right: 10px;
    bottom: -11px;
    width: 16px;
    height: 16px;
    background: #f6e7be;
    border-left: 2px solid #5b432f;
    border-bottom: 2px solid #5b432f;
    transform: rotate(-45deg);
}

.debuggy-header {
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 700;
    color: #4f2b0f;
}

.debuggy-status {
    margin-bottom: 8px;
    min-height: 20px;
    font-size: 13px;
    color: #5f4636;
}

.debuggy-status.error {
    color: #7a1f1f;
}

.debuggy-tree {
    max-height: min(42vh, 420px);
    overflow: auto;
    padding-right: 6px;
}

.debuggy-tree.is-loading {
    pointer-events: none;
    opacity: 0.65;
}

.debuggy-empty {
    font-size: 13px;
    color: #6e5848;
    padding: 6px 4px;
}

.debuggy-node-wrap {
    margin: 4px 0;
}

.debuggy-node {
    display: block;
    width: 100%;
    text-align: left;
    border: 1px solid #87604b;
    border-radius: 8px;
    padding: 6px 8px;
    background: #fff9ea;
    color: #2e1c10;
    font-size: 13px;
    line-height: 1.28;
    cursor: pointer;
}

.debuggy-node:hover {
    background: #fff3cf;
}

.debuggy-node:disabled {
    cursor: not-allowed;
}

.debuggy-node.selected {
    outline: 2px solid rgba(206, 144, 52, 0.5);
    outline-offset: 1px;
}

.debuggy-node.clue {
    border-color: #4f7055;
    background: #edf9f0;
}

.debuggy-node.question {
    border-color: #3d5778;
    background: #edf4ff;
}

.debuggy-node-label {
    display: inline;
    margin-right: 6px;
    font-weight: 700;
}

.debuggy-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
}

.debuggy-action-btn {
    border: 1px solid #805a34;
    border-radius: 6px;
    background: #fff8e9;
    color: #3c2514;
    padding: 4px 6px;
    font-size: 12px;
    cursor: pointer;
}

.debuggy-action-btn:hover {
    background: #ffefc8;
}

.debuggy-action-btn:disabled {
    cursor: not-allowed;
}

.debuggy-composer {
    margin-top: 8px;
    display: grid;
    gap: 6px;
}

.debuggy-composer textarea {
    resize: vertical;
    min-height: 56px;
    border: 1px solid #86664a;
    border-radius: 6px;
    padding: 6px 8px;
    background: #fffcf4;
    color: #2a1a0f;
    font-size: 13px;
    font-family: inherit;
}

.debuggy-composer-actions {
    display: flex;
    gap: 6px;
}

.debuggy-primary-btn,
.debuggy-secondary-btn {
    border: 1px solid #765839;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
}

.debuggy-primary-btn {
    background: #fff1cc;
    color: #3d2917;
}

.debuggy-secondary-btn {
    background: #f5eee2;
    color: #4a3423;
}

.debuggy-primary-btn:disabled,
.debuggy-secondary-btn:disabled {
    cursor: not-allowed;
}

@media (max-width: 760px) {
    .debuggy-assistant {
        right: 8px;
        bottom: 8px;
        width: min(97vw, 440px);
    }

    .debuggy-bubble {
        padding: 8px;
    }

    .debuggy-tree {
        max-height: min(36vh, 330px);
    }
}
`;
        document.head.appendChild(style);
    }

    class DebuggyAssistant {
        constructor(options) {
            const opts = options || {};
            this.fetcher = isFn(opts.fetcher) ? opts.fetcher : fetchDebuggyHelp;
            this.container = opts.container || document.body;
            this.visible = false;
            this.loading = false;
            this.tree = [];
            this.nextNodeId = 1;
            this.selectedNodeId = null;
            this.composerState = null;
            this.lastCodeStateKey = null;
            this.sessionContext = {
                stateBefore: null,
                playerCode: '',
                executionTrace: null
            };

            ensureDebuggyStyles();
            this.mount();
            this.render();
        }

        mount() {
            const root = document.createElement('section');
            root.className = 'debuggy-assistant';
            root.setAttribute('aria-live', 'polite');

            const shell = document.createElement('div');
            shell.className = 'debuggy-shell';

            const avatar = document.createElement('div');
            avatar.className = 'debuggy-avatar';
            avatar.textContent = '🐥';

            const bubble = document.createElement('div');
            bubble.className = 'debuggy-bubble';

            const header = document.createElement('div');
            header.className = 'debuggy-header';
            header.textContent = 'Rubber Ducky Bug Detective';

            const status = document.createElement('div');
            status.className = 'debuggy-status';

            const tree = document.createElement('div');
            tree.className = 'debuggy-tree';

            bubble.appendChild(header);
            bubble.appendChild(status);
            bubble.appendChild(tree);
            shell.appendChild(avatar);
            shell.appendChild(bubble);
            root.appendChild(shell);
            this.container.appendChild(root);

            this.rootEl = root;
            this.statusEl = status;
            this.treeEl = tree;
        }

        setVisible(visible) {
            this.visible = !!visible;
            this.rootEl.classList.toggle('debuggy-visible', this.visible);
        }

        setStatus(text, isError) {
            this.statusText = String(text || '');
            this.statusIsError = !!isError;
            this.renderStatus();
        }

        renderStatus() {
            if (!this.statusEl) return;
            this.statusEl.textContent = this.statusText || '';
            this.statusEl.classList.toggle('error', !!this.statusIsError);
        }

        setLoading(loading, message) {
            this.loading = !!loading;
            this.treeEl.classList.toggle('is-loading', this.loading);
            if (this.loading) {
                this.setStatus(message || '🐥 Looking for more clues...', false);
            }
            this.render();
        }

        getCodeStateKey(playerCode) {
            return String(playerCode || '').trim();
        }

        resetTree() {
            this.tree = [];
            this.selectedNodeId = null;
            this.composerState = null;
            this.nextNodeId = 1;
        }

        ensureNextNodeId() {
            let maxId = 0;
            const walk = (nodes) => {
                for (const node of nodes) {
                    const id = Number(node.id) || 0;
                    if (id > maxId) maxId = id;
                    if (Array.isArray(node.children) && node.children.length > 0) {
                        walk(node.children);
                    }
                }
            };
            walk(this.tree);
            this.nextNodeId = maxId + 1;
        }

        createNode(type, text) {
            const node = {
                type,
                text,
                id: this.nextNodeId,
                children: []
            };
            this.nextNodeId += 1;
            return node;
        }

        findNodeById(id, nodes) {
            const treeNodes = nodes || this.tree;
            for (const node of treeNodes) {
                if (node.id === id) {
                    return node;
                }
                if (Array.isArray(node.children) && node.children.length > 0) {
                    const found = this.findNodeById(id, node.children);
                    if (found) return found;
                }
            }
            return null;
        }

        appendChildrenToParent(parentNode, children) {
            if (!Array.isArray(children) || children.length === 0) return;
            if (!parentNode || !Array.isArray(parentNode.children)) return;
            parentNode.children.push(...children);
        }

        appendAtRoot(nodes) {
            if (!Array.isArray(nodes) || nodes.length === 0) return;
            this.tree.push(...nodes);
        }

        mapItemsToNodes(items) {
            const out = [];
            for (const item of items) {
                if (!item || (item.type !== 'clue' && item.type !== 'question')) continue;
                const text = String(item.text || '').trim();
                if (!text) continue;
                out.push(this.createNode(item.type, text));
            }
            return out;
        }

        getTreeSnapshot() {
            return JSON.parse(JSON.stringify(this.tree));
        }

        async beginAssistance(context) {
            const playerCode = String(context?.playerCode || '');
            const codeKey = this.getCodeStateKey(playerCode);
            const isNewCodeState = codeKey !== this.lastCodeStateKey;
            const requestTree = isNewCodeState ? {} : this.getTreeSnapshot();

            if (isNewCodeState) {
                this.resetTree();
            }

            this.sessionContext = {
                stateBefore: context?.stateBefore,
                playerCode,
                executionTrace: context?.executionTrace || null
            };

            this.lastCodeStateKey = codeKey;
            this.setVisible(true);
            this.setLoading(true, '🐥 Searching for clues...');

            try {
                const data = await this.fetcher(
                    this.sessionContext.stateBefore,
                    this.sessionContext.playerCode,
                    this.sessionContext.executionTrace,
                    requestTree,
                    null
                );

                const content = getDebuggyMessageContent(data);
                const taggedItems = parseDebuggyTaggedItems(content);
                const nodes = this.mapItemsToNodes(taggedItems);

                if (nodes.length === 0) {
                    this.setStatus('🐥 I could not extract clues yet. Try "Get more help" on a node.', true);
                } else if (isNewCodeState || this.tree.length === 0) {
                    this.appendAtRoot(nodes);
                    this.setStatus('🐥 New clues added. Click one to investigate deeper.', false);
                } else {
                    this.appendAtRoot(nodes);
                    this.setStatus('🐥 Added more top-level clues from the latest test.', false);
                }
                this.ensureNextNodeId();
            } catch (error) {
                this.setStatus('🐥 I could not reach the helper endpoint right now.', true);
            } finally {
                this.setLoading(false);
            }
        }

        async requestHelpForNode(activeNode) {
            if (!activeNode) return;
            this.setLoading(true, '🐥 Thinking about that branch...');
            try {
                const data = await this.fetcher(
                    this.sessionContext.stateBefore,
                    this.sessionContext.playerCode,
                    this.sessionContext.executionTrace,
                    this.getTreeSnapshot(),
                    activeNode
                );
                const content = getDebuggyMessageContent(data);
                const taggedItems = parseDebuggyTaggedItems(content);
                const nodes = this.mapItemsToNodes(taggedItems);
                if (nodes.length === 0) {
                    this.setStatus('🐥 No new tagged clues returned for that node.', true);
                } else {
                    this.appendChildrenToParent(activeNode, nodes);
                    this.setStatus('🐥 Added new clues on this branch.', false);
                }
                this.ensureNextNodeId();
            } catch (error) {
                this.setStatus('🐥 I could not fetch more help right now.', true);
            } finally {
                this.setLoading(false);
            }
        }

        async addUserNodeAndRequest(parentNodeId, type, text) {
            const parentNode = this.findNodeById(parentNodeId);
            if (!parentNode) return;

            const normalizedText = String(text || '').trim();
            if (!normalizedText) {
                this.setStatus('Please enter text before adding a node.', true);
                this.render();
                return;
            }

            const newNode = this.createNode(type, normalizedText);
            parentNode.children.push(newNode);
            this.selectedNodeId = newNode.id;
            this.composerState = null;
            this.render();

            await this.requestHelpForNode(newNode);
            this.render();
        }

        handleTreeClick(event) {
            if (this.loading) return;
            const target = event.target && event.target.closest ? event.target.closest('[data-node-id]') : null;
            const nodeIdRaw = target?.dataset?.nodeId;
            if (!nodeIdRaw) return;
            const nodeId = Number(nodeIdRaw);
            if (!Number.isFinite(nodeId)) return;
            this.selectedNodeId = nodeId;
            this.composerState = null;
            this.setStatus('🐥 Choose an action for this clue/question.', false);
            this.render();
        }

        onActionClick(action, nodeId) {
            if (this.loading) return;
            const node = this.findNodeById(nodeId);
            if (!node) return;

            if (action === 'get-help') {
                this.requestHelpForNode(node).then(() => this.render());
                return;
            }

            if (action === 'add-clue' || action === 'add-question') {
                const type = action === 'add-clue' ? 'clue' : 'question';
                this.composerState = { parentNodeId: nodeId, type, text: '' };
                this.setStatus(type === 'clue' ? 'Add your clue and submit.' : 'Add your question and submit.', false);
                this.render();
            }
        }

        onComposerSubmit() {
            if (this.loading || !this.composerState) return;
            const { parentNodeId, type, text } = this.composerState;
            this.addUserNodeAndRequest(parentNodeId, type, text);
        }

        renderNode(node, depth) {
            const wrapper = document.createElement('div');
            wrapper.className = 'debuggy-node-wrap';
            wrapper.style.marginLeft = `${depth * 18}px`;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = `debuggy-node ${node.type}`;
            if (node.id === this.selectedNodeId) {
                button.classList.add('selected');
            }
            button.dataset.nodeId = String(node.id);
            button.disabled = this.loading;

            const label = document.createElement('span');
            label.className = 'debuggy-node-label';
            label.textContent = node.type === 'clue' ? '🔎 Clue' : '❓ Question';

            const textSpan = document.createElement('span');
            textSpan.textContent = `#${node.id}: ${node.text}`;

            button.appendChild(label);
            button.appendChild(textSpan);
            wrapper.appendChild(button);

            if (node.id === this.selectedNodeId) {
                const actions = document.createElement('div');
                actions.className = 'debuggy-actions';

                const addClueBtn = document.createElement('button');
                addClueBtn.type = 'button';
                addClueBtn.className = 'debuggy-action-btn';
                addClueBtn.textContent = '🔎 Add clue';
                addClueBtn.disabled = this.loading;
                addClueBtn.addEventListener('click', () => this.onActionClick('add-clue', node.id));

                const addQuestionBtn = document.createElement('button');
                addQuestionBtn.type = 'button';
                addQuestionBtn.className = 'debuggy-action-btn';
                addQuestionBtn.textContent = '❓ Add question';
                addQuestionBtn.disabled = this.loading;
                addQuestionBtn.addEventListener('click', () => this.onActionClick('add-question', node.id));

                const helpBtn = document.createElement('button');
                helpBtn.type = 'button';
                helpBtn.className = 'debuggy-action-btn';
                helpBtn.textContent = '🐥 Get more help';
                helpBtn.disabled = this.loading;
                helpBtn.addEventListener('click', () => this.onActionClick('get-help', node.id));

                actions.appendChild(addClueBtn);
                actions.appendChild(addQuestionBtn);
                actions.appendChild(helpBtn);
                wrapper.appendChild(actions);

                if (this.composerState && this.composerState.parentNodeId === node.id) {
                    const composer = document.createElement('div');
                    composer.className = 'debuggy-composer';

                    const input = document.createElement('textarea');
                    input.value = this.composerState.text || '';
                    input.placeholder = this.composerState.type === 'clue'
                        ? 'Type your clue...'
                        : 'Type your question...';
                    input.disabled = this.loading;
                    input.addEventListener('input', (event) => {
                        if (!this.composerState) return;
                        this.composerState.text = event.target.value;
                    });

                    const actionRow = document.createElement('div');
                    actionRow.className = 'debuggy-composer-actions';

                    const submitBtn = document.createElement('button');
                    submitBtn.type = 'button';
                    submitBtn.className = 'debuggy-primary-btn';
                    submitBtn.textContent = 'Submit';
                    submitBtn.disabled = this.loading;
                    submitBtn.addEventListener('click', () => this.onComposerSubmit());

                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'debuggy-secondary-btn';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.disabled = this.loading;
                    cancelBtn.addEventListener('click', () => {
                        this.composerState = null;
                        this.render();
                    });

                    actionRow.appendChild(submitBtn);
                    actionRow.appendChild(cancelBtn);
                    composer.appendChild(input);
                    composer.appendChild(actionRow);
                    wrapper.appendChild(composer);
                }
            }

            if (Array.isArray(node.children) && node.children.length > 0) {
                for (const child of node.children) {
                    wrapper.appendChild(this.renderNode(child, depth + 1));
                }
            }

            return wrapper;
        }

        render() {
            if (!this.treeEl) return;

            this.rootEl.classList.toggle('debuggy-visible', this.visible);
            this.renderStatus();

            this.treeEl.innerHTML = '';
            this.treeEl.removeEventListener('click', this.boundTreeClick);
            this.boundTreeClick = (event) => this.handleTreeClick(event);
            this.treeEl.addEventListener('click', this.boundTreeClick);

            if (this.tree.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'debuggy-empty';
                empty.textContent = this.loading
                    ? 'Waiting for initial clues...'
                    : 'Run a failing test or ask for help on a node to build a deduction tree.';
                this.treeEl.appendChild(empty);
                return;
            }

            for (const node of this.tree) {
                this.treeEl.appendChild(this.renderNode(node, 0));
            }
        }
    }

    function createDebuggyAssistant(options) {
        return new DebuggyAssistant(options);
    }

    global.fetchDebuggyHelp = fetchDebuggyHelp;
    global.createDebuggyAssistant = createDebuggyAssistant;
    global.parseDebuggyTaggedItems = parseDebuggyTaggedItems;
})(window);
