'use strict';
// Optional standalone browser helper. Does not change the plugin build or release.
const fs = require('node:fs');
const path = require('node:path');
function build() {
  const checker = fs.readFileSync(path.join(__dirname,'validate-math-review.cjs'),'utf8');
  return `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>数学资料检查</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f1;color:#202b27;font:17px/1.65 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px 24px}h1{font-size:30px;margin:4px 0}p{margin:10px 0}.tag{color:#356c59;font-size:13px;letter-spacing:.12em}.panel{background:white;border:1px solid #dbe2da;border-radius:16px;padding:24px;margin:24px 0}label{display:block;font-weight:600;margin-bottom:10px}textarea{width:100%;min-height:260px;resize:vertical;padding:14px;border:1px solid #a4b5a9;border-radius:8px;font:14px/1.5 ui-monospace,monospace}button{border:0;border-radius:8px;background:#285e4b;color:white;font:inherit;padding:11px 18px;cursor:pointer}button:disabled{opacity:.45;cursor:default}input{max-width:100%;font:inherit}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.65 ui-monospace,monospace}.muted{font-size:14px;color:#5d6f64}a{color:#285e4b}:focus-visible{outline:3px solid #ba791b;outline-offset:3px}
</style><main><div class="tag">MATH REVIEW · v2</div><h1>先检查，再导入</h1>
<p>粘贴一份 JSON，或选择多个学习窗口的文件。跨章节关联会在合并后检查。</p>
<p class="muted">内容只在本页内存中处理，没有上传或自动保存。结构通过不代表数学证明、出处或个人诊断正确。</p>
<section class="panel"><label for="files">选择 JSON 文件（可多选）</label><input id="files" type="file" accept=".json,application/json" multiple><p id="selection" class="muted">尚未选择文件；也可以在下面粘贴。</p>
<label for="input">或粘贴完整 JSON</label><textarea id="input" spellcheck="false" placeholder="从 { 开始，到 } 结束，不含代码围栏"></textarea>
<div class="actions"><button id="check">检查并准备导入文件</button><button id="download" disabled>下载通过检查的 JSON</button></div></section>
<section class="panel" aria-live="polite"><strong id="status">等待检查</strong><pre id="report">检查字段、ID、层级、章节归属、引用与常见转义错误。</pre></section>
<p class="muted">生成规范 authoring-v1；仅接收 math-review v2。未知字段会报错；不同内容使用同一 ID 时停止合并，请先决定采用哪个完整版本。复习台导出请选择“资料 JSON”，不要选择完整备份。</p></main>
<script>
${checker.replace(/<\/script/gi,'<\\/script')}
</script><script>
'use strict';
const api=globalThis.MathReviewCheck, byId=id=>document.getElementById(id);
const input=byId('input'),files=byId('files'),button=byId('check'),download=byId('download');
let output=null, revision=0;
function reset(){revision++;output=null;download.disabled=true;byId('status').textContent='等待重新检查';byId('report').textContent='输入已变更，旧结果已失效。';}
input.addEventListener('input',()=>{files.value='';byId('selection').textContent='使用粘贴内容。';reset();});
files.addEventListener('change',()=>{input.value='';byId('selection').textContent=files.files.length+' 个文件已选择。';reset();});
button.addEventListener('click',async()=>{
  reset();const stamp=revision;button.disabled=true;
  try{
    const values=[],errors=[];
    if(files.files.length){for(const file of files.files){
      if(file.size>api.MAX_BYTES){errors.push({code:'size',path:file.name,message:'文件超过30 MiB。'});continue;}
      const result=api.parseText(await file.text());
      errors.push(...result.errors.map(e=>({...e,path:file.name+e.path})));
      if(!result.errors.length)values.push(result.data);
    }}else{const result=api.parseText(input.value);errors.push(...result.errors);if(!result.errors.length)values.push(result.data);}
    if(stamp!==revision)return;
    const result=errors.length?{ok:false,errors,warnings:[]}:api.combine(values);
    if(result.ok){output=JSON.stringify(result.data,null,2)+'\\n';if(new TextEncoder().encode(output).length>api.MAX_BYTES){result.ok=false;output=null;result.errors.push({code:'size',path:'',message:'格式化后的输出超过30 MiB。'});}}
    byId('status').textContent=result.ok?'通过：'+result.stats.chapters+' 章 / '+result.stats.nodes+' 节点':'未通过';
    byId('report').textContent=[...result.errors.map(e=>'ERROR ['+e.code+'] '+e.path+': '+e.message),...result.warnings.map(e=>'WARN ['+e.code+'] '+e.path+': '+e.message)].join('\\n')||(result.ok?'可下载同一份 JSON，再导入复习台或数学学习桥。':'未生成导入文件。');
    download.disabled=!result.ok;
  }catch(e){if(stamp===revision){byId('status').textContent='读取失败';byId('report').textContent=e.message;output=null;download.disabled=true;}}
  finally{button.disabled=false;}
});
download.addEventListener('click',()=>{if(!output)return;const url=URL.createObjectURL(new Blob([output],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='checked.math-review.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
</script></html>\n`;
}
if(require.main===module) {
  const output=path.join(__dirname,'../tools/math-review-check.html');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,build());
  console.log('Built tools/math-review-check.html (standalone; no plugin build changes).');
}
module.exports={build};
