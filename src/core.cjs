'use strict';
const SUBJECTS = { algebra: '高等代数', analysis: '数学分析' };
const DEFAULT_ROOT = '数学学习桥';
const text = v => v == null ? '' : String(v);
const arr = v => Array.isArray(v) ? v : [];
const key = (...parts) => JSON.stringify(parts.map(text));
const clone = v => JSON.parse(JSON.stringify(v));
function hash(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let a = 2166136261, b = 3339675911;
  for (const c of bytes) { a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function safe(value) {
  return text(value).normalize('NFC').replace(/[\x00-\x1f\\/:*?"<>|#\[\]^]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 65) || '未命名';
}
function rootPath(value) {
  const input = text(value).trim();
  if (!input || input.startsWith('/') || input.includes('\\') || input.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.'))) throw new Error('资料目录必须是笔记库内的普通文件夹。');
  return input.split('/').map(safe).join('/');
}
function subject(value) {
  let v = text(typeof value === 'object' && value ? value.id || value.name : value).toLowerCase();
  if (!v || ['algebra', 'higher-algebra', 'gaodai', '高代', '高等代数'].includes(v)) return 'algebra';
  if (['analysis', 'math-analysis', 'mathematical-analysis', 'shufen', '数分', '数学分析'].includes(v)) return 'analysis';
  return v;
}
function md(value) {
  return text(value).split(/(```[\s\S]*?```|`[^`\n]+`)/g).map(part => part.startsWith('`') ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, s) => '\n$$\n' + s + '\n$$\n')
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, s) => '$' + s + '$'))
    .join('').replace(/<!-- msb:/g, '&lt;!-- msb:');
}
function label(value) { return text(value).replace(/[\r\n|\[\]]/g, ' ').trim(); }
function block(title, value) { return value === undefined || value === null || value === '' ? '' : `\n## ${label(title)}\n\n${md(value)}\n`; }
function detail(value, level = 0) {
  if (value == null) return '';
  if (typeof value !== 'object') return md(value);
  if (level > 8) return '（内容层级过深，已折叠省略）';
  if (Array.isArray(value)) return value.map(v => '- ' + detail(v, level + 1).replace(/\n/g, '\n  ')).join('\n');
  const labels = { recognition:'结构辨认', selection:'工具选择', reasoning:'关键推理', transfer:'迁移', before:'原思路', after:'修正动作', evidence:'证据', bottleneck:'卡点', nextCheck:'下一次检验', thinkingChange:'思路变化', stages:'原有诊断', questionId:'题号', methodId:'方法编号', trigger:'触发线索', invariant:'结构', action:'关键动作', boundary:'成立条件', counterexample:'边界与反例', outline:'作答', result:'原记录结果', blockers:'卡点', minutes:'分钟', hintSeen:'是否看过提示', mode:'作答方式', createdAt:'记录时间', date:'日期', goal:'检验目标', reason:'安排依据', basis:'安排依据', budgetMinutes:'时间上限（分钟）' };
  return Object.entries(value).map(([k,v]) => `- **${label(labels[k] || k)}**：${detail(v,level+1).replace(/\n/g,'\n  ')}`).join('\n');
}
function sections(values) { return arr(values).map(s => block(s.title || '内容', s.body)).join(''); }
function selfCheck(check) {
  if (!check || !check.prompt) return '';
  let result = block('独立检验', check.prompt);
  if (check.answer) result += '\n> [!question]- 展开参考答案\n' + md(check.answer).split('\n').map(l => '> ' + l).join('\n') + '\n';
  return result;
}
function initialState(root = DEFAULT_ROOT) { return { schemaVersion:1, root:rootPath(root), chapters:{}, records:{}, bindings:{} }; }
function requireId(value, where) {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new Error(where + ' 缺少有效的稳定 ID。');
  return value;
}
function wiki(path, title) { return `[[${path.replace(/\.md$/,'')}|${label(title)}]]`; }
function chapterKey(origin, sub, id) { return key('chapter',origin,sub,id); }
function recordKey(origin, sub, ch, id) { return key('record',origin,sub,ch,id); }
function noteName(title) {
  const superscript={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','n':'ⁿ','+':'⁺','-':'⁻'};
  return safe(text(title).replace(/\\[()[\]]|\$/g,'').replace(/\\det\b/g,'det')
    .replace(/\^(?:\{([0-9n+-]+)\}|([0-9n+-]))/g,(_,group,single)=>[...(group||single)].map(c=>superscript[c]).join('')));
}

function readablePaths(state) {
  const records=Object.values(state.records);
  const legacy=r=>`${state.chapters[r.chapterKey].folder}/条目/${safe(r.id)}--${hash(r.key).slice(0,10)}.md`;
  const pending=records.filter(r=>!r.path || r.path===legacy(r));
  const used=new Set(records.filter(r=>!pending.includes(r)).map(r=>r.path.toLowerCase()));
  for(const r of pending) {
    const base=`${state.chapters[r.chapterKey].folder}/条目/${noteName(r.title)}`;
    let path=base+'.md', index=2;
    while(used.has(path.toLowerCase())) path=`${base}（${index++}）.md`;
    if(r.path && r.path!==path) r.previousPath=r.path;
    r.path=path; used.add(path.toLowerCase());
  }
}

function ingest(state, bundle) {
  const next = clone(state || initialState());
  if (next.schemaVersion !== 1) throw new Error('本地插件数据版本不兼容，请保留 data.json 后联系维护者。');
  next.root = rootPath(next.root);
  const warnings = [...bundle.warnings], assets = new Map(), originals = new Map(), touched = new Set();
  const root = next.root;
  function addChapter(origin, sub, id, title, description) {
    requireId(id,'章节');
    const k = chapterKey(origin,sub,id), old = next.chapters[k];
    const ch = next.chapters[k] = { ...old, key:k, origin, subject:sub, id, title:title || old?.title || id, description:description || old?.description || '' };
    ch.folder = old?.folder || `${root}/${safe(SUBJECTS[sub] || sub)}/${origin === 'review' ? '章节复习' : '做题反馈'}/${safe(ch.title)}--${hash(k).slice(0,10)}`;
    ch.path = ch.folder + '/章节目录.md';
    return ch;
  }
  function upsert(ch,id,title,type,part,body,source,extra = {}) {
    requireId(id,'条目');
    const k = recordKey(ch.origin,ch.subject,ch.id,id), old = next.records[k];
    const rec = next.records[k] = { ...old, key:k, id, chapterKey:ch.key, subject:ch.subject, title:title || old?.title || id, type:type || old?.type || '条目', parts:{...old?.parts}, originals:[...new Set([...(old?.originals || []),source])], ...extra };
    rec.parts[part] = body;
    touched.add(k); return rec;
  }
  for (const doc of bundle.documents) {
    const d = doc.data, version = Number(d.schemaVersion || 1);
    const allowed = d.format === 'gaodai-handoff' ? [1] : [1,2];
    if (!allowed.includes(version)) throw new Error(`${doc.name} 的 schemaVersion ${version} 暂不支持；没有写入文件。`);
    const raw = JSON.stringify(d,null,2) + '\n';
    const rawPath = `${root}/_导入原文/${safe(d.id || d.format)}--${hash(raw)}.json`;
    originals.set(rawPath,raw);
    if (d.format === 'math-review') {
      if (!Array.isArray(d.chapters) || !Array.isArray(d.nodes)) throw new Error('math-review 必须包含 chapters 和 nodes 数组。');
      const localChapters = new Map(), nodes = new Map(), records = [];
      for (const c of d.chapters) {
        const sub = subject(c.subjectId || c.subject || d.subjectId || d.subject);
        const ch = addChapter('review',sub,c.id,c.title,c.description);
        const same = localChapters.get(c.id) || [];
        if (same.some(x=>x.subject===sub)) throw new Error('重复的章节 ID：'+c.id);
        same.push(ch); localChapters.set(c.id,same);
      }
      for (const n of d.nodes) {
        const candidates = localChapters.get(n.chapterId) || [];
        const ch = n.subjectId ? candidates.find(c=>c.subject===subject(n.subjectId)) : (candidates.length === 1 ? candidates[0] : null);
        if (!ch) throw new Error(`节点 ${n.id} 的章节不存在或学科不明确。`);
        let body = block('摘要',n.summary) + block('我的问题',n.question) + block('已有证据',n.evidence) + sections(n.sections) + selfCheck(n.selfCheck);
        if (n.historicalDiagnosis) body += block('历史诊断（保留原记录）',detail(n.historicalDiagnosis));
        if (n.source) body += block('资料来源',detail(n.source));
        if (arr(n.tags).length) body += block('原标签',arr(n.tags).map(label).join(' · '));
        const rec = upsert(ch,n.id,n.title,({group:'目录',knowledge:'知识点',question:'追问'})[n.kind] || n.kind,'review',body,rawPath,{parentKey:n.parentId ? recordKey('review',ch.subject,ch.id,n.parentId) : null});
        if (records.some(x=>x.rec.key===rec.key)) throw new Error('重复的节点 ID：'+n.id);
        records.push({rec,n,ch}); const bucket = nodes.get(n.id) || []; bucket.push(rec.key); nodes.set(n.id,bucket);
      }
      for (const {rec,n,ch} of records) {
        rec.relatedKeys = [];
        for (const rel of arr(n.related)) {
          const targetId = typeof rel === 'string' ? rel : rel.id;
          const same = recordKey('review',ch.subject,ch.id,targetId);
          const target = next.records[same] ? same : nodes.get(targetId)?.length === 1 ? nodes.get(targetId)[0] : null;
          if (target && target !== rec.key) rec.relatedKeys.push(target);
          else warnings.push(`${rec.title}：关联 ${targetId} 未解析，原数据已保留。`);
        }
      }
    } else {
      const sub = subject(d.subject || d.subjectId);
      const ch = addChapter('workbench',sub,requireId(d.chapterId,'工作台章节'),d.chapterTitle);
      const q = (id,title,part,body,extra) => upsert(ch,id,title,'题目',part,body,rawPath,extra);
      if (d.format === 'gaodai-handoff') {
        if (!Array.isArray(d.questionIndex)) throw new Error('交接包缺少 questionIndex；暂不支持此工作台导出变体。');
        const mediaPaths = {};
        for (const [id,photo] of Object.entries(doc.media || {})) {
          const extension = photo.name.split('.').pop().toLowerCase();
          const path = `${root}/_附件/${hash(photo.bytes)}.${extension}`;
          assets.set(path,photo.bytes); mediaPaths[id] = path;
        }
        const photoText = ids => arr(ids).map(id => {
          if (mediaPaths[id]) return `![[${mediaPaths[id]}]]`;
          warnings.push(`手写图片 ${id} 未包含在本次资料中。`); return `手写图片 ${label(id)} 未包含；可补导原始 ZIP。`;
        }).join('\n\n');
        for (const item of d.questionIndex) {
          let body = block('题目',item.text_latex || item.prompt) + block('原题定位',item.locator) + block('辨识与路线',detail(item.recognition_and_route)) + block('易错点',detail(item.pitfalls)) + block('保留理由',item.retention_reason) + block('独立检验',item.self_check) + block('方法分支',detail(item.method_tracks));
          q(item.id,item.title || item.prompt,'question',body);
        }
        const seenAttempts = new Set();
        for (const a of [...arr(d.historyAttempts),...arr(d.attempts)]) {
          const akey = a.id || hash(JSON.stringify(a));
          if (seenAttempts.has(akey)) continue; seenAttempts.add(akey);
          if (!a.questionId) continue;
          const fields = {date:a.date,createdAt:a.createdAt,methodId:a.methodId,outline:a.outline,result:a.result,blockers:a.blockers,minutes:a.minutes,hintSeen:a.hintSeen,mode:a.mode};
          q(a.questionId,null,'attempt/'+akey,block('作答记录 · '+(a.date || ''),detail(fields))+'\n'+photoText(a.photoIds));
        }
        for (const [draftKey,draft] of Object.entries(d.drafts || {})) {
          const prefix = ch.id + '::'; if (!draftKey.startsWith(prefix)) continue;
          const id = draftKey.slice(prefix.length);
          q(id,null,'draft',block('最近草稿',detail({outline:draft.outline,result:draft.result,blockers:draft.blockers,minutes:draft.minutes}))+'\n'+photoText(draft.photoIds));
        }
        // Feedback embedded in a handoff uses the same adapter and IDs as a standalone feedback file.
        for (const f of arr(d.feedbacks)) {
          if (!f || f.format !== 'gaodai-feedback') { warnings.push('一个内嵌反馈格式未识别，已保留在导入原文中。'); continue; }
          const embedded = ingest(next,{documents:[{data:{...f,chapterId:f.chapterId||ch.id,subject:sub},name:doc.name+' 内嵌反馈',media:{}}],warnings:[]});
          Object.assign(next,embedded.state);
          for (const [p,c] of embedded.originals) originals.set(p,c);
          warnings.push(...embedded.warnings);
        }
      } else if (d.format === 'gaodai-feedback') {
        const fid = requireId(d.id,'反馈');
        const perQuestion = new Map();
        function add(id,body) { requireId(id,'反馈题目'); perQuestion.set(id,(perQuestion.get(id)||'')+body); }
        for (const r of arr(d.questionReviews)) add(r.questionId,block('逐题讲解 · '+(r.title || r.questionId),r.methodId ? '方法编号：'+r.methodId : '') + sections(r.sections) + selfCheck(r.selfCheck));
        for (const diag of arr(d.diagnoses)) add(diag.questionId,block('作答诊断（不代表已独立掌握）',detail(diag)));
        for (const [qid,body] of perQuestion) q(qid,null,'feedback/'+fid,block('反馈 · '+(d.date || fid),d.summary)+body);
        for (const model of arr(d.modelCards)) {
          const {id,title,evidenceQuestionIds,...fields}=model;
          upsert(ch,'model:'+requireId(id,'模型卡'),title,'方法卡','model',detail(fields),rawPath,{relatedKeys:arr(evidenceQuestionIds).map(qid=>recordKey('workbench',sub,ch.id,qid))});
        }
        if (d.nextPlan) {
          const plan=d.nextPlan, body=block('计划依据',plan.basis)+block('时间上限',plan.budgetMinutes == null ? '' : `${plan.budgetMinutes} 分钟`)+arr(plan.tasks).map(t=>block('检验 · '+(t.questionId || ''),detail(t))).join('');
          upsert(ch,'plan:'+fid,plan.title || '下一轮检验','复习计划','plan',body,rawPath,{relatedKeys:arr(plan.tasks).filter(t=>t.questionId).map(t=>recordKey('workbench',sub,ch.id,t.questionId))});
        }
      } else throw new Error('未知导出格式。');
    }
  }
  for (const r of Object.values(next.records)) {
    if (r.parentKey && !next.records[r.parentKey]) warnings.push(`${r.title}：父节点未导入，暂列在章节根目录。`);
    let at=r, seen=new Set();
    while(at?.parentKey && next.records[at.parentKey]) {
      if(seen.has(at.key)) throw new Error('章节树存在循环，请修正 parentId 后重新导入。');
      seen.add(at.key); at=next.records[at.parentKey];
    }
  }
  if (Object.keys(next.records).length > 10000) throw new Error('条目过多；建议按学科拆分笔记库。');
  readablePaths(next);
  return {state:next,warnings:[...new Set(warnings)],assets,originals,touched:touched.size};
}

function managed(keyValue, body) {
  const token=hash(keyValue);
  return `<!-- msb:${token}:begin -->\n${body.trim()}\n<!-- msb:${token}:end -->`;
}
function extractManaged(content,k) {
  const token=hash(k), start=`<!-- msb:${token}:begin -->`, end=`<!-- msb:${token}:end -->`;
  const a=content.indexOf(start), b=content.indexOf(end);
  if(a<0 || b<a || content.indexOf(start,a+start.length)>=0 || content.indexOf(end,b+end.length)>=0) return null;
  return {start:a,end:b+end.length,block:content.slice(a,b+end.length)};
}
function reconcile(existing,file,binding) {
  const suffix='\n\n## 我的笔记\n\n在这里写自己的理解；重复导入会保留本区域。\n';
  const desired=file.managed ? managed(file.key,file.content) : file.content;
  const signature=hash(desired);
  const nextBinding={key:file.key,signature,managed:!!file.managed};
  if(existing===null) return {action:'create',content:desired+(file.managed ? suffix : ''),binding:nextBinding};
  if(file.immutable) return existing===desired ? {action:'skip',binding:nextBinding} : {action:'conflict',content:desired};
  if(!binding || binding.key!==file.key) return {action:'conflict',content:desired+(file.managed?suffix:'')};
  // There is no incoming change; keep the user's local edits without a conflict copy.
  if(signature===binding.signature) return {action:'skip',binding};
  if(file.managed) {
    const current=extractManaged(existing,file.key);
    if(!current) return {action:'conflict',content:desired+suffix};
    if(current.block===desired) return {action:'skip',binding:nextBinding};
    if(hash(current.block)!==binding.signature) return {action:'conflict',content:desired+suffix};
    return {action:'update',content:existing.slice(0,current.start)+desired+existing.slice(current.end),binding:nextBinding};
  }
  if(existing===desired) return {action:'skip',binding:nextBinding};
  if(hash(existing)!==binding.signature) return {action:'conflict',content:desired};
  return {action:'update',content:desired,binding:nextBinding};
}

function generate(imported) {
  const s=imported.state, files=[], list=Object.values(s.records), root=s.root;
  const add=(path,k,content,managed=true,immutable=false)=>files.push({path,key:k,content,managed,immutable});
  const link=r=>wiki(r.path,r.title);
  for(const [path,content] of imported.originals) add(path,'raw:'+path,content,false,true);
  for(const r of list) {
    const ch=s.chapters[r.chapterKey];
    let body=`# ${label(r.title)}\n\n${wiki(ch.path,ch.title)} · ${label(r.type)}\n`;
    if(r.parentKey && s.records[r.parentKey]) body+='\n上级：'+link(s.records[r.parentKey])+'\n';
    body+=Object.values(r.parts).join('\n');
    const children=list.filter(x=>x.parentKey===r.key);
    if(children.length) body+=block('下级条目',children.map(x=>'- '+link(x)).join('\n'));
    const relations=[...new Set(r.relatedKeys || [])].map(k=>s.records[k]).filter(Boolean);
    if(relations.length) body+=block('关联内容',relations.map(x=>'- '+link(x)).join('\n'));
    add(r.path,r.key,body);
  }
  const originLabel=o=>o==='review'?'章节复习':'做题反馈';
  for(const ch of Object.values(s.chapters)) {
    const entries=list.filter(r=>r.chapterKey===ch.key), roots=entries.filter(r=>!r.parentKey || !s.records[r.parentKey]);
    function tree(items,depth=0) {
      return items.map(r=>'  '.repeat(depth)+'- '+link(r)+'\n'+tree(entries.filter(x=>x.parentKey===r.key),depth+1)).join('');
    }
    const canvasPath=ch.folder+'/章节关系.canvas';
    const body=`# ${label(ch.title)}\n\n${wiki(root+'/首页.md','学习首页')} · ${SUBJECTS[ch.subject] || ch.subject} · ${originLabel(ch.origin)}\n\n${md(ch.description)}\n\n${wiki(canvasPath,'打开章节关系画布')}\n\n${entries.length ? tree(roots) : '本章尚未导入具体条目。'}\n\n导入讲解不会自动标为独立掌握。\n`;
    add(ch.path,ch.key,body);
    const canvas={nodes:[],edges:[]}; let cursor=0;
    function layout(r,depth) {
      const children=entries.filter(x=>x.parentKey===r.key);
      const childNodes=children.map(x=>layout(x,depth+1));
      const y=childNodes.length ? Math.round((childNodes[0].y+childNodes.at(-1).y)/2) : (cursor++ * 260);
      const n={id:hash(r.key),type:'file',file:r.path,x:depth*500,y,width:420,height:200};
      canvas.nodes.push(n);
      for(const child of childNodes) canvas.edges.push({id:hash(n.id+child.id),fromNode:n.id,fromSide:'right',toNode:child.id,toSide:'left',label:'包含'});
      return n;
    }
    const rootNodes=roots.map(r=>layout(r,1));
    const center={id:hash(ch.key),type:'file',file:ch.path,x:0,y:rootNodes.length?Math.round((rootNodes[0].y+rootNodes.at(-1).y)/2):0,width:420,height:240};
    canvas.nodes.unshift(center);
    for(const n of rootNodes) canvas.edges.push({id:hash(center.id+n.id),fromNode:center.id,fromSide:'right',toNode:n.id,toSide:'left'});
    const nodeIds=new Set(entries.map(r=>r.key));
    for(const r of entries) for(const target of new Set(r.relatedKeys||[])) if(nodeIds.has(target) && target!==r.key) canvas.edges.push({id:hash(r.key+target),fromNode:hash(r.key),fromSide:'bottom',toNode:hash(target),toSide:'top',color:'5',label:'关联'});
    add(canvasPath,'canvas:'+ch.key,JSON.stringify(canvas,null,2)+'\n',false);
  }
  const subs=new Set(['algebra','analysis',...Object.values(s.chapters).map(c=>c.subject)]);
  let home='# 数学学习桥\n\n从这里进入章节，点击链接查看知识点、追问和做题反馈。\n\n';
  for(const sub of subs) {
    const path=root+'/'+safe(SUBJECTS[sub]||sub)+'/学科目录.md', chapters=Object.values(s.chapters).filter(c=>c.subject===sub);
    home+='- '+wiki(path,SUBJECTS[sub]||sub)+` · ${chapters.length} 个章节目录\n`;
    let body=`# ${SUBJECTS[sub]||sub}\n\n${wiki(root+'/首页.md','学习首页')}\n`;
    for(const origin of ['review','workbench']) body+=block(originLabel(origin),chapters.filter(c=>c.origin===origin).map(c=>'- '+wiki(c.path,c.title)).join('\n') || '暂无资料。');
    add(path,'subject:'+sub,body);
  }
  home+='\n## 日常使用\n\n1. 继续在复习台学习，导出 JSON 或 ZIP。\n2. 运行「数学学习桥：导入复习资料」。\n3. 查看章节目录、关联笔记或 Canvas，在每页「我的笔记」补充理解。\n\n本版是资料单向导入；Obsidian 中的修改不会自动写回网页。导入区发生手动修改时，更新内容另存到 `_冲突` 目录。\n';
  add(root+'/首页.md','home',home);
  const paths=new Set();
  for(const f of files) { if(paths.has(f.path)) throw new Error('生成文件发生路径冲突，尚未写入。'); paths.add(f.path); }
  return files;
}
module.exports={SUBJECTS,DEFAULT_ROOT,initialState,ingest,generate,reconcile,hash,rootPath,managed,extractManaged,md};

