'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {initialState,ingest,generate}=require('../src/core.cjs');
const writer=require('../src/writer.cjs');
const {FakeVault}=require('./fake-vault.cjs');
const fixture=require('./fixtures/v0.1.0-vault.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const bundle=data=>({documents:[{data,name:'review.json'}],warnings:[]});
const refresh=state=>ingest(state,{documents:[],warnings:[]});
async function legacyVault() {
  const vault=new FakeVault();
  for(const [path,content] of fixture.files) { await writer.folder(vault,path); await vault.create(path,content); }
  return {vault,state:clone(fixture.state)};
}
function verifyLinks(vault) {
  for(const [path,content] of vault.snapshot()) {
    if(path.includes('/_冲突/') || path.endsWith('.json')) continue;
    if(path.endsWith('.canvas')) {
      const canvas=JSON.parse(content), ids=new Set(canvas.nodes.map(n=>n.id));
      for(const n of canvas.nodes) if(n.type==='file') assert.ok(vault.getAbstractFileByPath(n.file),n.file);
      for(const edge of canvas.edges) assert.ok(ids.has(edge.fromNode)&&ids.has(edge.toNode));
    } else if(path.endsWith('.md')) {
      for(const m of content.matchAll(/\[\[([^|\]#]+)[^\]]*\]\]/g))
        assert.ok(vault.getAbstractFileByPath(m[1])||vault.getAbstractFileByPath(m[1]+'.md'),m[1]);
      assert.doesNotMatch(content,/原 ID：|## 导入原文|\|原始 JSON\]\]/);
    }
  }
}

test('新笔记使用主题名称，正文和画布没有内部 ID 或原始 JSON 入口',async()=>{
  const imported=ingest(initialState(),bundle(clone(fixture.data))), vault=new FakeVault();
  await writer.write(vault,imported);
  assert.deepEqual(Object.values(imported.state.records).map(r=>r.path.split('/').pop()),['核心定义.md','倍加变换.md']);
  verifyLinks(vault);
  assert.ok(vault.snapshot().some(([path])=>path.includes('/_导入原文/')),'Archive is retained without links in notes');
});

test('从真实 v0.1.0 生成的样例升级：保留个人笔记、节点身份与连线，重复整理无变化',async()=>{
  const {vault,state}=await legacyVault(), old=Object.values(state.records), personal='\n我的推理：先用多重线性，再用交替性。\n';
  vault.getAbstractFileByPath(old[1].path).content+=personal;
  const originalCanvas=JSON.parse(vault.snapshot().find(([p])=>p.endsWith('.canvas'))[1]);
  const imported=refresh(state), result=await writer.write(vault,imported);
  assert.equal(result.counts.renamed,2); assert.equal(result.counts.conflict,0);
  for(const r of old) assert.equal(vault.getAbstractFileByPath(r.path),null);
  const record=Object.values(imported.state.records).find(r=>r.id==='row-addition');
  assert.ok((await vault.read(vault.getAbstractFileByPath(record.path))).endsWith(personal));
  assert.deepEqual(Object.keys(imported.state.records),Object.keys(state.records));
  const canvas=JSON.parse(vault.snapshot().find(([p])=>p.endsWith('.canvas'))[1]);
  assert.deepEqual(canvas.nodes.map(n=>n.id),originalCanvas.nodes.map(n=>n.id));
  assert.deepEqual(canvas.edges,originalCanvas.edges); verifyLinks(vault);
  const before=vault.snapshot(), again=await writer.write(vault,refresh(imported.state));
  assert.equal(again.counts.renamed,0); assert.equal(again.counts.update,0); assert.equal(again.counts.create,0); assert.equal(again.counts.conflict,0);
  assert.deepEqual(vault.snapshot(),before);
  const reimported=ingest(imported.state,bundle(clone(fixture.data)));
  await writer.write(vault,reimported); assert.deepEqual(vault.snapshot(),before);
});

test('整理保留导入区手动修订与 Canvas 布局，同时移除显示杂项并修复链接',async()=>{
  const {vault,state}=await legacyVault(), r=Object.values(state.records)[1];
  const old=vault.getAbstractFileByPath(r.path); old.content=old.content.replace('设 $A$ 为方阵。','我补充的条件：$i\\ne j$。');
  const canvasFile=[...vault.files.values()].find(f=>f.path.endsWith('.canvas'));
  const canvas=JSON.parse(canvasFile.content); canvas.nodes[1].x=1234; canvasFile.content=JSON.stringify(canvas);
  const imported=refresh(state), result=await writer.write(vault,imported);
  const updated=vault.getAbstractFileByPath(imported.state.records[r.key].path).content;
  assert.match(updated,/我补充的条件/); assert.doesNotMatch(updated,/原 ID：|## 导入原文/);
  assert.equal(JSON.parse(canvasFile.content).nodes[1].x,1234);
  assert.ok(result.conflicts.length>=1); verifyLinks(vault);
});

test('标题重复、清理后重名和同名个人文件都不覆盖，后续导入保持路径',async()=>{
  const data=clone(fixture.data), template=data.nodes[1];
  data.nodes=['A','a','A','x/y','x:y'].map((title,i)=>({...template,id:'n'+i,parentId:undefined,related:[],title}));
  const vault=new FakeVault(), imported=ingest(initialState(),bundle(data));
  const first=Object.values(imported.state.records)[0].path;
  await writer.folder(vault,first); await vault.create(first,'我的同名笔记');
  await writer.write(vault,imported);
  const paths=Object.values(imported.state.records).map(r=>r.path);
  assert.equal(new Set(paths.map(p=>p.toLowerCase())).size,5);
  assert.equal((await vault.read(vault.getAbstractFileByPath(first))),'我的同名笔记');
  assert.ok(paths.every(p=>!/--[a-f0-9]{8,}\.md$/.test(p)));
  const again=ingest(imported.state,bundle(data)); await writer.write(vault,again);
  assert.deepEqual(Object.values(again.state.records).map(r=>r.path),paths);
});

test('缺少旧文件归属记录时停止整理，不移动或覆盖现有文件',async()=>{
  const {vault,state}=await legacyVault(), r=Object.values(state.records)[1];
  delete state.bindings[r.path]; const before=vault.snapshot();
  await assert.rejects(()=>writer.write(vault,refresh(state)),/无法确认旧笔记归属/);
  assert.deepEqual(vault.snapshot(),before);
});

test('改名中途失败后可恢复，已移动笔记的旧链接仍被修复',async()=>{
  const {vault,state}=await legacyVault(), imported=refresh(state); let count=0;
  await assert.rejects(()=>writer.write(vault,imported,()=>{},async(file,path)=>{
    if(++count===2) throw new Error('simulated interruption'); await vault.rename(file,path);
  }),/simulated interruption/);
  assert.equal(Object.keys(imported.state.pendingMoves).length,1);
  const recovered=refresh(imported.state), result=await writer.write(vault,recovered);
  assert.equal(result.counts.conflict,0); assert.equal(recovered.state.pendingMoves,undefined); verifyLinks(vault);
});

test('宿主同步更新链接时仍识别基线，不误报导入区冲突',async()=>{
  const {vault,state}=await legacyVault(), imported=refresh(state);
  const result=await writer.write(vault,imported,()=>{},async(file,path)=>{
    const from=file.path; await vault.rename(file,path);
    for(const f of vault.files.values()) if(typeof f.content==='string' && f.path.endsWith('.md'))
      f.content=f.content.split(from.replace(/\.md$/,'')).join(path.replace(/\.md$/,''));
  });
  assert.equal(result.counts.conflict,0); verifyLinks(vault);
});
