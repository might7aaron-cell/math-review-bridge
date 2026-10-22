'use strict';
const { generate, reconcile, hash } = require('./core.cjs');

async function folder(vault,path) {
  const parts=path.split('/'); parts.pop(); let current='';
  for(const part of parts) {
    current=current ? current+'/'+part : part;
    const found=vault.getAbstractFileByPath(current);
    if(found && !Array.isArray(found.children)) throw new Error(`目录被同名文件占用：${current}`);
    if(!found) {
      try { await vault.createFolder(current); }
      catch(e) { if(!Array.isArray(vault.getAbstractFileByPath(current)?.children)) throw e; }
    }
  }
}
async function preview(vault,imported) {
  const files=generate(imported), counts={create:0,update:0,skip:0,conflict:0};
  for(const file of files) {
    const old=vault.getAbstractFileByPath(file.path);
    const current=old && !Array.isArray(old.children) ? await vault.read(old) : null;
    const result=old && Array.isArray(old.children) ? {action:'conflict'} : reconcile(current,file,imported.state.bindings[file.path]);
    counts[result.action]++;
  }
  return {files,counts};
}
async function conflictCopy(vault,root,file,content) {
  const basename=file.path.split('/').pop();
  const dot=basename.lastIndexOf('.'), stem=dot<0?basename:basename.slice(0,dot), ext=dot<0?'.md':basename.slice(dot);
  const base=`${root}/_冲突/${stem}--${hash(file.key+content).slice(0,12)}`;
  for(let i=0;i<100;i++) {
    const path=base+(i?'-'+i:'')+ext;
    const found=vault.getAbstractFileByPath(path);
    if(found && !Array.isArray(found.children) && await vault.read(found)===content) return path;
    if(!found) { await folder(vault,path); await vault.create(path,content); return path; }
  }
  throw new Error('冲突版本过多，请先整理 _冲突 文件夹。');
}
async function write(vault,imported,onProgress=()=>{}) {
  const files=generate(imported), counts={create:0,update:0,skip:0,conflict:0,images:0}, conflicts=[];
  for(const [path,bytes] of imported.assets) {
    const existing=vault.getAbstractFileByPath(path);
    if(existing) {
      if(Array.isArray(existing.children) || hash(new Uint8Array(await vault.readBinary(existing)))!==hash(bytes)) throw new Error('附件路径冲突：'+path);
    } else {
      await folder(vault,path);
      await vault.createBinary(path,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      counts.images++;
    }
  }
  let completed=0;
  for(const file of files) {
    const existing=vault.getAbstractFileByPath(file.path);
    let result;
    if(existing && Array.isArray(existing.children)) result={action:'conflict',content:file.managed ? require('./core.cjs').managed(file.key,file.content) : file.content};
    else if(!existing) {
      result=reconcile(null,file,imported.state.bindings[file.path]);
      await folder(vault,file.path); await vault.create(file.path,result.content);
    } else {
      // Reconcile inside process: preserve notes typed after the preview as well.
      await vault.process(existing,current=>{
        result=reconcile(current,file,imported.state.bindings[file.path]);
        return result.action==='update' ? result.content : current;
      });
    }
    if(result.action==='conflict') conflicts.push(await conflictCopy(vault,imported.state.root,file,result.content));
    else imported.state.bindings[file.path]=result.binding;
    counts[result.action]++;
    onProgress(++completed,files.length);
    if(completed%30===0) await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {counts,conflicts};
}
module.exports={folder,preview,write};
