const fileInput = document.getElementById("fileInput");
const lineCanvas = document.getElementById("lineCanvas");
const colorCanvas = document.getElementById("colorCanvas");
const lineWidth = document.getElementById("lineWidth");
const threshold = document.getElementById("threshold");
const tool = document.getElementById("tool");
const colorPicker = document.getElementById("color");
const resetBtn = document.getElementById("reset");
const downloadBtn = document.getElementById("download");

const lineCtx = lineCanvas.getContext("2d");
const colorCtx = colorCanvas.getContext("2d");

let imgBitmap = null;
let isDrawing = false;
let lastPos = null;

function resizeCanvases(width, height) {
  [lineCanvas, colorCanvas].forEach((c) => {
    c.width = width;
    c.height = height;
  });
  colorCtx.fillStyle = "#ffffff";
  colorCtx.fillRect(0, 0, width, height);
}

function getPointerPos(e) {
  const rect = lineCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: ((clientX - rect.left) / rect.width) * lineCanvas.width,
    y: ((clientY - rect.top) / rect.height) * lineCanvas.height,
  };
}

function drawLineArt() {
  if (!imgBitmap) return;

  const w = imgBitmap.width;
  const h = imgBitmap.height;
  resizeCanvases(w, h);

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(imgBitmap, 0, 0);

  const src = offCtx.getImageData(0, 0, w, h);
  const dst = lineCtx.createImageData(w, h);

  // Sobel edge detection
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = src.data[i * 4];
    const g = src.data[i * 4 + 1];
    const b = src.data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const t = parseInt(threshold.value, 10);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      const v = mag > t ? 0 : 255;
      const d = i * 4;
      dst.data[d] = v;
      dst.data[d + 1] = v;
      dst.data[d + 2] = v;
      dst.data[d + 3] = 255;
    }
  }

  lineCtx.putImageData(dst, 0, 0);
  lineCtx.lineWidth = parseInt(lineWidth.value, 10);
  lineCtx.lineJoin = "round";
  lineCtx.strokeStyle = "#000";
}

function floodFill(x, y, fillColor) {
  const w = colorCanvas.width;
  const h = colorCanvas.height;
  const image = colorCtx.getImageData(0, 0, w, h);
  const data = image.data;
  const stack = [[Math.floor(x), Math.floor(y)]];

  const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
  const target = data.slice(idx, idx + 4);

  const [fr, fg, fb] = fillColor;
  if (target[0] === fr && target[1] === fg && target[2] === fb) return;

  const lineData = lineCtx.getImageData(0, 0, w, h).data;
  const isLine = (i) => lineData[i] === 0; // black line

  while (stack.length) {
    const [px, py] = stack.pop();
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const i = (py * w + px) * 4;
    if (isLine(i)) continue;
    if (
      data[i] !== target[0] ||
      data[i + 1] !== target[1] ||
      data[i + 2] !== target[2] ||
      data[i + 3] !== target[3]
    ) continue;

    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = 255;

    stack.push([px + 1, py]);
    stack.push([px - 1, py]);
    stack.push([px, py + 1]);
    stack.push([px, py - 1]);
  }

  colorCtx.putImageData(image, 0, 0);
}

function startDraw(e) {
  isDrawing = true;
  lastPos = getPointerPos(e);
  if (tool.value === "fill") {
    const hex = colorPicker.value;
    const rgb = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    floodFill(lastPos.x, lastPos.y, rgb);
    isDrawing = false;
  }
}

function moveDraw(e) {
  if (!isDrawing) return;
  if (tool.value === "fill") return;
  const pos = getPointerPos(e);
  colorCtx.lineCap = "round";
  colorCtx.lineJoin = "round";
  colorCtx.lineWidth = tool.value === "eraser" ? 24 : 8;
  colorCtx.strokeStyle = tool.value === "eraser" ? "#ffffff" : colorPicker.value;
  colorCtx.beginPath();
  colorCtx.moveTo(lastPos.x, lastPos.y);
  colorCtx.lineTo(pos.x, pos.y);
  colorCtx.stroke();
  lastPos = pos;
}

function endDraw() {
  isDrawing = false;
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  imgBitmap = await createImageBitmap(file);
  drawLineArt();
});

[lineWidth, threshold].forEach((el) => {
  el.addEventListener("input", drawLineArt);
});

resetBtn.addEventListener("click", () => {
  if (!imgBitmap) return;
  drawLineArt();
  colorCtx.fillStyle = "#ffffff";
  colorCtx.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
});

function mergeAndDownload() {
  const w = colorCanvas.width;
  const h = colorCanvas.height;
  if (!w || !h) return;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  outCtx.drawImage(colorCanvas, 0, 0);
  outCtx.drawImage(lineCanvas, 0, 0);
  const link = document.createElement("a");
  link.download = "coloring.png";
  link.href = out.toDataURL("image/png");
  link.click();
}

["mousedown", "touchstart"].forEach((evt) =>
  colorCanvas.addEventListener(evt, startDraw)
);
["mousemove", "touchmove"].forEach((evt) =>
  colorCanvas.addEventListener(evt, moveDraw, { passive: false })
);
["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((evt) =>
  colorCanvas.addEventListener(evt, endDraw)
);

// Prevent page scroll while painting
colorCanvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

downloadBtn.addEventListener("click", mergeAndDownload);
