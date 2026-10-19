/** Fit the original artwork at the top of a card; remaining space belongs to the frame. */
export function portraitFrameLayout(width, height, frameWidth = 512, frameHeight = 768) {
  const scale = Math.min(frameWidth / width, frameHeight / height);
  return {
    x: (frameWidth - width * scale) / 2,
    y: 0,
    width: width * scale,
    height: height * scale,
  };
}

export function portraitFrame(image, color = '#b5a6d0') {
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = Math.min(2048, Math.max(512, Math.ceil(Math.max(width, (height * 2) / 3))));
  canvas.height = Math.round(canvas.width * 1.5);
  const context = canvas.getContext('2d');
  const layout = portraitFrameLayout(width, height, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // Decorations use a logical grid; artwork is drawn afterward at native resolution.
  context.save();
  context.scale(canvas.width / 512, canvas.height / 768);
  const background = context.createLinearGradient(0, 0, 0, 768);
  background.addColorStop(0, '#171d2b');
  background.addColorStop(1, '#151c22');
  context.fillStyle = background;
  context.fillRect(0, 0, 512, 768);
  context.strokeStyle = color;
  context.globalAlpha = 0.35;
  for (const radius of [48, 65, 88]) {
    context.beginPath();
    context.arc(256, 610, radius, 0, Math.PI * 2);
    context.stroke();
  }
  for (let index = 0; index < 12; index++) {
    const angle = (index * Math.PI) / 6;
    context.beginPath();
    context.moveTo(256 + Math.cos(angle) * 57, 610 + Math.sin(angle) * 57);
    context.lineTo(256 + Math.cos(angle) * 65, 610 + Math.sin(angle) * 65);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(30, 610);
  context.lineTo(160, 610);
  context.moveTo(352, 610);
  context.lineTo(482, 610);
  context.moveTo(256, 574);
  context.lineTo(256, 610);
  context.lineTo(280, 623);
  context.stroke();
  context.restore();
  context.globalAlpha = 1;
  context.drawImage(image, layout.x, layout.y, layout.width, layout.height);
  return canvas;
}
