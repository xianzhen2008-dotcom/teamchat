/**
 * Mention Module - @提及菜单
 * 输入 @ 时弹出 Agent 选择菜单
 */

import { stateManager } from '../../core/state.js';
import { eventBus } from '../../core/events.js';
import { $, on, off, addClass, removeClass, createElement } from '../../utils/dom.js';

class MentionModule {
    constructor() {
        this.menu = null;
        this.input = null;
        this.visible = false;
        this.selectedIndex = 0;
        this.filteredAgents = [];
        this.initialized = false;
    }

    init(options = {}) {
        this.input = options.input || $('#chat-input');
        this.menu = options.menu || $('#mention-menu');
        
        if (!this.input) {
            console.warn('[Mention] Input not found');
            return this;
        }

        this.createMenuIfNeeded();
        this.bindEvents();
        this.initialized = true;

        return this;
    }

    createMenuIfNeeded() {
        if (!this.menu) {
            this.menu = createElement('div', {
                id: 'mention-menu',
                className: 'mention-menu'
            });
            this.menu.style.display = 'none';
            // 将菜单添加到 body，避免被父元素裁剪
            document.body.appendChild(this.menu);
        }
    }

    bindEvents() {
        if (this.input) {
            on(this.input, 'input', this.handleInput.bind(this));
            on(this.input, 'keydown', this.handleKeydown.bind(this));
        }

        if (this.menu) {
            this.menu.addEventListener('click', (e) => {
                const item = e.target.closest('.mention-item');
                if (item) {
                    this.handleItemClick(e);
                }
            });
        }
    }

    handleInput(e) {
        const value = this.input.value;
        const cursorPos = this.input.selectionStart;
        
        const lastAtIndex = value.lastIndexOf('@', cursorPos - 1);
        
        if (lastAtIndex !== -1) {
            const searchText = value.slice(lastAtIndex + 1, cursorPos).toLowerCase();
            
            if (!searchText.includes(' ') && !searchText.includes('\n')) {
                this.show(lastAtIndex, searchText);
                return;
            }
        }
        
        this.hide();
    }

    handleKeydown(e) {
        if (!this.visible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectNext();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectPrev();
                break;
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                this.insertSelected();
                break;
            case 'Escape':
                e.preventDefault();
                this.hide();
                break;
        }
    }

    handleItemClick(e) {
        const item = e.target.closest('.mention-item');
        if (item) {
            const agentId = item.dataset.agentId;
            this.insertAgent(agentId);
        }
    }

    show(atIndex, searchText = '') {
        const agents = stateManager.getState('agents') || [];
        
        this.filteredAgents = agents.filter(agent => 
            agent.name.toLowerCase().includes(searchText)
        );

        if (this.filteredAgents.length === 0) {
            this.hide();
            return;
        }

        this.atIndex = atIndex;
        this.selectedIndex = 0;
        this.render();
        
        // 定位菜单在输入框上方
        if (this.input) {
            const rect = this.input.getBoundingClientRect();
            this.menu.style.position = 'fixed';
            this.menu.style.bottom = 'auto';
            this.menu.style.left = rect.left + 'px';
            this.menu.style.top = (rect.top - Math.min(200, 40 + this.filteredAgents.length * 50)) + 'px';
            this.menu.style.width = '200px';
        }
        
        this.menu.style.display = 'flex';
        this.visible = true;
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        this.visible = false;
    }

    render() {
        if (!this.menu) return;

        this.menu.innerHTML = this.filteredAgents.map((agent, idx) => `
            <div class="mention-item ${idx === this.selectedIndex ? 'selected' : ''}" 
                 data-agent-id="${agent.agentId}">
                <div class="mention-item-avatar" style="background-image: url('/images/${agent.img}')"></div>
                <div class="mention-info">
                    <div class="mention-name">${agent.name}</div>
                    <div class="mention-role">${agent.role || ''}</div>
                </div>
            </div>
        `).join('');
    }

    selectNext() {
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredAgents.length;
        this.render();
    }

    selectPrev() {
        this.selectedIndex = (this.selectedIndex - 1 + this.filteredAgents.length) % this.filteredAgents.length;
        this.render();
    }

    insertSelected() {
        if (this.filteredAgents[this.selectedIndex]) {
            this.insertAgent(this.filteredAgents[this.selectedIndex].agentId);
        }
    }

    insertAgent(agentId) {
        const agents = stateManager.getState('agents') || [];
        const agent = agents.find(a => a.agentId === agentId);
        
        if (!agent || !this.input) return;

        const value = this.input.value;
        const cursorPos = this.input.selectionStart;
        const before = value.slice(0, this.atIndex);
        const after = value.slice(cursorPos);
        
        this.input.value = before + '@' + agent.name + ' ' + after;
        
        const newPos = before.length + agent.name.length + 2;
        this.input.setSelectionRange(newPos, newPos);
        this.input.focus();
        
        this.hide();
        
        eventBus.emit('mention:inserted', agent);
    }

    destroy() {
        this.hide();
        this.initialized = false;
    }
}

export const mentionModule = new MentionModule();
export default mentionModule;
