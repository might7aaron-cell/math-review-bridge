'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {validate,parseText,combine}=require('../scripts/validate-math-review.cjs');
const {initialState,ingest,generate}=require('../src/core.cjs');
const {readInputs}=require('../src/archive.cjs');
const writer=require('../src/writer.cjs');
const {FakeVault}=require('./fake-vault.cjs');
const base=path.join(__dirname,'fixtures/authoring');
const minimal=()=>JSON.parse(fs.readFileSync(path.join(base,'valid/minimal.json'),'utf8'));
const examples=['demo.math-review.json','learning/analysis.math-review.json','learning/algebra.math-review.json'];
const cli=path.join(__dirname,'../scripts/validate-math-review.cjs');
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});

test('既有演示与两科完整示例通过严格生成规范',()=>{
  for(const file of examples){const text=fs.readFileSync(path.join(__dirname,'../examples',file),'utf8');const parsed=parseText(text);assert.deepEqual(parsed.errors,[]);const r=validate(parsed.data);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.deepEqual(r.warnings,[]);}
});
const expected={
  'invalid-kind':'kind','duplicate-id':'duplicate-node','dangling-reference':'reference',
  'parent-cycle':'cycle','missing-chapter':'chapter','wrong-self-check':'type',
  'unknown-field':'unknown-field','latex-control-character':'control-character',
  'cross-chapter-parent':'parent','trailing-comma':'json','duplicate-key':'duplicate-key'
};
for(const [name,code] of Object.entries(expected)) test('错误夹具拒绝：'+name,()=>{
  const parsed=parseText(fs.readFileSync(path.join(base,'invalid',name+'.json'),'utf8'));
  const errors=parsed.errors.length?parsed.errors:validate(parsed.data).errors;
  assert.ok(errors.some(e=>e.code===code),JSON.stringify(errors));
  const result=run([path.join(base,'invalid',name+'.json')]);assert.equal(result.status,1);assert.match(result.stdout,/FAIL/);
});
test('错误类型、空值、学科不匹配、未知字段均给出诊断而非抛异常',()=>{
  for(const bad of [null,[],{},false,2,'text']) assert.equal(validate(bad).ok,false);
  for(const mutate of [
    x=>x.nodes.push(null),x=>x.chapters.push(null),x=>x.schemaVersion='2',
    x=>x.nodes[1].subjectId='algebra',x=>x.nodes[1].sections[0].body={},
    x=>x.nodes[1].related=[{id:'ma-test-group'}],x=>x.chapters[0].subjectId='gaodai',
    x=>x.nodes[1].source={label:'ok',reference:['wrong-key']},x=>x.progress={},
    x=>x.nodes[1].selfCheck={prompt:'问题'},x=>x.nodes[1].parentId='',
    x=>x.chapters.push({...x.chapters[0],subjectId:'algebra'}),x=>x.nodes[1].tags='定义'
  ]) {const x=minimal();mutate(x);assert.equal(validate(x).ok,false,JSON.stringify(x));}
});
test('根节点省略或 null、空包、边界长度与保留ID',()=>{
  const x=minimal();delete x.nodes[0].parentId;assert.equal(validate(x).ok,true);
  const empty=validate({format:'math-review',schemaVersion:2,chapters:[],nodes:[]});assert.equal(empty.ok,true);assert.equal(empty.warnings[0].code,'empty-pack');
  for(const id of ['constructor','prototype','__proto__','a/b','a:b','a'.repeat(121),'中文']) {const y=minimal();y.nodes[1].id=id;assert.equal(validate(y).ok,false);}
  x.nodes[1].summary='x'.repeat(4001);assert.ok(validate(x).errors.some(e=>e.path.endsWith('/summary')));
  x.nodes[1].summary='x'.repeat(4000);assert.equal(validate(x).ok,true);
});
test('self related、重复引用、父节点类型、跨章与过深层级',()=>{
  for(const related of [['ma-test-topic'],['ma-test-group','ma-test-group']]) {const x=minimal();x.nodes[1].related=related;assert.equal(validate(x).ok,false);}
  let x=minimal();x.nodes[0].kind='knowledge';assert.equal(validate(x).ok,false);
  x=minimal();x.nodes=Array.from({length:40},(_,i)=>({id:'n'+i,chapterId:'ma-test',parentId:i?'n'+(i-1):null,kind:'group',title:'层级'+i,sections:[]}));assert.ok(validate(x).errors.some(e=>e.code==='tree-depth'));
});
test('JSON 扫描处理 BOM、重复嵌套键、数组、转义引号与反斜杠',()=>{
  assert.equal(parseText('\uFEFF'+JSON.stringify(minimal())).errors[0].code,'encoding');
  for(const text of ['{"a":{"b":1,"b":2}}','[{"a":1,"a":2}]']) assert.equal(parseText(text).errors[0].code,'duplicate-key');
  for(const value of [{a:['a"b','\\frac',null,true,42,{},[]]},[],{},null]) assert.deepEqual(parseText(JSON.stringify(value)).data,value);
  assert.equal(parseText('```json\n{}\n```').errors[0].code,'json');
  assert.equal(parseText('['.repeat(66)+'0'+']'.repeat(66)).errors[0].code,'json');
});
test('多窗口合并解析跨章/跨学科双向关联；不依赖输入顺序',()=>{
  const a=minimal(),b=minimal();b.chapters=[{id:'alg-test',subjectId:'algebra',title:'代数'}];
  b.nodes=[{id:'alg-topic',chapterId:'alg-test',kind:'knowledge',title:'代数知识',sections:[{title:'正文',body:'示例'}],related:['ma-test-topic']}];
  a.nodes[1].related=['alg-topic'];assert.equal(validate(a).ok,false);assert.equal(validate(b).ok,false);
  for(const docs of [[a,b],[b,a]]){const r=combine(docs);assert.equal(r.ok,true,JSON.stringify(r.errors));const imported=ingest(initialState(),{documents:[{name:'merged.json',data:r.data}],warnings:[]});assert.deepEqual(imported.warnings,[]);assert.equal(Object.values(imported.state.records).filter(r=>r.relatedKeys.length===1).length,2);}
});
test('合并仅折叠完全相同对象；冲突版本和同文件重复不静默覆盖',()=>{
  const a=minimal(),b=minimal();assert.equal(combine([a,b]).data.nodes.length,2);
  b.nodes[1].summary='新版本';assert.ok(combine([a,b]).errors.some(e=>e.code==='merge-conflict'));
  const c=minimal();c.nodes.push(c.nodes[0]);assert.equal(combine([c]).ok,false);
  const d=minimal();d.chapters[0].subjectId='algebra';assert.equal(combine([a,d]).ok,false);
  const e=minimal();e.unrecognized=true;assert.equal(combine([a,e]).ok,false);
});
test('CLI 退出码、机器报告、合并输出、拒绝覆盖与失败无产物',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-review-authoring-'));
  try{
    const input=path.join(base,'valid/minimal.json'),out=path.join(dir,'merged.json');
    assert.equal(run([]).status,2);assert.equal(run(['--help']).status,0);
    assert.equal(run([input,input]).status,2);assert.equal(run(['--out']).status,2);
    assert.equal(run(['missing.json']).status,2);assert.equal(run(['--out',input,input]).status,2);
    let r=run(['--json','--out',out,input,input]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).ok,true);assert.equal(validate(JSON.parse(fs.readFileSync(out,'utf8'))).ok,true);
    const before=fs.readFileSync(out,'utf8');assert.equal(run(['--out',out,input]).status,2);assert.equal(fs.readFileSync(out,'utf8'),before);
    const fail=path.join(dir,'invalid.json');r=run(['--out',fail,path.join(base,'invalid/dangling-reference.json')]);assert.equal(r.status,1);assert.equal(fs.existsSync(fail),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('两科示例真实导入、生成有效链接与Canvas，并可幂等重导入',async()=>{
  const docs=examples.map(file=>({name:file,bytes:fs.readFileSync(path.join(__dirname,'../examples',file))}));
  const bundle=await readInputs(docs), imported=ingest(initialState(),bundle);assert.deepEqual(imported.warnings,[]);
  const files=generate(imported),paths=new Set(files.map(f=>f.path));
  assert.equal(Object.values(imported.state.records).length,26);
  for(const file of files){
    if(file.path.endsWith('.md'))for(const match of file.content.matchAll(/\[\[([^|\]#]+)[^\]]*\]\]/g))assert.ok(paths.has(match[1])||paths.has(match[1]+'.md'),match[1]);
    if(file.path.endsWith('.canvas')){const canvas=JSON.parse(file.content),ids=new Set(canvas.nodes.map(n=>n.id));assert.ok(canvas.nodes.every(n=>paths.has(n.file)));assert.ok(canvas.edges.every(e=>ids.has(e.fromNode)&&ids.has(e.toNode)));}
  }
  const proof=files.find(f=>f.path.endsWith('.md')&&f.content.includes("F'(x)"));assert.ok(proof);
  assert.ok(files.some(f=>f.content.includes('> [!question]- 展开参考答案')));
  const vault=new FakeVault();await writer.write(vault,imported);const before=vault.snapshot();
  const again=await writer.write(vault,ingest(imported.state,bundle));assert.equal(again.counts.create,0);assert.equal(again.counts.update,0);assert.equal(again.counts.conflict,0);assert.deepEqual(vault.snapshot(),before);
});
test('契约证据：插件容忍未知kind，但生成规范拦截；跨文件导入不保证跨章链接',()=>{
  const x=minimal();x.nodes[1].kind='theorem';assert.equal(validate(x).ok,false);
  assert.doesNotThrow(()=>ingest(initialState(),{documents:[{name:'x.json',data:x}],warnings:[]}));
  const a=minimal(),b=minimal();b.chapters=[{id:'alg-test',subjectId:'algebra',title:'代数'}];b.nodes=[{id:'alg-topic',chapterId:'alg-test',kind:'knowledge',title:'节点',sections:[]}];a.nodes[1].related=['alg-topic'];
  for(const docs of [[a,b],[b,a]]){const r=ingest(initialState(),{documents:docs.map(data=>({name:'file.json',data})),warnings:[]});assert.ok(r.warnings.some(w=>w.includes('alg-topic')));}
});
test('浏览器独立工具与CLI复用同一个校验器，无 Node 全局也可运行',()=>{
  const {build}=require('../scripts/build-math-review-check.cjs');
  const html=fs.readFileSync(path.join(__dirname,'../tools/math-review-check.html'),'utf8');assert.equal(html,build(),'修改校验器后请重新生成浏览器工具');
  const context={TextEncoder};vm.runInNewContext(fs.readFileSync(cli,'utf8'),context);
  assert.equal(context.MathReviewCheck.validate(minimal()).ok,true);
});

test('浏览器事件脚本：有效下载、修改后失效、文件合并、错误阻止下载',async()=>{
  // DOM harness exercises the shipped scripts, not a native Safari/device test.
  const elements=new Map();let blob=null;
  const element=()=>({value:'',textContent:'',disabled:false,files:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},click(){return this.listeners.click?.();},remove(){}});
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,body:{append(){}}};
  const context={document,TextEncoder,Blob:class{constructor(parts){blob=parts.join('');}},URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},setTimeout(fn){fn();}};
  const html=fs.readFileSync(path.join(__dirname,'../tools/math-review-check.html'),'utf8');
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInNewContext(script[1],context);
  const input=elements.get('input'),button=elements.get('check'),download=elements.get('download');
  input.value=JSON.stringify(minimal());input.listeners.input();await button.click();assert.match(elements.get('status').textContent,/通过/);assert.equal(download.disabled,false);download.click();assert.equal(validate(JSON.parse(blob)).ok,true);
  input.value='{bad';input.listeners.input();assert.equal(download.disabled,true);await button.click();assert.equal(elements.get('status').textContent,'未通过');assert.equal(download.disabled,true);
  const text=JSON.stringify(minimal());elements.get('files').files=[{name:'a.json',size:text.length,text:async()=>text},{name:'b.json',size:text.length,text:async()=>text}];elements.get('files').listeners.change();await button.click();assert.equal(download.disabled,false);assert.match(elements.get('status').textContent,/1 章 \/ 2 节点/);
});
