/* Native Android bridge: save exported PNGs into the system photo gallery. */
(function () {
  if (!window.AndroidBridge || !window.AndroidBridge.savePng) return;
  window.showSaveFilePicker = async function (options) {
    const name = options && options.suggestedName ? options.suggestedName : '留墨_阅卷.png';
    return {
      createWritable: async function () {
        let saved = false;
        return {
          write: async function (blob) {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
              reader.readAsDataURL(blob);
            });
            if (!window.AndroidBridge.savePng(String(dataUrl), name)) throw new Error('保存到相册失败，请检查手机空间');
            saved = true;
          },
          close: async function () {
            if (!saved) throw new Error('图片尚未保存');
          }
        };
      }
    };
  };
})();
