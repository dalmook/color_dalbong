const fileInput = document.getElementById("fileInput");
const sourceCanvas = document.getElementById("sourceCanvas");
const lineCanvas = document.getElementById("lineCanvas");
const colorCanvas = document.getElementById("colorCanvas");
const lineWidth = document.getElementById("lineWidth");
const threshold = document.getElementById("threshold");
const downloadBtn = document.getElementById("download");

const sourceCtx = sourceCanvas.getContext("2d");
const lineCtx = lineCanvas.getContext("2d");
const colorCtx = colorCanvas.getContext("2d");

let imgBitmap = null;
let isDrawing = false;
let lastPos = null;
let imageSize = null;

function resizeCanvases(width, height) {
  [sourceCanvas, lineCanvas, colorCanvas].forEach((c) => {
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

  const w = imageSize?.width ?? imgBitmap.width;
  const h = imageSize?.height ?? imgBitmap.height;

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(imgBitmap, 0, 0);

  const src = offCtx.getImageData(0, 0, w, h);
  const dst = lineCtx.createImageData(w, h);

  // Grayscale + blur to reduce noise
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = src.data[i * 4];
    const g = src.data[i * 4 + 1];
    const b = src.data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const blurred = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const sum =
        gray[i - w - 1] + gray[i - w] + gray[i - w + 1] +
        gray[i - 1] + gray[i] + gray[i + 1] +
        gray[i + w - 1] + gray[i + w] + gray[i + w + 1];
      blurred[i] = sum / 9;
    }
  }

  // Sobel edge detection
  const t = parseInt(threshold.value, 10);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -blurred[i - w - 1] - 2 * blurred[i - 1] - blurred[i + w - 1] +
        blurred[i - w + 1] + 2 * blurred[i + 1] + blurred[i + w + 1];
      const gy =
        -blurred[i - w - 1] - 2 * blurred[i - w] - blurred[i - w + 1] +
        blurred[i + w - 1] + 2 * blurred[i + w] + blurred[i + w + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      const v = mag > t ? 0 : 255;
      const d = i * 4;
      dst.data[d] = v;
      dst.data[d + 1] = v;
      dst.data[d + 2] = v;
      dst.data[d + 3] = 255;
    }
  }

  // Thicken lines via simple dilation
  const radius = Math.max(1, parseInt(lineWidth.value, 10));
  if (radius > 1) {
    const srcData = new Uint8ClampedArray(dst.data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let makeBlack = false;
        for (let dy = -radius; dy <= radius && !makeBlack; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const ni = (ny * w + nx) * 4;
            if (srcData[ni] === 0) {
              makeBlack = true;
              break;
            }
          }
        }
        const i = (y * w + x) * 4;
        if (makeBlack) {
          dst.data[i] = 0;
          dst.data[i + 1] = 0;
          dst.data[i + 2] = 0;
          dst.data[i + 3] = 255;
        }
      }
    }
  }

  lineCtx.putImageData(dst, 0, 0);
}

function drawSourceImage() {
  if (!imgBitmap) return;
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(imgBitmap, 0, 0, sourceCanvas.width, sourceCanvas.height);
}

function startDraw(e) {
  isDrawing = true;
  lastPos = getPointerPos(e);
}

function moveDraw(e) {
  if (!isDrawing) return;
  const pos = getPointerPos(e);
  colorCtx.lineCap = "round";
  colorCtx.lineJoin = "round";
  colorCtx.lineWidth = 10;
  colorCtx.strokeStyle = "#ff6b00";
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
  imageSize = { width: imgBitmap.width, height: imgBitmap.height };
  resizeCanvases(imageSize.width, imageSize.height);
  drawSourceImage();
  drawLineArt();
});

[lineWidth, threshold].forEach((el) => {
  el.addEventListener("input", drawLineArt);
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
