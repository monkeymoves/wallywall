function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;
  const parsed = Number.parseInt(value, 16);

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function darkenRgb(rgb, amount) {
  const factor = Math.max(0, Math.min(1, amount));
  return {
    r: Math.round(rgb.r * (1 - factor)),
    g: Math.round(rgb.g * (1 - factor)),
    b: Math.round(rgb.b * (1 - factor)),
  };
}

export class ProblemEditor {
  constructor({ canvas, image, holdButtons }) {
    this.canvas = canvas;
    this.image = image;
    this.holdButtons = holdButtons;
    this.ctx = canvas.getContext('2d');
    this.holds = [];
    this.mode = 'start';
    this.active = false;

    this.holdButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.mode = button.dataset.type;
        this.holdButtons.forEach((candidate) => {
          candidate.classList.toggle('active', candidate === button);
        });
        this.canvas.style.cursor = this.mode === 'delete' ? 'not-allowed' : 'crosshair';
      });
    });

    this.canvas.addEventListener('click', (event) => {
      if (!this.active) return;
      this.handleCanvasClick(event);
    });
  }

  setActive(active) {
    this.active = active;
    this.canvas.style.pointerEvents = active ? 'auto' : 'none';
    this.canvas.style.cursor = active ? (this.mode === 'delete' ? 'not-allowed' : 'crosshair') : 'default';
  }

  setHolds(holds = []) {
    this.holds = holds.map((hold) => ({ ...hold }));
    this.redraw();
  }

  getHolds() {
    return this.holds.map((hold) => ({ ...hold }));
  }

  clear() {
    this.holds = [];
    this.redraw();
  }

  syncCanvasToImage() {
    if (!this.image.naturalWidth || !this.image.clientWidth) return;
    this.canvas.style.width = `${this.image.clientWidth}px`;
    this.canvas.style.height = `${this.image.clientHeight}px`;
    this.canvas.width = this.image.naturalWidth;
    this.canvas.height = this.image.naturalHeight;
    this.redraw();
  }

  handleCanvasClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
    const scale = this.canvas.width / this.canvas.clientWidth;

    if (this.mode === 'delete') {
      let bestDistance = (12 * scale) ** 2;
      let bestIndex = -1;

      this.holds.forEach((hold, index) => {
        const dx = x - hold.xRatio * this.canvas.width;
        const dy = y - hold.yRatio * this.canvas.height;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      if (bestIndex >= 0) {
        this.holds.splice(bestIndex, 1);
      }
    } else {
      this.holds.push({
        xRatio: x / this.canvas.width,
        yRatio: y / this.canvas.height,
        type: this.mode,
      });
    }

    this.redraw();
  }

  redraw() {
    if (!this.ctx || !this.canvas.width || !this.canvas.clientWidth) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const scale = this.canvas.width / this.canvas.clientWidth;
    const colors = {
      start: cssVar('--start-c'),
      hold: cssVar('--hold-c'),
      finish: cssVar('--finish-c'),
    };

    let sequence = 1;
    this.holds.forEach((hold) => {
      const cx = hold.xRatio * this.canvas.width;
      const cy = hold.yRatio * this.canvas.height;
      const color = colors[hold.type] || colors.hold;
      const label = hold.type === 'start' ? 'S' : hold.type === 'finish' ? 'F' : String(sequence++);
      this.drawMarker(cx, cy, scale, color, hold.type, label);
    });
  }

  drawMarker(cx, cy, scale, colorHex, type, label) {
    const baseRgb = hexToRgb(colorHex);
    const ringRgb = darkenRgb(baseRgb, 0.35);
    const textRgb = darkenRgb(baseRgb, 0.55);
    const radius = (type === 'finish' ? 15 : type === 'start' ? 14 : 13) * scale;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = rgba(baseRgb, type === 'hold' ? 0.28 : 0.36);
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.lineWidth = 5 * scale;
    this.ctx.strokeStyle = rgba(ringRgb, 1);
    this.ctx.stroke();

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = `${(type === 'hold' ? 11 : 12) * scale}px Inter, system-ui, sans-serif`;
    this.ctx.fillStyle = rgba(textRgb, 0.98);
    this.ctx.fillText(label, cx, cy);
    this.ctx.restore();
  }
}
