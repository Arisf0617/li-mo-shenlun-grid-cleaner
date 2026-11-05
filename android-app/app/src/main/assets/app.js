'use strict';
const $ = id => document.getElementById(id);
const state = {width:0,height:0,filename:'',rotation:0,model:null,edits:null,worker:null,pending:new Map(),nextId:0,ready:false,busy:false,view:'result',tool:'pan',mask:false,zoom:1,panX:0,panY:0,undo:[],pointer:null,stroke:null,renderVersion:0};
const sourceCanvas = document.createElement('canvas');
const originalCanvas = document.createElement('canvas');
const resultCanvas = document.createElement('canvas');
const display = $('canvas'), context = display.getContext('2d');
let renderTimer, toastTimer;
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,7000); }
function setBusy(active,label='正在处理',percent=0) { state.busy=active; $('busy').hidden=!active; $('busyLabel').textContent=label; $('progress').value=percent; $('export').disabled=active||!state.ready; for(const id of ['openTop','openEmpty','cameraTop']) $(id).disabled=active; }
function options(maskView=state.mask) { return {mode:document.querySelector('input[name=mode]:checked').value,strength:+$('strength').value,protection:+$('protection').value,whiten:+$('whiten').value,edits:state.edits,maskView}; }
function enableControls(enabled) { for(const id of ['strength','protection','whiten','brush','pan','protect','erase','maskToggle','zoomOut','zoomIn','fit','actual','rotateLeft','rotateRight']) $(id).disabled=!enabled; $('export').disabled=!enabled||state.busy; $('undo').disabled=!enabled||!state.undo.length; }
function updateProgress(percent,label) { $('progress').value=percent; $('busyLabel').textContent=label; }
function workerCall(type,payload) { const id=++state.nextId; return new Promise((resolve,reject)=>{state.pending.set(id,{resolve,reject});state.worker.postMessage({id,type,...payload});}); }
async function prepareEngine(input,width,height) {
 if(state.worker) state.worker.terminate();
 for(const promise of state.pending.values()) promise.reject(new Error('处理已取消'));
 state.pending.clear(); state.worker=null; state.model=null;
 if(location.protocol!=='file:') {
  try {
   const worker=new Worker('grid-worker.js');state.worker=worker;
   worker.onmessage=({data:message})=>{if(message.type==='progress'){updateProgress(message.percent,message.label);return;}const request=state.pending.get(message.id);if(!request)return;state.pending.delete(message.id);if(message.type==='error')request.reject(new Error(message.message));else request.resolve(message);};
   worker.onerror=()=>{for(const request of state.pending.values())request.reject(new Error('后台处理未能启动'));state.pending.clear();};
   await workerCall('analyze',{data:input,width,height});return;
  }catch(_){if(state.worker)state.worker.terminate();state.worker=null;}
 }
 state.model=await GridCleaner.analyze(input,width,height,updateProgress);
}
async function getResult(maskView=state.mask) { if(state.worker)return workerCall('render',{options:options(maskView)});if(!state.model)throw new Error('图片尚未处理完成');return GridCleaner.render(state.model,options(maskView)); }
async function refreshResult() {
 if(!state.ready)return;const version=++state.renderVersion;$('export').disabled=true;
 try {const result=await getResult();if(version!==state.renderVersion)return;resultCanvas.getContext('2d').putImageData(new ImageData(result.data,result.width,result.height),0,0);draw();$('status').textContent=state.mask?'橙色：处理区域 · 蓝色：手动保护':'已处理 · '+state.width+' × '+state.height+' · 原始布局';}
 catch(error){toast(error.message);}finally{if(version===state.renderVersion&&!state.busy)$('export').disabled=false;}
}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(refreshResult,140);}
async function openImage(source,filename,revoke=false) {
 if(state.busy){if(revoke)URL.revokeObjectURL(source);toast('当前图片处理完成后可打开下一张。');return;}
 setBusy(true,'读取原始图片',2);let committed=false;
 try {
  const img=new Image();img.src=source;await img.decode();const width=img.naturalWidth,height=img.naturalHeight;
  if(width*height>16000000)throw new Error('此版本支持 1600 万像素以内的图片。请准备较小副本；程序不会自动缩小原图。');
  if(!width||!height)throw new Error('这张图片没有可读取的尺寸');
  state.ready=false;enableControls(false);committed=true;state.filename=filename;state.rotation=0;state.undo=[];state.mask=false;$('maskToggle').classList.remove('active');$('maskToggle').textContent='显示处理区域';
  sourceCanvas.width=width;sourceCanvas.height=height;sourceCanvas.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);
  applyRotation();const orientedWidth=originalCanvas.width,orientedHeight=originalCanvas.height;
  state.width=orientedWidth;state.height=orientedHeight;state.edits=new Uint8Array(orientedWidth*orientedHeight);resultCanvas.width=orientedWidth;resultCanvas.height=orientedHeight;
  const pixels=originalCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,orientedWidth,orientedHeight);
  $('empty').hidden=true;display.hidden=false;$('filename').textContent=filename;$('dimensions').textContent=width+' × '+height;
  await prepareEngine(pixels.data,orientedWidth,orientedHeight);state.ready=true;setView('result');fitImage();await refreshResult();enableControls(true);
 }catch(error){
  toast('打开失败：'+(error.message||'文件格式无法读取'));
  if(committed){state.ready=false;enableControls(false);$('empty').hidden=false;display.hidden=true;}
  $('status').textContent=state.ready?'上一张图片仍可使用':'未能处理这张图片，请重新选择';
 }finally{setBusy(false);if(revoke)URL.revokeObjectURL(source);}
}
function openFile(file){if(!file)return;if(!/^image[/](jpeg|png|webp|bmp|x-ms-bmp)$/.test(file.type)&&!/[.](jpe?g|png|webp|bmp)$/i.test(file.name)){toast('请选择 JPG、PNG、WebP 或 BMP 图片。');return;}openImage(URL.createObjectURL(file),file.name,true);}
function orientedSize(){return state.rotation%180?{width:state.height,height:state.width}:{width:state.width,height:state.height};}
function applyRotation(){
 const turn=((state.rotation%360)+360)%360,swap=turn===90||turn===270;
 originalCanvas.width=swap?sourceCanvas.height:sourceCanvas.width;
 originalCanvas.height=swap?sourceCanvas.width:sourceCanvas.height;
 const ctx=originalCanvas.getContext('2d',{willReadFrequently:true});
 if(turn===90){ctx.translate(originalCanvas.width,0);ctx.rotate(Math.PI/2);}
 else if(turn===180){ctx.translate(originalCanvas.width,originalCanvas.height);ctx.rotate(Math.PI);}
 else if(turn===270){ctx.translate(0,originalCanvas.height);ctx.rotate(-Math.PI/2);}
 ctx.drawImage(sourceCanvas,0,0);
}
function rotateImage(degrees){
 if(!state.ready||state.busy)return;
 clearTimeout(renderTimer);
 state.rotation=(state.rotation+degrees+360)%360;
 const size=orientedSize();$('dimensions').textContent=size.width+' × '+size.height;
 fitImage();
}
for(const [id,degrees] of [['rotateLeft',-90],['rotateRight',90]])$(id).addEventListener('click',()=>rotateImage(degrees));
for(const id of ['openTop','openEmpty'])$(id).addEventListener('click',()=>$('fileInput').click());
$('cameraTop').addEventListener('click',()=>{if(window.AndroidBridge?.takePhoto){window.AndroidBridge.takePhoto();return;}$('cameraFile').click();});
$('fileInput').addEventListener('change',event=>{openFile(event.target.files[0]);event.target.value='';});
$('cameraFile').addEventListener('change',event=>{openFile(event.target.files[0]);event.target.value='';});
window.receiveCameraPhoto=url=>openImage(url,'相机拍摄.jpg');
 document.addEventListener('paste',event=>{const item=[...(event.clipboardData?.items||[])].find(item=>item.type.startsWith('image/'));if(item){event.preventDefault();openFile(item.getAsFile());}});
let dragDepth=0;
document.addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dragDepth++;$('dropOverlay').hidden=false;}});
document.addEventListener('dragover',event=>event.preventDefault());
document.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropOverlay').hidden=true;});
document.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('dropOverlay').hidden=true;openFile(event.dataTransfer?.files[0]);});
for(const id of ['strength','protection','whiten'])$(id).addEventListener('input',()=>{$(id+'Value').textContent=$(id).value;scheduleRender();});
$('brush').addEventListener('input',()=>$('brushValue').textContent=$('brush').value+' px');
for(const radio of document.querySelectorAll('input[name=mode]'))radio.addEventListener('change',()=>{for(const card of document.querySelectorAll('.mode-card')){const chosen=card.querySelector('input').checked;card.classList.toggle('selected',chosen);card.querySelector('b').textContent=chosen?'◉':'○';}$('whiteControls').hidden=options().mode!=='white';scheduleRender();});
function setView(view){state.view=view;for(const tab of document.querySelectorAll('[data-view]'))tab.classList.toggle('active',tab.dataset.view===view);$('compareControl').hidden=$('compareLabels').hidden=view!=='compare'||!state.ready;draw();}
for(const tab of document.querySelectorAll('[data-view]'))tab.addEventListener('click',()=>setView(tab.dataset.view));
$('split').addEventListener('input',draw);
function resizeDisplay(){const rect=$('stage').getBoundingClientRect(),dpr=window.devicePixelRatio||1;display.width=Math.round(rect.width*dpr);display.height=Math.round(rect.height*dpr);draw();}
function fitImage(){if(!state.width)return;const rect=$('stage').getBoundingClientRect(),size=orientedSize();state.zoom=Math.min((rect.width-40)/size.width,(rect.height-40)/size.height);state.panX=state.panY=0;draw();}
function changeZoom(factor,centerX,centerY){if(!state.ready)return;const rect=$('stage').getBoundingClientRect(),old=state.zoom,x=centerX??rect.width/2,y=centerY??rect.height/2;state.zoom=Math.max(.03,Math.min(8,old*factor));const ratio=state.zoom/old;state.panX=(state.panX+rect.width/2-x)*ratio-rect.width/2+x;state.panY=(state.panY+rect.height/2-y)*ratio-rect.height/2+y;draw();}
function draw(){
 const rect=$('stage').getBoundingClientRect(),dpr=window.devicePixelRatio||1;context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,rect.width,rect.height);if(!state.width)return;
 const size=orientedSize(),w=size.width*state.zoom,h=size.height*state.zoom,x=(rect.width-w)/2+state.panX,y=(rect.height-h)/2+state.panY,cx=rect.width/2+state.panX,cy=rect.height/2+state.panY;
 const drawImage=source=>{context.save();context.translate(cx,cy);context.rotate(state.rotation*Math.PI/180);context.drawImage(source,-state.width*state.zoom/2,-state.height*state.zoom/2,state.width*state.zoom,state.height*state.zoom);context.restore();};
 context.imageSmoothingEnabled=state.zoom<2;
 context.save();context.shadowColor='#24371d28';context.shadowBlur=18;context.shadowOffsetY=5;context.fillStyle='#fff';context.fillRect(x,y,w,h);context.restore();drawImage(state.view==='original'?originalCanvas:resultCanvas);
 if(state.view==='compare'){const split=rect.width*(+$('split').value/100);context.save();context.beginPath();context.rect(0,0,split,rect.height);context.clip();drawImage(originalCanvas);context.restore();context.strokeStyle='#3e7059';context.lineWidth=1.5;context.beginPath();context.moveTo(split,0);context.lineTo(split,rect.height);context.stroke();context.fillStyle='#fff';context.beginPath();context.arc(split,rect.height/2,14,0,Math.PI*2);context.fill();context.fillStyle='#608267';context.font='16px sans-serif';context.textAlign='center';context.fillText('↔',split,rect.height/2+5);}
 $('zoomLabel').textContent=Math.round(state.zoom*100)+'%';
}
new ResizeObserver(resizeDisplay).observe($('stage'));
$('zoomIn').addEventListener('click',()=>changeZoom(1.3));$('zoomOut').addEventListener('click',()=>changeZoom(1/1.3));$('fit').addEventListener('click',fitImage);$('actual').addEventListener('click',()=>changeZoom(1/state.zoom));
display.addEventListener('wheel',event=>{if(!state.ready)return;event.preventDefault();const rect=display.getBoundingClientRect();changeZoom(Math.exp(-event.deltaY*.0015),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
function setTool(tool){state.tool=tool;for(const button of document.querySelectorAll('[data-tool]'))button.classList.toggle('active',button.dataset.tool===tool);display.classList.toggle('painting',tool!=='pan');state.mask=tool!=='pan';$('maskToggle').classList.toggle('active',state.mask);$('maskToggle').textContent=state.mask?'隐藏处理区域':'显示处理区域';if(tool!=='pan')setView('result');refreshResult();}
for(const button of document.querySelectorAll('[data-tool]'))button.addEventListener('click',()=>setTool(button.dataset.tool));
function imagePoint(event){const rect=display.getBoundingClientRect(),dx=(event.clientX-rect.left-rect.width/2-state.panX)/state.zoom,dy=(event.clientY-rect.top-rect.height/2-state.panY)/state.zoom;let x,y;if(state.rotation===90){x=dy+state.width/2;y=state.height/2-dx;}else if(state.rotation===180){x=state.width/2-dx;y=state.height/2-dy;}else if(state.rotation===270){x=state.width/2-dy;y=dx+state.height/2;}else{x=dx+state.width/2;y=dy+state.height/2;}return{x,y};}
function brushAt(point){const radius=+$('brush').value/2,value=state.tool==='protect'?1:2;for(let y=Math.max(0,Math.floor(point.y-radius));y<=Math.min(state.height-1,Math.ceil(point.y+radius));y++)for(let x=Math.max(0,Math.floor(point.x-radius));x<=Math.min(state.width-1,Math.ceil(point.x+radius));x++){if((x-point.x)**2+(y-point.y)**2>radius*radius)continue;const index=y*state.width+x;if(!state.stroke.has(index))state.stroke.set(index,state.edits[index]);state.edits[index]=value;}}
display.addEventListener('pointerdown',event=>{if(!state.ready||state.busy)return;display.setPointerCapture(event.pointerId);state.pointer={x:event.clientX,y:event.clientY,point:imagePoint(event),pan:state.tool==='pan'||event.button===1};if(state.pointer.pan)display.classList.add('dragging');else{state.stroke=new Map();brushAt(state.pointer.point);scheduleRender();}});
display.addEventListener('pointermove',event=>{if(!state.pointer)return;const prev=state.pointer;if(prev.pan){state.panX+=event.clientX-prev.x;state.panY+=event.clientY-prev.y;draw();}else{const p=imagePoint(event),length=Math.hypot(p.x-prev.point.x,p.y-prev.point.y),steps=Math.min(4000,Math.max(1,Math.ceil(length/Math.max(1,+$('brush').value/4))));for(let i=1;i<=steps;i++)brushAt({x:prev.point.x+(p.x-prev.point.x)*i/steps,y:prev.point.y+(p.y-prev.point.y)*i/steps});prev.point=p;scheduleRender();}prev.x=event.clientX;prev.y=event.clientY;});
function endPointer(){if(!state.pointer)return;if(state.stroke?.size){state.undo.push(state.stroke);if(state.undo.length>30)state.undo.shift();$('undo').disabled=false;}state.pointer=null;state.stroke=null;display.classList.remove('dragging');scheduleRender();}
for(const event of ['pointerup','pointercancel','lostpointercapture'])display.addEventListener(event,endPointer);
function undoStroke(){const stroke=state.undo.pop();if(!stroke)return;for(const[index,value]of stroke)state.edits[index]=value;$('undo').disabled=!state.undo.length;refreshResult();}
$('undo').addEventListener('click',undoStroke);
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();undoStroke();}});
$('maskToggle').addEventListener('click',()=>{state.mask=!state.mask;$('maskToggle').classList.toggle('active',state.mask);$('maskToggle').textContent=state.mask?'隐藏处理区域':'显示处理区域';refreshResult();});
$('export').addEventListener('click',async()=>{
 if(!state.ready||state.busy)return;
 const name=state.filename.replace(/[.][^.]+$/,'')+'_'+(options().mode==='white'?'白纸阅卷':'仅去红格')+'.png';
 clearTimeout(renderTimer);setBusy(true,'生成原尺寸 PNG',96);
 try{
  // Request a native save destination during the original click gesture.
  let handle=null;
  if(window.showSaveFilePicker){try{handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'PNG 图片',accept:{'image/png':['.png']}}]});}catch(error){if(error.name==='AbortError')return;if(error.name!=='SecurityError'&&error.name!=='NotAllowedError')throw error;}}
  const result=await getResult(false),source=document.createElement('canvas');source.width=state.width;source.height=state.height;source.getContext('2d').putImageData(new ImageData(result.data,result.width,result.height),0,0);
  const size=orientedSize(),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const exportContext=canvas.getContext('2d');exportContext.translate(size.width/2,size.height/2);exportContext.rotate(state.rotation*Math.PI/180);exportContext.drawImage(source,-state.width/2,-state.height/2);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('浏览器未能生成图片');
  if(handle){const writable=await handle.createWritable();await writable.write(blob);await writable.close();toast('已保存 '+size.width+' × '+size.height+' 原尺寸 PNG');}
  else {const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('已生成原尺寸 PNG，已交给浏览器下载。');}
 }catch(error){toast('导出失败：'+error.message);}finally{setBusy(false);}
});
