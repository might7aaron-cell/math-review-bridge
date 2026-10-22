'use strict';
const {Plugin,Modal,Notice,PluginSettingTab,Setting}=require('obsidian');
const {readInputs}=require('./archive.cjs');
const {initialState,ingest,DEFAULT_ROOT,rootPath}=require('./core.cjs');
const writer=require('./writer.cjs');

class ImportModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin=plugin; this.bundle=null; this.version=0; }
  onOpen() {
    const c=this.contentEl; c.empty(); c.addClass('msb-import');
    c.createEl('h2',{text:'导入数学复习资料'});
    c.createEl('p',{text:'从复习台或工作台导出，然后选择 JSON / ZIP。可一次选多个文件。',cls:'msb-muted'});
    const input=c.createEl('input',{type:'file',attr:{accept:'.json,.zip,application/json,application/zip',multiple:''}});
    input.setAttribute('aria-label','选择复习资料 JSON 或 ZIP');
    input.addEventListener('change',async()=>{
      const files=Array.from(input.files||[]);
      if(!files.length) return;
      const version=++this.version;
      this.bundle=null; this.commitButton.disabled=true; this.status.textContent='正在读取资料…';
      try {
        let total=0; const values=[];
        for(const f of files) {
          total+=f.size;
          if(f.size>32*1024*1024 || total>64*1024*1024) throw new Error('文件过大。单文件限 32 MB，一次限 64 MB。');
          values.push({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())});
        }
        const bundle=await readInputs(values);
        if(version===this.version) await this.prepare(bundle,version);
      } catch(e) { if(version===this.version) this.showError(e); }
    });
    const paste=c.createEl('details',{cls:'msb-paste'}); paste.createEl('summary',{text:'也可以粘贴 JSON'});
    const textarea=paste.createEl('textarea',{attr:{rows:'6','aria-label':'JSON 内容',placeholder:'粘贴完整 JSON'}});
    paste.createEl('button',{text:'预览粘贴内容'}).addEventListener('click',async()=>{
      const version=++this.version; this.bundle=null; this.commitButton.disabled=true;
      try { await this.prepare(await readInputs([{name:'粘贴资料.json',bytes:new TextEncoder().encode(textarea.value)}]),version); }
      catch(e) { if(version===this.version) this.showError(e); }
    });
    this.status=c.createDiv({cls:'msb-status',text:'支持：math-review v1/v2、gaodai-handoff v1、gaodai-feedback v1/v2。'});
    this.status.setAttribute('aria-live','polite');
    this.previewEl=c.createDiv({cls:'msb-preview'});
    const buttons=c.createDiv({cls:'msb-actions'});
    this.commitButton=buttons.createEl('button',{text:'导入到 Obsidian',cls:'mod-cta'}); this.commitButton.disabled=true;
    this.commitButton.addEventListener('click',()=>this.commit());
    buttons.createEl('button',{text:'打开学习首页'}).addEventListener('click',()=>this.plugin.openHome());
  }
  showError(e) { this.status.textContent=e.message||String(e); this.commitButton.disabled=true; }
  async prepare(bundle,version) {
    const imported=ingest(this.plugin.state,bundle), preview=await writer.preview(this.app.vault,imported);
    if(version!==this.version) return;
    this.bundle=bundle; this.previewEl.empty();
    this.previewEl.createEl('p',{text:`本次识别 ${bundle.documents.length} 份资料，涉及 ${imported.touched} 个条目和 ${imported.assets.size} 张手写图片。`});
    const p=preview.counts;
    this.previewEl.createEl('p',{text:`预计新增 ${p.create} 个文件，更新 ${p.update} 个，保持 ${p.skip} 个；需保留两版 ${p.conflict} 个。`});
    this.previewEl.createEl('p',{text:'原始 JSON 一并保留。已自行修改的导入区会另存更新版本；「我的笔记」始终保留。',cls:'msb-muted'});
    if(imported.warnings.length) {
      const box=this.previewEl.createEl('details'); box.createEl('summary',{text:`查看 ${imported.warnings.length} 条导入说明`});
      const ul=box.createEl('ul'); for(const warning of imported.warnings) ul.createEl('li',{text:warning});
    }
    this.status.textContent=`将写入：${imported.state.root}`; this.commitButton.disabled=false;
  }
  async commit() {
    if(!this.bundle || this.plugin.busy) return;
    this.plugin.busy=true; this.commitButton.disabled=true;
    let imported;
    try {
      imported=ingest(this.plugin.state,this.bundle);
      const result=await writer.write(this.app.vault,imported,(n,total)=>this.status.textContent=`正在生成 ${n}/${total}…`);
      this.plugin.state=imported.state; await this.plugin.saveData(this.plugin.state);
      const r=result.counts;
      this.status.textContent=`完成：新增 ${r.create}，更新 ${r.update}，保留 ${r.skip}。${r.conflict ? ` ${r.conflict} 个更新版本已放入 _冲突；原笔记保留。` : ''}`;
      this.previewEl.empty();
      for(const path of result.conflicts) this.previewEl.createEl('button',{text:'查看保留的新版本'}).addEventListener('click',()=>this.app.workspace.openLinkText(path,'',false));
      new Notice('数学学习桥：导入完成'); this.bundle=null;
      await this.plugin.openHome();
    } catch(e) {
      if(imported) this.plugin.state=imported.state;
      try { await this.plugin.saveData(this.plugin.state); } catch { new Notice('插件索引保存失败，请保留原始导出文件并重新导入。',10000); }
      this.status.textContent='导入未全部完成；已写入的文件保留，可重试。'+(e.message||e);
      this.commitButton.disabled=false;
    } finally { this.plugin.busy=false; }
  }
  onClose() { this.version++; this.contentEl.empty(); }
}

class BridgeSettings extends PluginSettingTab {
  constructor(app,plugin) { super(app,plugin); this.plugin=plugin; }
  display() {
    const c=this.containerEl; c.empty(); c.createEl('h2',{text:'数学学习桥'});
    c.createEl('p',{text:'导入完全在当前笔记库进行，不需要 AI API 密钥。首次导入后目录固定，防止重复生成两套笔记。'});
    const locked=Object.keys(this.plugin.state.records).length>0 || Object.keys(this.plugin.state.bindings).length>0;
    const candidate={value:this.plugin.state.root};
    new Setting(c).setName('资料目录').setDesc(locked?'已有导入记录；如需搬迁，请先备份并联系维护者。':'相对于当前笔记库的文件夹名称。')
      .addText(t=>t.setValue(candidate.value).setDisabled(locked).onChange(v=>candidate.value=v))
      .addButton(b=>b.setButtonText('保存').setDisabled(locked).onClick(async()=>{
        try { this.plugin.state.root=rootPath(candidate.value); await this.plugin.saveData(this.plugin.state); new Notice('目录已保存'); }
        catch(e) { new Notice(e.message); }
      }));
    new Setting(c).setName('导入资料').addButton(b=>b.setButtonText('选择 JSON / ZIP').onClick(()=>new ImportModal(this.plugin).open()));
  }
}
class MathStudyBridge extends Plugin {
  async onload() {
    const saved=await this.loadData();
    if(saved && saved.schemaVersion!==1) { new Notice('数学学习桥：本地索引版本不兼容，已停止加载。'); return; }
    this.state=saved || initialState(DEFAULT_ROOT); this.busy=false;
    const open=()=>new ImportModal(this).open();
    this.addRibbonIcon('book-open-check','数学学习桥：导入复习资料',open);
    this.addCommand({id:'import-material',name:'导入复习资料',callback:open});
    this.addCommand({id:'open-home',name:'打开学习首页',callback:()=>this.openHome()});
    this.addSettingTab(new BridgeSettings(this.app,this));
  }
  async openHome() {
    const path=this.state.root+'/首页.md';
    if(!this.app.vault.getAbstractFileByPath(path)) { new Notice('先导入一份资料，即可生成学习首页。'); return; }
    await this.app.workspace.openLinkText(path,'',false);
  }
}
module.exports=MathStudyBridge;
