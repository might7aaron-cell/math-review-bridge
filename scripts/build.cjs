'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ids=['vendor/jszip.min.js','src/archive.cjs','src/core.cjs','src/writer.cjs','src/main.cjs'];
const modules=ids.map(id=>JSON.stringify(id)+': function(module,exports,require){\n'+fs.readFileSync(path.join(root,id),'utf8')+'\n}').join(',\n');
const output=`/* 数学学习桥 0.1.1 — MIT. JSZip 3.10.1 — MIT. See THIRD_PARTY_LICENSES.md. */
'use strict';
const __modules={${modules}};
const __cache={};
const __externalRequire=require;
function __load(id){
 if(__cache[id])return __cache[id].exports;
 if(!__modules[id])return __externalRequire(id);
 const module={exports:{}};__cache[id]=module;
 const localRequire=name=>{
  if(!name.startsWith('.'))return __externalRequire(name);
  const parts=id.split('/');parts.pop();
  for(const p of name.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}
  return __load(parts.join('/'));
 };
 // JSZip's browser bundle must not probe Obsidian's optional desktop require.
 __modules[id](module,module.exports,id==='vendor/jszip.min.js'?undefined:localRequire);return module.exports;
}
module.exports=__load('src/main.cjs');
`;
fs.writeFileSync(path.join(root,'main.js'),output);
console.log('Built main.js: '+Buffer.byteLength(output)+' bytes');

