import {readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, existsSync} from 'node:fs';
const files=Object.fromEntries(readdirSync('web').map(f=>[f,readFileSync('web/'+f,'utf8')]));
mkdirSync('dist/server',{recursive:true});
if (existsSync('.openai/hosting.json')) {
  mkdirSync('dist/.openai', {recursive: true});
  copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
}
writeFileSync('dist/server/index.js','const files='+JSON.stringify(files)+';\n'+readFileSync('worker/pnr.js','utf8')+'\n'+readFileSync('worker/handler.js','utf8'));
