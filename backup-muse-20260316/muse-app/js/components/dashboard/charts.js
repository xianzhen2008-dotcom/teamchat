const COLORS = {
    primary: '#0A84FF',
    secondary: '#00D4FF',
    success: '#00C853',
    warning: '#FFAB00',
    danger: '#FF3D00',
    info: '#00BCD4',
    purple: '#9C27B0',
    pink: '#E91E63'
};

const CHART_COLORS = [
    COLORS.primary,
    COLORS.secondary,
    COLORS.success,
    COLORS.warning,
    COLORS.danger,
    COLORS.info,
    COLORS.purple,
    COLORS.pink
];

class BaseChart {
    constructor(options = {}) {
        this.id = options.id || `chart-${Date.now()}`;
        this.width = options.width || 400;
        this.height = options.height || 300;
        this.padding = options.padding || { top: 20, right: 20, bottom: 40, left: 50 };
        this.animated = options.animated !== false;
        this.animationDuration = options.animationDuration || 1000;
        this.element = null;
        this.canvas = null;
        this.ctx = null;
        this.data = [];
        this.animationProgress = 0;
        this.animationFrame = null;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'chart-container';
        container.id = this.id;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width * window.devicePixelRatio;
        this.canvas.height = this.height * window.devicePixelRatio;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        container.appendChild(this.canvas);
        this.element = container;

        return container;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    animate(callback) {
        if (!this.animated) {
            callback(1);
            return;
        }

        const startTime = performance.now();
        const duration = this.animationDuration;

        const tick = (currentTime) => {
            const elapsed = currentTime - startTime;
            this.animationProgress = Math.min(elapsed / duration, 1);
            const easedProgress = this.easeOutCubic(this.animationProgress);

            callback(easedProgress);

            if (this.animationProgress < 1) {
                this.animationFrame = requestAnimationFrame(tick);
            }
        };

        this.animationFrame = requestAnimationFrame(tick);
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        if (this.canvas) {
            this.canvas.width = width * window.devicePixelRatio;
            this.canvas.height = height * window.devicePixelRatio;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
            this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        }
    }

    destroy() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

class LineChart extends BaseChart {
    constructor(options = {}) {
        super(options);
        this.data = options.data || [];
        this.labels = options.labels || [];
        this.lineColor = options.lineColor || COLORS.primary;
        this.fillColor = options.fillColor || `${COLORS.primary}33`;
        this.lineWidth = options.lineWidth || 2;
        this.showDots = options.showDots !== false;
        this.showGrid = options.showGrid !== false;
        this.smooth = options.smooth !== false;
        this.showLabels = options.showLabels !== false;
    }

    setData(data, labels) {
        this.data = data;
        this.labels = labels || this.labels;
        this.draw();
    }

    render() {
        const container = super.render();
        container.classList.add('chart-container--line');
        this.draw();
        return container;
    }

    draw() {
        this.clear();
        const { top, right, bottom, left } = this.padding;
        const chartWidth = this.width - left - right;
        const chartHeight = this.height - top - bottom;

        if (this.showGrid) {
            this.drawGrid(left, top, chartWidth, chartHeight);
        }

        if (this.showLabels) {
            this.drawLabels(left, top, chartWidth, chartHeight);
        }

        this.animate((progress) => {
            this.clear();
            if (this.showGrid) {
                this.drawGrid(left, top, chartWidth, chartHeight);
            }
            if (this.showLabels) {
                this.drawLabels(left, top, chartWidth, chartHeight);
            }
            this.drawLine(left, top, chartWidth, chartHeight, progress);
        });
    }

    drawGrid(left, top, chartWidth, chartHeight) {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = top + (chartHeight / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(left + chartWidth, y);
            ctx.stroke();
        }
    }

    drawLabels(left, top, chartWidth, chartHeight) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';

        if (this.labels.length > 0) {
            const step = chartWidth / (this.labels.length - 1);
            this.labels.forEach((label, i) => {
                const x = left + step * i;
                ctx.fillText(label, x, this.height - 10);
            });
        }

        const maxValue = Math.max(...this.data, 1);
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const value = Math.round((maxValue / 5) * (5 - i));
            const y = top + (chartHeight / 5) * i;
            ctx.fillText(value.toString(), left - 10, y + 4);
        }
    }

    drawLine(left, top, chartWidth, chartHeight, progress) {
        if (this.data.length === 0) return;

        const ctx = this.ctx;
        const maxValue = Math.max(...this.data, 1);
        const step = chartWidth / (this.data.length - 1);

        const points = this.data.map((value, i) => ({
            x: left + step * i,
            y: top + chartHeight - (value / maxValue) * chartHeight * progress
        }));

        ctx.beginPath();
        ctx.strokeStyle = this.lineColor;
        ctx.lineWidth = this.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this.smooth && points.length > 2) {
            this.drawSmoothLine(points);
        } else {
            points.forEach((point, i) => {
                if (i === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });
        }

        ctx.stroke();

        const gradient = ctx.createLinearGradient(0, top, 0, top + chartHeight);
        gradient.addColorStop(0, this.fillColor);
        gradient.addColorStop(1, 'transparent');

        ctx.lineTo(points[points.length - 1].x, top + chartHeight);
        ctx.lineTo(points[0].x, top + chartHeight);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        if (this.showDots) {
            points.forEach((point) => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = this.lineColor;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#0D0D0D';
                ctx.fill();
            });
        }
    }

    drawSmoothLine(points) {
        const ctx = this.ctx;
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }

        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    }
}

class DonutChart extends BaseChart {
    constructor(options = {}) {
        super(options);
        this.data = options.data || [];
        this.labels = options.labels || [];
        this.colors = options.colors || CHART_COLORS;
        this.innerRadius = options.innerRadius || 0.6;
        this.showLabels = options.showLabels !== false;
        this.showCenter = options.showCenter !== false;
        this.centerText = options.centerText || '';
        this.centerValue = options.centerValue || '';
    }

    setData(data, labels) {
        this.data = data;
        this.labels = labels || this.labels;
        this.draw();
    }

    render() {
        const container = super.render();
        container.classList.add('chart-container--donut');
        this.draw();
        return container;
    }

    draw() {
        this.clear();
        this.animate((progress) => {
            this.drawDonut(progress);
        });
    }

    drawDonut(progress) {
        const ctx = this.ctx;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) / 2 - 20;
        const innerRadius = radius * this.innerRadius;

        const total = this.data.reduce((sum, value) => sum + value, 0);
        if (total === 0) return;

        let startAngle = -Math.PI / 2;

        this.data.forEach((value, i) => {
            const sliceAngle = (value / total) * Math.PI * 2 * progress;
            const endAngle = startAngle + sliceAngle;

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
            ctx.closePath();

            ctx.fillStyle = this.colors[i % this.colors.length];
            ctx.fill();

            if (this.showLabels && progress === 1) {
                const midAngle = startAngle + sliceAngle / 2;
                const labelRadius = radius + 15;
                const labelX = centerX + Math.cos(midAngle) * labelRadius;
                const labelY = centerY + Math.sin(midAngle) * labelRadius;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.textAlign = midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5 ? 'right' : 'left';
                ctx.fillText(this.labels[i] || '', labelX, labelY);
            }

            startAngle = endAngle;
        });

        if (this.showCenter) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.centerValue || total.toString(), centerX, centerY - 8);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillText(this.centerText, centerX, centerY + 14);
        }
    }
}

class ProgressBarChart extends BaseChart {
    constructor(options = {}) {
        super(options);
        this.data = options.data || [];
        this.labels = options.labels || [];
        this.colors = options.colors || CHART_COLORS;
        this.barHeight = options.barHeight || 24;
        this.barGap = options.barGap || 12;
        this.showValues = options.showValues !== false;
        this.showPercentage = options.showPercentage !== false;
    }

    setData(data, labels) {
        this.data = data;
        this.labels = labels || this.labels;
        this.draw();
    }

    render() {
        const container = super.render();
        container.classList.add('chart-container--progress');
        this.draw();
        return container;
    }

    draw() {
        this.clear();
        this.animate((progress) => {
            this.drawBars(progress);
        });
    }

    drawBars(progress) {
        const ctx = this.ctx;
        const { left, right } = this.padding;
        const chartWidth = this.width - left - right;
        const maxValue = Math.max(...this.data.map(d => d.value || d), 1);

        let y = this.padding.top;

        this.data.forEach((item, i) => {
            const value = item.value || item;
            const label = item.label || this.labels[i] || '';
            const color = item.color || this.colors[i % this.colors.length];
            const barWidth = (value / maxValue) * chartWidth * progress;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(label, left, y + 16);

            const barY = y + 24;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.roundRect(left, barY, chartWidth, this.barHeight, 4);
            ctx.fill();

            if (barWidth > 0) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.roundRect(left, barY, Math.max(barWidth, 8), this.barHeight, 4);
                ctx.fill();
            }

            if (this.showValues && progress === 1) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
                ctx.textAlign = 'right';

                const valueText = this.showPercentage
                    ? `${Math.round((value / maxValue) * 100)}%`
                    : value.toString();
                ctx.fillText(valueText, left + chartWidth - 8, barY + this.barHeight / 2 + 4);
            }

            y += this.barHeight + this.barGap + 24;
        });
    }
}

class HeatmapChart extends BaseChart {
    constructor(options = {}) {
        super(options);
        this.data = options.data || [];
        this.cellSize = options.cellSize || 16;
        this.cellGap = options.cellGap || 3;
        this.days = options.days || 7;
        this.hours = options.hours || 24;
        this.colorScale = options.colorScale || [
            'rgba(10, 132, 255, 0.1)',
            'rgba(10, 132, 255, 0.3)',
            'rgba(10, 132, 255, 0.5)',
            'rgba(10, 132, 255, 0.7)',
            'rgba(10, 132, 255, 0.9)'
        ];
        this.showAxis = options.showAxis !== false;
    }

    setData(data) {
        this.data = data;
        this.draw();
    }

    render() {
        const container = super.render();
        container.classList.add('chart-container--heatmap');
        this.draw();
        return container;
    }

    draw() {
        this.clear();
        this.animate((progress) => {
            this.drawHeatmap(progress);
        });
    }

    drawHeatmap(progress) {
        const ctx = this.ctx;
        const startX = this.padding.left;
        const startY = this.padding.top;

        if (this.showAxis) {
            this.drawAxis(startX, startY);
        }

        const maxValue = Math.max(...this.data.flat(), 1);

        for (let day = 0; day < this.days; day++) {
            for (let hour = 0; hour < this.hours; hour++) {
                const value = this.data[day]?.[hour] || 0;
                const normalizedValue = value / maxValue;
                const colorIndex = Math.min(
                    Math.floor(normalizedValue * this.colorScale.length),
                    this.colorScale.length - 1
                );

                const x = startX + hour * (this.cellSize + this.cellGap);
                const y = startY + day * (this.cellSize + this.cellGap);

                ctx.globalAlpha = progress;
                ctx.fillStyle = this.colorScale[colorIndex];
                ctx.beginPath();
                ctx.roundRect(x, y, this.cellSize, this.cellSize, 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
    }

    drawAxis(startX, startY) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';

        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        dayLabels.forEach((label, i) => {
            ctx.textAlign = 'right';
            ctx.fillText(
                label,
                startX - 8,
                startY + i * (this.cellSize + this.cellGap) + this.cellSize / 2 + 3
            );
        });

        const hourLabels = [0, 6, 12, 18, 23];
        hourLabels.forEach((hour) => {
            ctx.textAlign = 'center';
            ctx.fillText(
                `${hour}:00`,
                startX + hour * (this.cellSize + this.cellGap) + this.cellSize / 2,
                startY + this.days * (this.cellSize + this.cellGap) + 16
            );
        });
    }
}

class ChartPanel {
    constructor(options = {}) {
        this.id = options.id || `chart-panel-${Date.now()}`;
        this.title = options.title || '';
        this.chart = null;
        this.element = null;
        this.loading = false;
    }

    setChart(chart) {
        this.chart = chart;
        if (this.element) {
            const body = this.element.querySelector('.chart-panel__body');
            if (body) {
                body.innerHTML = '';
                body.appendChild(chart.render());
            }
        }
    }

    render() {
        const panel = document.createElement('div');
        panel.className = 'chart-panel card-glass';
        panel.id = this.id;

        panel.innerHTML = `
            <div class="chart-panel__header">
                <h3 class="chart-panel__title">${this.title}</h3>
            </div>
            <div class="chart-panel__body">
                ${this.loading ? this.renderSkeleton() : ''}
            </div>
        `;

        this.element = panel;

        if (this.chart && !this.loading) {
            const body = panel.querySelector('.chart-panel__body');
            body.appendChild(this.chart.render());
        }

        return panel;
    }

    renderSkeleton() {
        return `
            <div class="chart-skeleton">
                <div class="skeleton skeleton-card" style="height: 200px;"></div>
            </div>
        `;
    }

    setLoading(loading) {
        this.loading = loading;
        if (this.element) {
            const body = this.element.querySelector('.chart-panel__body');
            if (body) {
                body.innerHTML = loading ? this.renderSkeleton() : '';
                if (!loading && this.chart) {
                    body.appendChild(this.chart.render());
                }
            }
        }
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
        }
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}

function createActivityTrendChart(data) {
    const chart = new LineChart({
        width: 400,
        height: 200,
        data: data?.values || [12, 19, 3, 5, 2, 3, 15, 22, 18, 25, 30, 28],
        labels: data?.labels || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        lineColor: COLORS.primary,
        smooth: true
    });

    const panel = new ChartPanel({
        title: '活动趋势',
        id: 'activity-trend-panel'
    });

    panel.setChart(chart);

    return { chart, panel };
}

function createStorageDonutChart(data) {
    const chart = new DonutChart({
        width: 200,
        height: 200,
        data: data?.values || [2.4, 3.2, 1.5, 2.9],
        labels: data?.labels || ['文档', '图片', '视频', '其他'],
        centerText: '总存储',
        centerValue: '10 GB',
        innerRadius: 0.65
    });

    const panel = new ChartPanel({
        title: '存储使用',
        id: 'storage-donut-panel'
    });

    panel.setChart(chart);

    return { chart, panel };
}

function createTaskProgressChart(data) {
    const chart = new ProgressBarChart({
        width: 350,
        height: 200,
        data: data || [
            { label: '已完成', value: 45, color: COLORS.success },
            { label: '进行中', value: 30, color: COLORS.primary },
            { label: '待处理', value: 15, color: COLORS.warning },
            { label: '已取消', value: 10, color: COLORS.danger }
        ],
        showPercentage: true
    });

    const panel = new ChartPanel({
        title: '任务完成率',
        id: 'task-progress-panel'
    });

    panel.setChart(chart);

    return { chart, panel };
}

function createWeeklyHeatmapChart(data) {
    const chart = new HeatmapChart({
        width: 500,
        height: 180,
        data: data || generateRandomHeatmapData(),
        days: 7,
        hours: 24,
        cellSize: 14,
        cellGap: 2
    });

    const panel = new ChartPanel({
        title: '每周活动热力图',
        id: 'weekly-heatmap-panel'
    });

    panel.setChart(chart);

    return { chart, panel };
}

function generateRandomHeatmapData() {
    const data = [];
    for (let day = 0; day < 7; day++) {
        const dayData = [];
        for (let hour = 0; hour < 24; hour++) {
            const baseValue = (hour >= 9 && hour <= 18) ? 0.5 : 0.1;
            dayData.push(Math.random() * baseValue + (day < 5 ? 0.3 : 0));
        }
        data.push(dayData);
    }
    return data;
}

function injectStyles() {
    if (document.getElementById('chart-styles')) return;

    const style = document.createElement('style');
    style.id = 'chart-styles';
    style.textContent = `
        .chart-container {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .chart-container canvas {
            display: block;
        }

        .chart-panel {
            padding: var(--spacing-lg);
            border-radius: var(--radius-lg);
            background: var(--bg-glass);
            backdrop-filter: blur(var(--blur-lg));
            -webkit-backdrop-filter: blur(var(--blur-lg));
            border: 1px solid var(--border-primary);
            box-shadow: var(--shadow-glass);
        }

        .chart-panel__header {
            margin-bottom: var(--spacing-md);
            padding-bottom: var(--spacing-md);
            border-bottom: 1px solid var(--border-primary);
        }

        .chart-panel__title {
            font-size: var(--font-size-lg);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            margin: 0;
        }

        .chart-panel__body {
            min-height: 150px;
        }

        .chart-skeleton {
            padding: var(--spacing-md);
        }

        .chart-legend {
            display: flex;
            flex-wrap: wrap;
            gap: var(--spacing-sm) var(--spacing-lg);
            margin-top: var(--spacing-md);
            padding-top: var(--spacing-md);
            border-top: 1px solid var(--border-primary);
        }

        .chart-legend-item {
            display: flex;
            align-items: center;
            gap: var(--spacing-xs);
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
        }

        .chart-legend-dot {
            width: 8px;
            height: 8px;
            border-radius: var(--radius-full);
        }

        @media (max-width: 640px) {
            .chart-container canvas {
                max-width: 100%;
                height: auto !important;
            }
        }
    `;

    document.head.appendChild(style);
}

injectStyles();

export {
    BaseChart,
    LineChart,
    DonutChart,
    ProgressBarChart,
    HeatmapChart,
    ChartPanel,
    COLORS,
    CHART_COLORS,
    createActivityTrendChart,
    createStorageDonutChart,
    createTaskProgressChart,
    createWeeklyHeatmapChart
};
