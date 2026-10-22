'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const JSZip=require('../vendor/jszip.min.js');
const {readInputs}=require('../src/archive.cjs');
const {initialState,ingest,generate,md}=require('../src/core.cjs');
const writer=require('../src/writer.cjs');
const {FakeVault}=require('./fake-vault.cjs');
const make=(data,name='test.json')=>({name,bytes:new TextEncoder().encode(JSON.stringify(data))});
const review=()=>({format:'math-review',schemaVersion:2,id:'demo',chapters:[{id:'ch1',title:'行列式',subjectId:'algebra'},{id:'ch2',title:'数列极限',subjectId:'analysis'}],nodes:[{id:'group',chapterId:'ch1',kind:'group',title:'定义',sections:[]},{id:'det',chapterId:'ch1',parentId:'group',kind:'knowledge',title:'分别线性',sections:[{title:'公式',body:'\\(x+y\\) 与 \\[\\det A\\]'}],related:['limit']},{id:'limit',chapterId:'ch2',kind:'knowledge',title:'极限',sections:[],related:['det']}]});
const bundle=data=>readInputs([make(data)]);

test('两学科、层级、跨章链接与数学定界符',async()=>{
 const imported=ingest(initialState(),await bundle(review())), files=generate(imported);
 assert.equal(Object.keys(imported.state.chapters).length,2);
 const notes=Object.values(imported.state.records), det=notes.find(n=>n.id==='det'), lim=notes.find(n=>n.id==='limit');
 const content=files.find(f=>f.path===det.path).content;
 assert.ok(content.includes(lim.path.replace(/\.md$/,'')));
 assert.match(content,/\$x\+y\$/); assert.match(content,/\$\$\n\\det A\n\$\$/);
 const canvas=JSON.parse(files.find(f=>f.path.includes('行列式') && f.path.endsWith('.canvas')).content);
 const ids=new Set(canvas.nodes.map(n=>n.id));
 assert.equal(ids.size,canvas.nodes.length);
 assert.ok(canvas.edges.every(e=>ids.has(e.fromNode)&&ids.has(e.toNode)));
 assert.equal(md('`\\(x\\)`'),'`\\(x\\)`');
});

test('重复导入不新增；更新讲解保留个人笔记和稳定文件路径',async()=>{
 const vault=new FakeVault(); let data=review(), imported=ingest(initialState(),await bundle(data));
 await writer.write(vault,imported); const before=vault.snapshot();
 const again=ingest(imported.state,await bundle(data)); const r=await writer.write(vault,again);
 assert.equal(r.counts.create,0); assert.equal(r.counts.update,0); assert.equal(r.counts.conflict,0); assert.deepEqual(vault.snapshot(),before);
 const node=Object.values(imported.state.records).find(n=>n.id==='det'), file=vault.getAbstractFileByPath(node.path);
 file.content+='\n我的想法不能被覆盖。\n'; data.nodes[1].title='新标题'; data.nodes[1].summary='新增摘要';
 imported=ingest(again.state,await bundle(data)); await writer.write(vault,imported);
 assert.equal(Object.values(imported.state.records).find(n=>n.id==='det').path,node.path);
 assert.match(file.content,/新增摘要/); assert.match(file.content,/我的想法不能被覆盖/);
});

test('用户改了导入区或画布，保留原文件并另存候选版本',async()=>{
 const vault=new FakeVault(); const data=review(); let parsed=ingest(initialState(),await bundle(data)); await writer.write(vault,parsed);
 const record=Object.values(parsed.state.records).find(n=>n.id==='det'), file=vault.getAbstractFileByPath(record.path);
 file.content=file.content.replace('分别线性','我的手动修订'); const original=file.content;
 const canvas=[...vault.files.values()].find(f=>f.path.endsWith('.canvas')); canvas.content+=' '; const oldCanvas=canvas.content;
 data.nodes[1].summary='后来的 AI 补充'; parsed=ingest(parsed.state,await bundle(data));
 const result=await writer.write(vault,parsed);
 assert.equal(file.content,original); assert.equal(canvas.content,oldCanvas);
 assert.ok(result.conflicts.length>=1); assert.ok(result.conflicts.every(p=>p.includes('/_冲突/')));
 const repeated=await writer.write(vault,ingest(parsed.state,await bundle(data)));
 assert.deepEqual(repeated.conflicts,result.conflicts);
});

test('JSON / ZIP 交接包与反馈合并到同一题，保留手写图片与诊断',async()=>{
 const zip=new JSZip(); const photo=Uint8Array.from([255,216,255,217]);
 const context={format:'gaodai-handoff',schemaVersion:1,chapterId:'det-ch1',subject:{id:'higher-algebra'},chapterTitle:'行列式',questionIndex:[{id:'Q1',title:'示例题',text_latex:'$a+b$'}],attempts:[{id:'A1',questionId:'Q1',outline:'我的作答',photoIds:['P1']}],media:[{photoId:'P1',path:'work/p.jpg'}]};
 zip.file('context.json',JSON.stringify(context)); zip.file('work/p.jpg',photo); zip.file('feedback-format.json',JSON.stringify({format:'gaodai-feedback',_formatGuide:{}}));
 const feedback={format:'gaodai-feedback',schemaVersion:2,id:'F1',chapterId:'det-ch1',questionReviews:[{questionId:'Q1',title:'解析',sections:[{title:'推导',body:'$a+b=b+a$'}]}],diagnoses:[{questionId:'Q1',evidence:'需要提示',stages:{transfer:'未检验'}}]};
 const inputs=[make(feedback),{name:'handoff.zip',bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})}];
 const parsed=ingest(initialState(),await readInputs(inputs));
 assert.equal(Object.keys(parsed.state.records).length,1); assert.equal(parsed.assets.size,1); assert.equal(parsed.warnings.length,1);
 const note=generate(parsed).find(f=>f.path.endsWith('.md')&&f.path.includes('/条目/'));
 assert.match(note.content,/我的作答/); assert.match(note.content,/未检验/); assert.match(note.content,/!\[\[/);
 const vault=new FakeVault(); await writer.write(vault,parsed);
 const path=[...parsed.assets.keys()][0]; assert.deepEqual(new Uint8Array(await vault.readBinary(vault.getAbstractFileByPath(path))),photo);
});

test('不完整、未知版本、循环目录与重复节点在写入前拒绝',async()=>{
 await assert.rejects(()=>readInputs([make({format:'unknown'})]),/格式不支持/);
 let data=review(); data.schemaVersion=99; assert.throws(()=>ingest(initialState(),{documents:[{data,name:'x'}],warnings:[]}),/暂不支持/);
 data=review(); data.nodes[0].parentId='det'; assert.throws(()=>ingest(initialState(),{documents:[{data,name:'x'}],warnings:[]}),/循环/);
 data=review(); data.nodes.push(data.nodes[1]); assert.throws(()=>ingest(initialState(),{documents:[{data,name:'x'}],warnings:[]}),/重复/);
});

test('ZIP 路径穿越和宣称超大展开大小被拒绝',async()=>{
 let z=new JSZip(); z.file('../outside.json',JSON.stringify(review()));
 await assert.rejects(()=>z.generateAsync({type:'uint8array'}).then(bytes=>readInputs([{name:'bad.zip',bytes}])) ,/路径/);
 z=new JSZip(); z.file('data.json',JSON.stringify(review())); const bytes=await z.generateAsync({type:'uint8array'});
 const view=new DataView(bytes.buffer); let offset=-1;
 for(let i=0;i<bytes.length-4;i++) if(view.getUint32(i,true)===0x02014b50) {offset=i;break;}
 view.setUint32(offset+24,100*1024*1024,true);
 await assert.rejects(()=>readInputs([{name:'big.zip',bytes}]),/过大/);
});

test('构建包可在无 Node / Electron API 的环境加载',()=>{
 const content=fs.readFileSync(require.resolve('../main.js'),'utf8');
 const requested=[]; const obsidian={Plugin:class{},Modal:class{},Notice:class{},PluginSettingTab:class{},Setting:class{}};
 const context={module:{exports:{}},require:name=>{requested.push(name);if(name==='obsidian')return obsidian;throw new Error('Desktop-only dependency: '+name);},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,setTimeout,clearTimeout,console};
 vm.runInNewContext(content,context); assert.equal(typeof context.module.exports,'function'); assert.deepEqual([...new Set(requested)],['obsidian']);
});

test('浏览器版构建在无 Buffer、process 或外部模块的沙箱中解压并导入 ZIP',async()=>{
 const zip=new JSZip();zip.file('review.json',JSON.stringify(review()));
 const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 const obsidian={Plugin:class{},Modal:class{},Notice:class{},PluginSettingTab:class{},Setting:class{}};
 const context={module:{exports:{}},require:name=>{if(name==='obsidian')return obsidian;throw new Error(name);},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,setTimeout,clearTimeout,console};
 context.window=context; context.self=context;
 const content=fs.readFileSync(require.resolve('../main.js'),'utf8');
 vm.runInNewContext(content+"\nmodule.exports.testRead=__load('src/archive.cjs').readInputs;module.exports.testCore=__load('src/core.cjs');",context);
 const bundle=await context.module.exports.testRead([{name:'demo.zip',bytes}]);
 const core=context.module.exports.testCore, imported=core.ingest(core.initialState(),bundle);
 assert.equal(Object.keys(imported.state.records).length,3);assert.ok(core.generate(imported).some(f=>f.path.endsWith('.canvas')));
});
