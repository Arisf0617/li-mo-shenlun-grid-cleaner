importScripts('grid-core.js');
let model = null;
self.onmessage = async ({ data: message }) => {
  const { id, type } = message;
  try {
    if (type === 'analyze') {
      model = await GridCleaner.analyze(message.data, message.width, message.height, (percent, label) => self.postMessage({ id, type: 'progress', percent, label }));
      self.postMessage({ id, type: 'ready' });
    } else if (type === 'render') {
      if (!model) throw new Error('请先打开一张图片');
      const result = GridCleaner.render(model, message.options);
      self.postMessage({ id, type: 'result', ...result }, [result.data.buffer]);
    }
  } catch (error) { self.postMessage({ id, type: 'error', message: error.message || String(error) }); }
};
