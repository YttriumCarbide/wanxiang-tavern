new ResizeObserver(() => {
  parent.postMessage(
    { type: 'chat-frame-size', height: Math.min(5000, document.documentElement.scrollHeight) },
    '*',
  );
}).observe(document.body);
