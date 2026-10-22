'use strict';
class FakeVault {
  constructor() { this.files=new Map(); }
  getAbstractFileByPath(path) { return this.files.get(path) || null; }
  async createFolder(path) { if(this.files.has(path)) throw new Error('Already exists'); const f={path,children:[]}; this.files.set(path,f); return f; }
  async create(path,content) { if(this.files.has(path)) throw new Error('Already exists'); const f={path,content}; this.files.set(path,f); return f; }
  async createBinary(path,bytes) { return this.create(path,new Uint8Array(bytes)); }
  async read(file) { if(typeof file.content!=='string') throw new Error('Not text'); return file.content; }
  async readBinary(file) { return file.content.buffer.slice(file.content.byteOffset,file.content.byteOffset+file.content.byteLength); }
  async process(file,fn) { const result=fn(file.content); file.content=result; return result; }
  async rename(file,path) { if(this.files.has(path)) throw new Error('Already exists'); this.files.delete(file.path); file.path=path; this.files.set(path,file); }
  snapshot() { return [...this.files.values()].filter(f=>!f.children).map(f=>[f.path,typeof f.content==='string'?f.content:Array.from(f.content)]); }
}
module.exports={FakeVault};

