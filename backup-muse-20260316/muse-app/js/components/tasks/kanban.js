import { TaskCard } from './card.js';
import { emit, on } from '../../events.js';

const COLUMNS = [
  { id: 'pending', title: '待处理', status: 'pending' },
  { id: 'in-progress', title: '进行中', status: 'in-progress' },
  { id: 'completed', title: '已完成', status: 'completed' },
  { id: 'cancelled', title: '已取消', status: 'cancelled' }
];

class TaskKanban {
  constructor(tasks = [], options = {}) {
    this.tasks = tasks;
    this.options = {
      onTaskEdit: null,
      onTaskDelete: null,
      onTaskClick: null,
      onTaskMove: null,
      onTaskCreate: null,
      ...options
    };
    this.element = null;
    this.columns = {};
    this.taskCards = new Map();
    this.draggedTask = null;
    this.draggedElement = null;
    this.placeholder = null;
  }

  render() {
    this.element = document.createElement('div');
    this.element.className = 'task-kanban';

    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'task-kanban-columns';

    COLUMNS.forEach(column => {
      const columnElement = this.createColumn(column);
      this.columns[column.id] = columnElement;
      columnsContainer.appendChild(columnElement);
    });

    this.element.appendChild(columnsContainer);
    this.renderTasks();

    this.bindEvents();
    return this.element;
  }

  createColumn(column) {
    const columnElement = document.createElement('div');
    columnElement.className = 'task-kanban-column';
    columnElement.setAttribute('data-column-id', column.id);
    columnElement.setAttribute('data-status', column.status);

    const tasks = this.getTasksByStatus(column.status);

    columnElement.innerHTML = `
      <div class="task-kanban-column-header">
        <div class="task-kanban-column-title">
          <h3>${column.title}</h3>
          <span class="task-kanban-column-count">${tasks.length}</span>
        </div>
        <button class="btn btn-ghost btn-icon btn-sm task-kanban-add-btn" aria-label="添加任务">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      <div class="task-kanban-column-body">
        <div class="task-kanban-tasks"></div>
      </div>
    `;

    const addBtn = columnElement.querySelector('.task-kanban-add-btn');
    addBtn.addEventListener('click', () => {
      if (this.options.onTaskCreate) {
        this.options.onTaskCreate(column.status);
      }
      emit('task:create', { status: column.status });
    });

    this.setupDropZone(columnElement);

    return columnElement;
  }

  setupDropZone(columnElement) {
    const tasksContainer = columnElement.querySelector('.task-kanban-tasks');

    columnElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      columnElement.classList.add('drag-over');

      const afterElement = this.getDragAfterElement(tasksContainer, e.clientY);
      if (this.placeholder) {
        if (afterElement == null) {
          tasksContainer.appendChild(this.placeholder);
        } else {
          tasksContainer.insertBefore(this.placeholder, afterElement);
        }
      }
    });

    columnElement.addEventListener('dragleave', (e) => {
      if (!columnElement.contains(e.relatedTarget)) {
        columnElement.classList.remove('drag-over');
        if (this.placeholder && this.placeholder.parentNode) {
          this.placeholder.parentNode.removeChild(this.placeholder);
        }
      }
    });

    columnElement.addEventListener('drop', (e) => {
      e.preventDefault();
      columnElement.classList.remove('drag-over');

      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.parentNode.removeChild(this.placeholder);
      }

      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = columnElement.getAttribute('data-status');

      if (this.draggedTask && this.draggedTask.status !== newStatus) {
        this.moveTask(this.draggedTask.id, newStatus);
      }
    });
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  createPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'task-card-placeholder';
    placeholder.innerHTML = '<div class="task-card-placeholder-inner"></div>';
    return placeholder;
  }

  renderTasks() {
    Object.values(this.columns).forEach(columnElement => {
      const tasksContainer = columnElement.querySelector('.task-kanban-tasks');
      const status = columnElement.getAttribute('data-status');
      const tasks = this.getTasksByStatus(status);

      tasksContainer.innerHTML = '';
      tasks.forEach(task => {
        const taskCard = new TaskCard(task, {
          onEdit: this.options.onTaskEdit,
          onDelete: this.options.onTaskDelete,
          onClick: this.options.onTaskClick,
          onDragStart: (task, e) => {
            this.draggedTask = task;
            this.draggedElement = e.target;
            this.placeholder = this.createPlaceholder();
          },
          onDragEnd: (task, e) => {
            this.draggedTask = null;
            this.draggedElement = null;
            if (this.placeholder && this.placeholder.parentNode) {
              this.placeholder.parentNode.removeChild(this.placeholder);
            }
            this.placeholder = null;
          }
        });

        const cardElement = taskCard.render();
        tasksContainer.appendChild(cardElement);
        this.taskCards.set(task.id, taskCard);
      });
    });

    this.updateColumnCounts();
  }

  getTasksByStatus(status) {
    return this.tasks.filter(task => task.status === status);
  }

  updateColumnCounts() {
    COLUMNS.forEach(column => {
      const columnElement = this.columns[column.id];
      if (columnElement) {
        const countElement = columnElement.querySelector('.task-kanban-column-count');
        const tasks = this.getTasksByStatus(column.status);
        countElement.textContent = tasks.length;
      }
    });
  }

  moveTask(taskId, newStatus) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const oldStatus = task.status;
    task.status = newStatus;

    const taskCard = this.taskCards.get(taskId);
    if (taskCard) {
      taskCard.update(task);
    }

    this.reorderTasks();

    if (this.options.onTaskMove) {
      this.options.onTaskMove(task, oldStatus, newStatus);
    }
    emit('task:move', { task, oldStatus, newStatus });
  }

  reorderTasks() {
    this.renderTasks();
  }

  addTask(task) {
    this.tasks.push(task);
    this.renderTasks();
  }

  updateTask(taskId, updates) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      const taskCard = this.taskCards.get(taskId);
      if (taskCard) {
        taskCard.update(task);
      }
      this.updateColumnCounts();
    }
  }

  removeTask(taskId) {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index > -1) {
      this.tasks.splice(index, 1);
      const taskCard = this.taskCards.get(taskId);
      if (taskCard) {
        taskCard.destroy();
        this.taskCards.delete(taskId);
      }
      this.updateColumnCounts();
    }
  }

  setTasks(tasks) {
    this.tasks = tasks;
    this.renderTasks();
  }

  bindEvents() {
    on('task:created', (data) => {
      this.addTask(data.task);
    });

    on('task:updated', (data) => {
      this.updateTask(data.task.id, data.task);
    });

    on('task:deleted', (data) => {
      this.removeTask(data.taskId);
    });
  }

  destroy() {
    this.taskCards.forEach(card => card.destroy());
    this.taskCards.clear();
    this.element.remove();
  }
}

export { TaskKanban, COLUMNS };
