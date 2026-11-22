#!/usr/bin/env node
// Local source installer; no model provider, hosted execution or donor checkout required.
import path from 'node:path';import {readFile,writeFile,mkdir,lstat,realpath,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {acceptsPinnedVersion} from './congo-version-range.mjs';
import {fileURLToPath} from 'node:url';
import {chmod,open,rename,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const safeRelative=p=>typeof p==='string'&&p.length<1024&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/[. ]$/.test(s)&&!/^\.(?:git|env|codex|agents)(?:\.|$)/i.test(s)&&!/^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(s));
export const CLI_VERSION='0.6.0';
export const DEFAULT_REGISTRY='https://gocongo.ai';
const USAGE=`Congo ${CLI_VERSION}
Usage: congo COMMAND [options]

  workspace            Open Explore or show reference directions in Canvas
  skills               Install Congo and Congo Compete for Claude Code, Codex or Cursor
  login                Sign in in your browser
  logout               Revoke and remove this registry's saved sign-in
  whoami               Show your signed-in account and source subscription
  saved                List your Saved apps (your website bookmarks)
  templates            List full editable app templates (no project needed)
  create [ID]          Start a template in an empty --project folder; no ID lists templates
  search               Search screens, templates and handbooks (no project needed)
  categories           List screen categories for --category (no project needed)
  inspect ID [PATH]    List a screen's or app's files, or print one, without adding it (subscription)
  references [SEARCH]  Save free reference screenshots of Congo's apps into --out (default
                       references) with an index file; --app NAME, --category ID, --limit N, --all
  init [--new]         Connect an existing React/Vite project or create a minimal one
  add ID               Copy verified source into a connected project
  update ID            Update installed source, preserving your edits
  handbooks            List published and personal design handbooks
  handbook ID          Read a personal handbook as Markdown
  handbook save        Save --title NAME --file HANDBOOK.md [--id ID --description TEXT]

Common options:
  --project PATH       Choose a project folder
  --registry URL       Choose a trusted Congo origin (default: ${DEFAULT_REGISTRY})
  --json               JSON output; piped output also keeps the existing format
  --kind KIND          screen, template or handbook
  --query TEXT         Search text; --source APP and --category CATEGORY also filter
  --offset N --limit N  Page results (limit 1..100); --all retrieves all pages
  --destination PATH   Project-relative target for add/update
  --version VERSION    Select a resource version; congo --version shows CLI version
  --install            Install dependencies after create/add (install scripts stay off)
  --allow-scripts      With --install, let packages run their install scripts
  --yes                Write without asking after the summary
  --update-shared      Review and allow shared source updates
  --no-browser         Print the login URL without opening a browser

Examples:
  congo login
  congo templates
  congo create ghosted-template --project my-crm
  congo search --kind screen --query contacts
  congo references "pricing page"
  congo references --app bounced --out references/bounced

Browsing, search and reference screenshots are free. Source requires a Congo subscription ($30/month).
CI and automation can still supply CONGO_LIBRARY_TOKEN through a secret manager.
Help: https://gocongo.ai/guides/docs/cli`;
async function exists(p){try{return await lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function destination(root,rel){if(!safeRelative(rel))throw Error('Unsafe install target');let current=root;const parts=rel.split('/');for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);const st=await exists(current);if(st?.isSymbolicLink())throw Error('Refusing symlink/junction target');if(st?.isFile()&&st.nlink>1)throw Error('Refusing multiply-linked file target');if(st&&i<parts.length-1&&!st.isDirectory())throw Error('Target parent is not a directory');if(st){const actual=await realpath(current),relative=path.relative(root,actual);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Target escapes project containment');}}return current;}
export async function installBundle(root,bundle,config,{destination:target,create=false,update=false,updateShared=false,confirm,fingerprint}={}){
 root=await realpath(root);if(bundle.schemaVersion!==1||!Array.isArray(bundle.files)||!bundle.files.length||bundle.files.length>10000||!/^[-a-z0-9]+$/.test(bundle.id)||!['component','screen','flow','template','handbook'].includes(bundle.kind))throw Error('Invalid resource bundle');
 if(bundle.sourceLayout!==undefined&&(bundle.kind!=='component'||bundle.sourceLayout!=='shared-v1'))throw Error('Invalid source layout');
 if(create&&(bundle.kind!=='template'||(await readdir(root)).length))throw Error('Create requires a template and an empty destination');
 if(!create&&bundle.kind==='template')throw Error('Use create to start a template in a new project');
 const receiptPath=await destination(root,'.congo/'+bundle.id+'.json');
 const receipts=[];const receiptDir=await destination(root,'.congo');if(await exists(receiptDir))for(const name of await readdir(receiptDir)){if(!name.endsWith('.json'))continue;const file=await destination(root,'.congo/'+name),r=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(r.files)||r.files.some(f=>!safeRelative(f.path)||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Invalid installation receipt');receipts.push({file,r});}
 const previous=receipts.find(x=>x.r.id===bundle.id)?.r;
 // A release never changes: the same id and version must keep the fingerprint recorded when it was first installed.
 if(fingerprint&&previous?.version===bundle.version&&previous.fileListSha256&&previous.fileListSha256!==fingerprint)throw Error(`Tamper check failed: ${bundle.id}@${bundle.version} no longer matches the fingerprint recorded when you installed it. Nothing was written.`);
 const prefix=create?'':bundle.kind==='component'?config.components+(bundle.sourceLayout==='shared-v1'?'':'/'+bundle.id):target??(update?previous?.prefix:undefined);if(!create&&(!prefix||!safeRelative(prefix)))throw Error('Premium resources require an explicit project-relative --destination');
 if(update&&(!previous||previous.prefix!==prefix))throw Error('Update requires an existing receipt at the same destination');
 const pkgPath=await destination(root,'package.json'),pkg=create?{}:JSON.parse(await readFile(pkgPath,'utf8')),next=structuredClone(pkg),writes=[],names=new Set();let size=0;
 const changedReceipts=new Set();
 async function pristineUpgradeHint(){
  if(update||!previous||previous.prefix!==prefix||previous.version===bundle.version)return '';
  for(const f of previous.files){const file=await destination(root,f.path),st=await exists(file);if(!st?.isFile()||sha(await readFile(file))!==f.sha256)return '';}
  const quote=s=>"'"+String(s).replaceAll("'",process.platform==='win32'?"''":"'\\''")+"'";
  const command=['node',quote(fileURLToPath(import.meta.url)),'update',bundle.id,'--project',quote(root),'--version',quote(bundle.version)];if(bundle.kind!=='component')command.push('--destination',quote(prefix));
  return `Installed ${bundle.id}@${previous.version} is unchanged. To install ${bundle.version}, run:\n${command.join(' ')}`;
 }
 for(const f of bundle.files){if(!safeRelative(f.path)||!['utf8','base64'].includes(f.encoding)||names.has(f.path.toLowerCase()))throw Error('Unsafe/duplicate source path');names.add(f.path.toLowerCase());const bytes=Buffer.from(f.content,f.encoding);size+=bytes.length;if(size>128*1024*1024||bytes.length!==f.size||sha(bytes)!==f.sha256)throw Error('Source integrity/size mismatch');const rel=(prefix?prefix+'/':'')+f.path;if(/^\.congo\//i.test(rel)||['congo.json','CONGO.md'].includes(rel))throw Error('Source collides with installer metadata');const file=await destination(root,rel),old=await exists(file);if(update&&!old&&previous?.files.some(f=>f.path.toLowerCase()===rel.toLowerCase()))throw Error('Locally removed file; preserve/merge before updating: '+rel);let oldHash=null;if(old){if(!old.isFile())throw Error('Target is not a file');oldHash=sha(await readFile(file));if(oldHash!==f.sha256){const installed=previous?.files.find(x=>x.path.toLowerCase()===rel.toLowerCase());if(!update||!installed||installed.sha256!==oldHash){const owner=!update&&receipts.find(x=>x.r.id!==bundle.id&&x.r.files.some(y=>y.path.toLowerCase()===rel.toLowerCase()&&y.sha256===oldHash));throw Error((await pristineUpgradeHint())||(owner?`${rel} is ${owner.r.id}@${owner.r.version}'s copy and differs from ${bundle.id}'s; install ${bundle.id} into its own --destination`:'Locally edited or unowned file; preserve/merge before updating: '+rel));}for(const owner of receipts.filter(x=>x.r.id!==bundle.id)){const shared=owner.r.files.find(x=>x.path.toLowerCase()===rel.toLowerCase());if(!shared)continue;if(shared.sha256!==oldHash)throw Error('Shared file differs from another installation receipt: '+rel);const compatibleStyle=bundle.styles.includes(f.path)&&owner.r.source?.template===bundle.source.template&&owner.r.source?.release===bundle.source.release;if(!compatibleStyle&&!updateShared)throw Error('Shared source update requires --update-shared after reviewing dependent components: '+rel);shared.sha256=f.sha256;(owner.r.sharedUpdates??=[]).push({path:rel,by:bundle.id+'@'+bundle.version,from:oldHash,to:f.sha256});changedReceipts.add(owner);}}}writes.push({file,bytes,oldHash});}
 for(const [name,version] of Object.entries(bundle.dependencies??{})){if(!/^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/.test(name)||! /^(?:npm:(?:@[a-z0-9-]+\/)?[a-z0-9._-]+@)?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))throw Error('Unpinned/nonpublic dependency');const old=pkg.dependencies?.[name]??pkg.devDependencies?.[name];if(old&&!acceptsPinnedVersion(old,version))throw Error(`Dependency conflict ${name}: ${old} vs ${version}; resolve explicitly`);if(!old)(next.dependencies??={})[name]=version;}
 // Validate every file and dependency before any writes. Never runs downloaded scripts.
 // Safe downloads (owner decision 2026-11-18): show what is coming before anything is written; a no writes nothing.
 if(confirm&&await confirm(installPlan(bundle,writes,pkg,next,create,prefix))===false)throw Error('Cancelled. Nothing was written.');
 for(const {file,bytes,oldHash} of writes){await destination(root,path.relative(root,file).replaceAll('\\','/'));await mkdir(path.dirname(file),{recursive:true});if(oldHash===null)await writeFile(file,bytes,{flag:'wx'});else if(sha(bytes)!==oldHash){if(sha(await readFile(file))!==oldHash)throw Error('File changed during update');await writeFile(file,bytes);}}
 if(!create&&JSON.stringify(pkg)!==JSON.stringify(next))await writeFile(pkgPath,JSON.stringify(next,null,2)+'\n');
 const relative=p=>(prefix?prefix+'/':'')+p;const retained=(previous?.files??[]).filter(f=>!bundle.files.some(n=>relative(n.path)===f.path));const receipt={id:bundle.id,version:bundle.version,kind:bundle.kind,...fingerprint?{fileListSha256:fingerprint}:{},prefix,source:bundle.source,styles:bundle.styles.map(relative),styleScope:bundle.styleScope,files:[...bundle.files.map(({path,sha256})=>({path:relative(path),sha256})),...retained],retainedFiles:retained.map(f=>f.path),dependencies:bundle.dependencies,resolvedResourceDependencies:bundle.resolvedResourceDependencies??[],relatedResourceVersions:bundle.relatedResourceVersions??[]};
 for(const owner of changedReceipts)await writeFile(owner.file,JSON.stringify(owner.r,null,2));
 await mkdir(path.dirname(receiptPath),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2));return receipt;
}
// Tamper check (owner decision 2026-11-18): every release's whole file list has one fingerprint, published by Congo
// on its own free address apart from the download. The CLI recomputes it from the bytes it received and writes
// nothing unless they match. Same recipe as the server: "<sha256>  <size>  <path>" per file, sorted by path.
export const FINGERPRINT_ALGORITHM='sha256-file-list-v1';
export function bundleFingerprint(bundle){
 const files=bundle.files.map(f=>{const bytes=Buffer.from(f.content,f.encoding);return {path:f.path,sha256:sha(bytes),size:bytes.length};});
 return sha(files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(f=>`${f.sha256}  ${f.size}  ${f.path}\n`).join(''));
}
export async function verifyFingerprint(origin,bundle,{app=false}={},fetcher=fetch){
 const route=app?`/api/apps/${encodeURIComponent(bundle.id)}/fingerprint?release=${encodeURIComponent(bundle.source?.release??'')}`:`/api/resources/${encodeURIComponent(bundle.id)}/fingerprint?version=${encodeURIComponent(bundle.version)}`;
 let published;
 try{const response=await request(origin+route,{},fetcher);if(!response.ok)throw Error('HTTP '+response.status);published=await responseData(response,origin);}
 catch(e){throw Error(`Couldn't check this download against the fingerprint Congo published for ${bundle.id}@${bundle.version} (${oneLine(e.message)}). Nothing was written. Try again in a moment.`);}
 const actual=bundleFingerprint(bundle);
 if(published?.algorithm!==FINGERPRINT_ALGORITHM||published.id!==bundle.id||published.version!==bundle.version||published.fileListSha256!==actual)
  throw Error(`Tamper check failed: this download of ${bundle.id}@${bundle.version} doesn't match the fingerprint Congo published for it. Nothing was written. Try again later; if it happens again, report it at https://gocongo.ai/guides/docs/support.`);
 return actual;
}
// Inspect before download (owner decision 2026-11-18): list a screen's or app's files and read any one of them,
// without adding anything to a project. Same sign-in and subscription as source; the server rate-limits it.
async function inspectRoute(origin,id,{version,token,fetcher=fetch}={}){
 const headers=token?{Authorization:'Bearer '+token}:{};
 let response=await request(origin+'/api/resources/'+encodeURIComponent(id)+'/files'+(version?'?version='+encodeURIComponent(version):''),{headers},fetcher);
 if(response.status===404){const app=await request(origin+'/api/apps/'+encodeURIComponent(id)+'/files'+(version?'?release='+encodeURIComponent(version):''),{headers},fetcher);if(app.status!==404)return {base:'/api/apps/'+encodeURIComponent(id),pin:version?'release='+encodeURIComponent(version):'',response:app};}
 return {base:'/api/resources/'+encodeURIComponent(id),pin:version?'version='+encodeURIComponent(version):'',response};
}
export async function inspectFiles(origin,id,options={}){
 const {response}=await inspectRoute(origin,id,options);
 if(!response.ok)throw await httpFailure(response,origin);
 const listing=await responseData(response,origin),files=(listing.files??[]).map(f=>({path:String(f.path),size:Number(f.size),sha256:String(f.sha256)}));
 return {id:listing.id??id,version:listing.version,kind:listing.kind,fileListSha256:listing.fileListSha256??null,files,bytes:files.reduce((n,f)=>n+f.size,0)};
}
export async function inspectFile(origin,id,file,options={}){
 const {base,pin,response:list}=await inspectRoute(origin,id,options);
 if(!list.ok)throw await httpFailure(list,origin);
 const listing=await responseData(list,origin),entry=(listing.files??[]).find(f=>f.path===file);
 if(!entry)throw Error(`No file ${file} in ${id}. List its files with: gocongo inspect ${id}`);
 const headers=options.token?{Authorization:'Bearer '+options.token}:{},chunks=[];let offset=0,total=null;
 for(;;){
  const response=await request(origin+base+'/source?path='+encodeURIComponent(file)+'&offset='+offset+(pin?'&'+pin:''),{headers},options.fetcher??fetch);
  if(!response.ok)throw await httpFailure(response,origin);
  const part=await responseData(response,origin),bytes=Buffer.from(part.content??'','base64');
  if(sha(bytes)!==part.chunkSha256)throw Error('A piece of '+file+' arrived damaged. Try again.');
  chunks.push(bytes);total=part.size;if(part.nextOffset===null||part.nextOffset===undefined)break;
  if(part.nextOffset<=offset)throw Error('The server returned no progress reading '+file);offset=part.nextOffset;
 }
 const bytes=Buffer.concat(chunks);
 if(bytes.length!==total||sha(bytes)!==entry.sha256)throw Error(`${file} doesn't match the fingerprint in ${id}'s file list. Nothing was saved.`);
 const text=!bytes.includes(0)&&Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes)?bytes.toString('utf8'):null;
 return {id:listing.id??id,version:listing.version,path:file,size:bytes.length,sha256:entry.sha256,text,bytes};
}
export function formatInspect(result){
 const top=[...result.files].sort((a,b)=>a.path<b.path?-1:1);
 return [`${result.id}@${result.version}: ${result.files.length} file${result.files.length===1?'':'s'}, ${sizeText(result.bytes)}${result.fileListSha256?`, fingerprint ${result.fileListSha256.slice(0,16)}`:''}.`,
  ...top.slice(0,400).map(f=>`${sizeText(f.size).padStart(8)}  ${f.path}`),
  ...(top.length>400?[`… and ${top.length-400} more (use --json for all)`]:[]),
  `Read one without adding it: gocongo inspect ${result.id} <path>`].join('\n');
}
// What an add or create is about to do: the files, the new packages and the packages that run install scripts.
export function installPlan(bundle,writes,pkg,next,create,prefix){
 const read=name=>{const f=bundle.files.find(x=>x.path===name);try{return f?JSON.parse(Buffer.from(f.content,f.encoding).toString('utf8')):null;}catch{return null;}};
 let packages=[],installScripts=null;
 if(create){
  const manifest=read('package.json'),lock=read('package-lock.json');
  packages=Object.entries({...manifest?.dependencies,...manifest?.devDependencies}).map(([n,v])=>n+'@'+v).sort();
  if(lock?.packages)installScripts=[...new Set(Object.entries(lock.packages).filter(([k,v])=>k&&v?.hasInstallScript).map(([k])=>k.replace(/^.*node_modules\//,'')))].sort();
 }else packages=Object.entries(next.dependencies??{}).filter(([n])=>!(pkg.dependencies?.[n]||pkg.devDependencies?.[n])).map(([n,v])=>n+'@'+v).sort();
 return {id:bundle.id,version:bundle.version,kind:bundle.kind,destination:prefix||'.',files:writes.length,changedFiles:writes.filter(w=>w.oldHash!==null).length,bytes:writes.reduce((n,w)=>n+w.bytes.length,0),packages,installScripts};
}
// For an add, ask npm which new packages run a script when installed. Best effort: unknown when npm cannot be reached.
export async function lookupInstallScripts(packages,fetcher=fetch){
 if(packages.length>60)return null;
 try{
  const found=await Promise.all(packages.map(async spec=>{
   const at=spec.lastIndexOf('@'),name=spec.slice(0,at),version=spec.slice(at+1).replace(/^npm:.*@/,'');
   const response=await fetcher('https://registry.npmjs.org/'+name.replace('/','%2f')+'/'+encodeURIComponent(version),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});
   if(!response.ok)throw Error('npm '+response.status);
   const doc=await response.json(),scripts=doc.scripts??{};
   return ['preinstall','install','postinstall'].some(k=>scripts[k])||doc.gypfile===true?name:null;
  }));
  return found.filter(Boolean).sort();
 }catch{return null;}
}
const sizeText=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB';
export function formatPlan(plan){
 const list=(items,none)=>items.length?items.slice(0,12).join(', ')+(items.length>12?' and '+(items.length-12)+' more':''):none;
 return [`About to write ${plan.files} file${plan.files===1?'':'s'} (${sizeText(plan.bytes)}) for ${plan.id}@${plan.version} into ${plan.destination}${plan.changedFiles?`, replacing ${plan.changedFiles}`:''}.`,
  `${plan.kind==='template'?'Packages it uses':'New packages added to package.json'}: ${list(plan.packages,'none')}.`,
  `Packages that run an install script: ${plan.installScripts===null?'unknown (npm could not be checked)':list(plan.installScripts,'none')}.`,
  'Nothing runs now: Congo only writes files. Install scripts stay off unless you choose --allow-scripts.'].join('\n');
}
async function askToWrite(plan,{yes=false,json=false}={}){
 process.stderr.write(formatPlan(plan)+'\n');
 if(yes||json||!process.stdin.isTTY||!process.stdout.isTTY)return true;
 const {createInterface}=await import('node:readline/promises');
 const rl=createInterface({input:process.stdin,output:process.stderr});
 try{return !/^n/i.test((await rl.question('Write these files? [Y/n] ')).trim());}finally{rl.close();}
}
function registryOrigin(value=DEFAULT_REGISTRY) {
 const u=new URL(value);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('Use an HTTPS registry origin or HTTP on loopback');
 return u.origin;
}
const oneLine=value=>String(value??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/\s+/g,' ').trim();
const redact=value=>String(value).replace(/congo_(?:mcp_(?:at|rt)|lib|api|code)_[\w-]+/g,'[redacted]');
function networkCode(error) {
 const codes=[]; const visit=e=>{if(e?.code)codes.push(e.code);if(e?.cause)visit(e.cause);for(const child of e?.errors??[])visit(child);};visit(error);
 return codes.find(c=>['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(c))??codes[0]??error?.name??'NETWORK_ERROR';
}
export async function request(url,options={},fetcher=fetch) {
 // A connect failure happens before an HTTP request reaches the server. Retry only that failure,
 // once, with Node's alternate-family selection disabled (the Windows timeout workaround).
 for(let attempt=0;attempt<2;attempt++)try {
  return await fetcher(url,{...options,redirect:'error',signal:options.signal??AbortSignal.timeout(60000)});
 } catch(e) {
  const code=networkCode(e);
  if(!attempt&&['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code)){net.setDefaultAutoSelectFamily(false);continue;}
  throw Error(`Couldn't reach ${new URL(url).host} (${code}). Check your connection or proxy.`);
 }
}
async function httpFailure(response,origin) {
 let body;try{body=await response.json();}catch{}
 if(response.status===401)return Error('Sign in required. Run `congo login`'+(origin!==DEFAULT_REGISTRY?' --registry '+origin:'')+'.');
 if(body?.code==='terms_acceptance_required')return Error('Review the current Congo Terms before retrieving source: '+origin+'/source-access. Then retry this command.');
 if(response.status===402)return Error('Source needs an active Congo subscription ($30/month): '+origin+'/pricing');
 if(response.status===429)return Error((typeof body?.message==='string'?oneLine(body.message):'Too many requests')+(Number.isSafeInteger(body?.retryAfter)?' (retry in '+body.retryAfter+' s)':'')+'.');
 if(response.status===403&&/phone/i.test(body?.message??body?.error??''))return Error('Verify your phone number in your Congo Profile: '+origin+'/account?classic=profile. Then retry this command.');
 if(['invalid_grant','invalid_token','invalid_client'].includes(body?.error))return Error('Your sign-in expired or was revoked. Run `congo login` again.');
 return Error('Congo HTTP '+response.status+(body?.error==='access_denied'?': Sign-in was declined. Run `congo login` to try again.':''));
}
async function responseData(response,origin) {
 let text;try{text=await response.text();}catch(e){throw Error(`Couldn't finish reading from ${new URL(origin).host} (${networkCode(e)}). Check your connection or proxy.`);}
 if(text.length>192*1024*1024)throw Error('Oversized resource');
 try{return JSON.parse(text);}catch{throw Error('Congo returned an invalid response from '+new URL(origin).host+'. Retry this command.');}
}
export const credentialsDirectory=()=>path.join(process.platform==='win32'?(process.env.APPDATA||path.join(homedir(),'AppData','Roaming')):(process.env.XDG_CONFIG_HOME||path.join(homedir(),'.config')),'congo');
const credentialPath=origin=>path.join(credentialsDirectory(),sha(origin)+'.json');
// Windows tools run from System32, never by PATH lookup: Git Bash puts its own whoami.exe first.
export const windowsSystemTool=(name,env=process.env)=>path.win32.join(env.SystemRoot||env.windir||'C:\\Windows','System32',name);
async function privatePermissions(file,directory=false) {
 if(process.platform!=='win32'){await chmod(file,directory?0o700:0o600);return;}
 const who=spawnSync(windowsSystemTool('whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
 const sid=who.stdout?.match(/S-1-\d+(?:-\d+)+/)?.[0];
 if(who.status!==0||!sid)throw Error('Cannot secure saved sign-in permissions for this Windows account.');
 // Reset explicit grants as well as stripping inheritance; chmod alone does not protect Windows files.
 for(const args of [[file,'/reset'],[file,'/inheritance:r','/grant:r','*'+sid+':'+(directory?'(OI)(CI)F':'F')]]) {
  const result=spawnSync(windowsSystemTool('icacls.exe'),args,{stdio:'pipe',windowsHide:true});
  if(result.status!==0)throw Error('Cannot secure saved sign-in permissions for this Windows account.');
 }
}
async function credentialFile(origin) {
 const dir=credentialsDirectory();await mkdir(dir,{recursive:true,mode:0o700});
 const st=await lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe sign-in storage directory');
 await privatePermissions(dir,true);
 const file=credentialPath(origin),entry=await exists(file);
 if(entry&&(entry.isSymbolicLink()||!entry.isFile()||entry.nlink!==1))throw Error('Unsafe sign-in storage file');
 return file;
}
export async function readCredentials(origin) {
 if(!await exists(credentialPath(origin)))return null;
 const file=await credentialFile(origin);
 try{if(!await exists(file))return null;await privatePermissions(file);const data=JSON.parse(await readFile(file,'utf8'));if(data.origin!==origin||typeof data.clientId!=='string'||typeof data.accessToken!=='string'||typeof data.refreshToken!=='string'||!Number.isFinite(data.expiresAt))throw 0;return data;}
 catch(e){if(e.code==='ENOENT')return null;throw Error('Cannot read your saved Congo sign-in. Run `congo logout`, then `congo login`.');}
}
async function saveCredentials(origin,data) {
 const file=await credentialFile(origin),temporary=file+'.'+randomBytes(12).toString('hex')+'.tmp';
 const handle=await open(temporary,'wx',0o600);
 try{await privatePermissions(temporary);await handle.writeFile(JSON.stringify({...data,origin})+'\n');await handle.close();await rename(temporary,file);}
 finally{await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
}
async function oauthPost(origin,route,body) {
 const response=await request(origin+route,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
 if(!response.ok)throw await httpFailure(response,origin);return responseData(response,origin);
}
function tokenData(origin,clientId,result) {
 if(typeof result.access_token!=='string'||typeof result.refresh_token!=='string'||result.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(result.expires_in)||result.expires_in<=0||!result.scope?.split(' ').includes('packages:read'))throw Error('Congo returned an incomplete sign-in. Run `congo login` again.');
 return {origin,clientId,accessToken:result.access_token,refreshToken:result.refresh_token,expiresAt:Date.now()+result.expires_in*1000};
}
async function savedToken(origin) {
 let saved=await readCredentials(origin);if(!saved)return null;
 if(saved.expiresAt>Date.now()+30000)return saved.accessToken;
 // Refresh tokens rotate. Serialize refreshes between CLI processes, then reread the latest file.
 return withCredentialLock(origin,async()=>{
  saved=await readCredentials(origin);if(!saved)return null;
  if(saved.expiresAt>Date.now()+30000)return saved.accessToken;
  const result=await oauthPost(origin,'/oauth/token',{grant_type:'refresh_token',client_id:saved.clientId,refresh_token:saved.refreshToken,resource:origin+'/mcp'});
  const next=tokenData(origin,saved.clientId,result);await saveCredentials(origin,next);return next.accessToken;
 });
}
async function withCredentialLock(origin,action) {
 await credentialFile(origin);
 const lock=credentialPath(origin)+'.lock';let handle;
 for(let n=0;n<100;n++)try{handle=await open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));break;}catch(e){
  if(e.code!=='EEXIST')throw e;
  try{const entry=await lstat(lock);if(!entry.isFile()||entry.isSymbolicLink()||entry.nlink!==1)throw Error('Unsafe sign-in lock');
   const owner=JSON.parse(await readFile(lock,'utf8'));if(Number.isSafeInteger(owner.pid)&&owner.pid>0)try{process.kill(owner.pid,0);}catch(gone){if(gone.code==='ESRCH'){await unlink(lock);continue;}}
  }catch(check){if(!['ENOENT'].includes(check.code)&&!(check instanceof SyntaxError))throw check;}
  await new Promise(r=>setTimeout(r,100));
 }
 if(!handle)throw Error('Another Congo command is refreshing your sign-in. Retry shortly.');
 try{return await action();}finally{await handle.close();await unlink(lock);}
}
async function accessToken(origin){return process.env.CONGO_LIBRARY_TOKEN||await savedToken(origin);}
function openBrowser(url) {
 const [program,args]=process.platform==='win32'?[windowsSystemTool('rundll32.exe'),['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
 const child=spawn(program,args,{stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();
}
export async function login(origin,{noBrowser=false,timeoutMs=300000,browser=openBrowser}={}) {
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 let resolve,reject,timer,settled=false;
 const callback=new Promise((yes,no)=>{resolve=yes;reject=no;});callback.catch(()=>{});
 const stop=()=>reject(Error('Sign-in cancelled. Run `congo login` when ready.'));
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/plain; charset=utf-8');
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method!=='GET'||url.pathname!=='/callback'){res.writeHead(404);res.end();return;}
  if(url.searchParams.get('state')!==state){res.writeHead(400);res.end('Sign-in state did not match. Return to the original sign-in tab.');return;}
  if(settled){res.writeHead(409);res.end();return;}
  settled=true;
  if(url.searchParams.has('error')){res.end('Sign-in declined. You can close this tab.');reject(Error('Sign-in was declined. Run `congo login` to try again.'));return;}
  const code=url.searchParams.get('code');if(!code||code.length>4096){res.writeHead(400);res.end('Missing sign-in code.');reject(Error('Sign-in did not return a code. Run `congo login` again.'));return;}
  res.end('Return to your terminal to finish Congo sign-in. You can close this tab.');resolve(code);
 });
 try {
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  const redirect='http://127.0.0.1:'+server.address().port+'/callback';
  const response=await request(origin+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Congo CLI',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  if(!response.ok)throw await httpFailure(response,origin);const client=await responseData(response,origin);
  if(typeof client.client_id!=='string')throw Error('Congo could not register this sign-in. Try again.');
  const params=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:redirect,code_challenge:sha256url(verifier),code_challenge_method:'S256',state,resource:origin+'/mcp',scope:'catalog:read library:read packages:read'});
  const url=origin+'/oauth/authorize?'+params;
  console.error('Sign in in your browser and approve Congo CLI.\n'+url);
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  timer=setTimeout(()=>reject(Error('Sign-in timed out. Run `congo login` again.')),timeoutMs);
  if(!noBrowser&&process.env.BROWSER!=='none')browser(url);
  const code=await callback,result=await oauthPost(origin,'/oauth/token',{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code_verifier:verifier,code,resource:origin+'/mcp'});
  await withCredentialLock(origin,()=>saveCredentials(origin,tokenData(origin,client.client_id,result)));return {signedIn:true,registry:origin};
 }finally{clearTimeout(timer);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const sha256url=value=>createHash('sha256').update(value).digest('base64url');
async function logout(origin) {
 return withCredentialLock(origin,async()=>{
 let saved,failure;
 try{saved=await readCredentials(origin);}catch(e){failure=e;}
 try{if(saved)await oauthPost(origin,'/oauth/revoke',{client_id:saved.clientId,token:saved.refreshToken,token_type_hint:'refresh_token'});}catch(e){failure=e;}
 finally{await unlink(credentialPath(origin)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 if(failure)throw Error('Saved sign-in removed, but Congo could not revoke it online. Revoke Congo CLI in '+origin+'/account/api. '+failure.message);
 return {signedIn:false,registry:origin};
 });
}
function printResult(value,human,json) {console.log(json?JSON.stringify(value,null,2):human);}
const signInRequired=origin=>Error('Sign in required. Run `congo login`'+(origin!==DEFAULT_REGISTRY?' --registry '+origin:'')+'.');
// Saved items are the account's website bookmarks. They are listed through the existing MCP tool
// congo_library_list: one stateless JSON-RPC tools/call, no initialize. Saving needs no subscription.
export function mcpMessage(text,id) {
 const body=text.trim();
 if(body.startsWith('{')||body.startsWith('['))return [JSON.parse(body)].flat().find(message=>message?.id===id);
 // A text/event-stream body carries the same JSON-RPC message in its data: lines.
 for(const event of text.split(/\r?\n\r?\n/)){
  const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
  if(!data)continue;let message;try{message=JSON.parse(data);}catch{continue;}
  if(message?.id===id)return message;
 }
}
async function savedPage(origin,token,{query,offset,limit}) {
 const id=1,invalid=()=>Error('Congo returned an invalid response from '+new URL(origin).host+'. Retry this command.');
 const response=await request(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'congo_library_list',arguments:{...query?{query}:{},offset,limit}}})});
 if([401,403].includes(response.status)){await response.body?.cancel().catch(()=>{});throw signInRequired(origin);}
 let text;try{text=await response.text();}catch(e){throw Error(`Couldn't finish reading from ${new URL(origin).host} (${networkCode(e)}). Check your connection or proxy.`);}
 if(!response.ok){
  let body;try{body=JSON.parse(text);}catch{}
  const detail=body?.error?.message??body?.message??(typeof body?.error==='string'?body.error.replaceAll('_',' '):'');
  throw Error('Congo could not list your Saved items (HTTP '+response.status+')'+(detail?': '+oneLine(detail):'.'));
 }
 let message;try{message=mcpMessage(text,id);}catch{throw invalid();}
 if(!message)throw invalid();
 const result=message.result;let detail=message.error?oneLine(message.error.message??'request failed'):null;
 if(!detail&&result?.isError){
  detail=result.content?.find(part=>part?.type==='text')?.text??'';
  try{const parsed=JSON.parse(detail);detail=parsed.message??String(parsed.error??'').replaceAll('_',' ');}catch{}
  detail=oneLine(detail);
 }
 if(detail!==null){
  // A library key (CONGO_LIBRARY_TOKEN) reaches a server without the Saved tool.
  if(/congo_library_list.*not found/i.test(detail))throw Error(signInRequired(origin).message+' Saved items need a browser sign-in; a library key cannot list them.');
  throw Error('Congo could not list your Saved items'+(detail?': '+detail:'.'));
 }
 let page=result?.structuredContent;
 if(!page)try{page=JSON.parse(result.content.find(part=>part?.type==='text').text);}catch{}
 if(!Array.isArray(page?.items)||!Number.isSafeInteger(page.total)||page.total<0||(page.offset??offset)!==offset||page.items.length>limit)throw invalid();
 return page;
}
export const savedItem=(origin,row)=>{
 const listing=row?.listing??{},slug=String(listing.slug??listing.id??row?.listing_id??'');
 return {id:String(row?.listing_id??listing.id??''),slug,name:String(listing.name??slug),kind:String(listing.kind??'app'),url:origin+'/websites/'+encodeURIComponent(slug),savedAt:typeof row?.savedAt==='string'?row.savedAt:null};
};
export function formatSaved(result,query='') {
 if(!result.items.length)return result.total?`No Saved items at offset ${result.offset}. You have ${result.total} in total.`:query?'No Saved items match that search.':'No Saved items yet. Save an app on the website to see it here.';
 const next=result.offset+result.items.length<result.total?result.offset+result.items.length:null;
 return [...result.items.map(item=>oneLine(item.name)+' | '+oneLine(item.slug)),`${result.items.length} of ${result.total} Saved item${result.total===1?'':'s'}${result.offset?' (offset '+result.offset+')':''}.`,next!==null?'Next: --offset '+next:''].filter(Boolean).join('\n');
}
export async function listSaved(origin,{query,offset,limit,all}) {
 const token=await accessToken(origin);if(!token)throw signInRequired(origin);
 let page=await savedPage(origin,token,{query,offset,limit:all?100:limit});const rows=[...page.items];
 while(all&&offset+rows.length<page.total){
  page=await savedPage(origin,token,{query,offset:offset+rows.length,limit:100});
  if(!page.items.length)throw Error('Registry pagination made no progress');rows.push(...page.items);
 }
 const items=rows.map(row=>savedItem(origin,row));
 if(new Set(items.map(item=>item.id)).size!==items.length)throw Error('Your Saved list changed while it was being read. Retry this command.');
 return {items,total:page.total,offset,limit:all?items.length:limit};
}
// A screen without its own package is never offered through its whole app (owner correction 2026-11-04).
const UNPACKAGED_SCREEN_NEXT='Not yet installable on its own: this screen has no package yet. Preview it on the website.';
export const labelScreen=item=>item.screen?.type==='page'||item.type==='page'?{...item,installable:false,next:UNPACKAGED_SCREEN_NEXT}:item;
export function formatSearch(result) {
 const lines=result.items.map(item=>`${oneLine(item.id)} | ${oneLine(item.kind??item.type??'screen')} | ${oneLine(item.title??item.name)} | ${item.installable===false?'not yet installable on its own':oneLine(item.access??'subscription')}\n  ${oneLine(item.installable===false?item.next:item.description??item.summary)}`);
 return [...lines,`${result.items.length} of ${result.total} results${result.offset?' (offset '+result.offset+')':''}.`,result.nextOffset!==null?'Next: --offset '+result.nextOffset:''].filter(Boolean).join('\n');
}
// Discovery reads the same published catalog as the website. Resource IDs remain
// installable, but the legacy packaged-template index is not the app catalog.
async function searchPages(get,endpoint,params,field='items') {
 const query=new URLSearchParams(params);query.set('offset','0');query.set('limit','100');
 let first,offset=0;const items=[],seen=new Set();
 while(true){
  query.set('offset',String(offset));const page=await get(endpoint+'?'+query),rows=page[field];
  if(!Array.isArray(rows)||!Number.isSafeInteger(page.total)||page.total<0||(page.offset??offset)!==offset)throw Error('Invalid catalog pagination from '+endpoint);
  first??=page;
  for(const row of rows){if(typeof row.id!=='string'||seen.has(row.id))throw Error('Catalog pagination repeated an item from '+endpoint);seen.add(row.id);items.push(row);}
  offset+=rows.length;if(offset>=page.total)break;
  if(!rows.length)throw Error('Registry pagination made no progress');
 }
 return {...first,[field]:items};
}
const discoveryWords=value=>String(value??'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
async function catalogTemplates(get,values) {
 const [catalog,legacy]=await Promise.all([searchPages(get,'/api/catalog',{},'listings'),searchPages(get,'/api/resources',{kind:'template'})]);
 const listings=catalog.listings.filter(l=>['app','landing_page'].includes(l.kind)&&l.sourcePackage?.status==='ready'&&l.sourcePackage.channels?.includes('zip'));
 const wanted=discoveryWords(values.query).filter(w=>!['template','templates','app','apps','application','applications','full','complete','whole','entire','the','a','an','for','with','and'].includes(w));
 const rows=listings.map(l=>{
  // Preserve old IDs as search aliases without duplicating an app or changing its
  // current website source release. A short source alias must identify one app.
  const related=legacy.items.filter(r=>{const source=r.source?.template;return source&&(source===l.id||source===l.slug||l.id.startsWith(source+'-')&&listings.filter(x=>x.id.startsWith(source+'-')).length===1);});
  const aliases=[l.slug,...l.interface?.synonyms??[],l.inspiredBy?.name??'',...related.flatMap(r=>[r.id,r.source.template])];
  const categories=[...new Set([l.category,...related.flatMap(r=>r.categories??[])])];
  const preferred=related.length===1?related[0]:null;
  const item={...preferred??{schemaVersion:1,id:l.id,version:l.release.version,kind:'template',source:{template:l.id,release:l.release.id,revision:l.release.sha256},sourcePackage:l.sourcePackage},access:'subscription',title:l.name,description:l.summary,tags:l.tags??[],categories,aliases,app:{id:l.id,slug:l.slug,name:l.name}};
  const title=discoveryWords(l.name),detail=discoveryWords([l.id,l.summary,l.description,l.category,...l.tags??[],...aliases].join(' '));
  let score=0;for(const word of wanted){if(title.includes(word))score+=24;else if(detail.includes(word))score+=3;else return null;}
  if(values.source&&!aliases.includes(values.source)&&l.id!==values.source)return null;
  if(values.category&&!categories.includes(values.category))return null;
  return {item,score};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));
 return {...legacy,items:rows.map(r=>r.item),total:rows.length,offset:0};
}
// One request: the registry composes the combined search (/api/library-search?view=resources).
// null means an older registry without that view; its errors are then reproduced by legacySearch.
async function serverSearch(origin,values,{kind,offset,limit,all}) {
 const p=new URLSearchParams({view:'resources',q:values.query,offset:String(offset)});
 if(kind)p.set('kind',kind);if(values.source)p.set('source',values.source);if(values.category)p.set('category',values.category);
 if(all)p.set('all','1');else p.set('limit',String(limit));
 const response=await request(origin+'/api/library-search?'+p);
 if(!response.ok){await response.body?.cancel().catch(()=>{});return null;}
 const body=await responseData(response,origin);if(body?.view!=='resources')return null;
 const {view,...out}=body;
 if(!Array.isArray(out.items)||!Number.isSafeInteger(out.total)||out.offset!==offset||out.nextOffset!==(offset+out.items.length<out.total?offset+out.items.length:null)||!all&&out.items.length>limit||new Set(out.items.map(item=>item?.id)).size!==out.items.length)throw Error('Invalid catalog pagination from /api/library-search');
 return {...out,items:out.items.map(labelScreen)};
}
// CLI 0.2.2's search, for registries that predate the resources view: every page of /api/catalog,
// /api/resources and /api/screens, combined here. Same output as serverSearch.
export async function legacySearch(read,values,{kind,offset,limit,all}) {
 const templates=await catalogTemplates(read,values);let result=templates;
 if(!kind){
  const resourceParams=new URLSearchParams({q:values.query});if(values.source)resourceParams.set('source',values.source);
  const base=await searchPages(read,'/api/resources',resourceParams);
  const screenParams=new URLSearchParams({q:values.query});if(values.source)screenParams.set('app',values.source);
  const screens=values.category?{items:[]}:await searchPages(read,'/api/screens',screenParams);
  const existing=base.items.filter(r=>r.kind!=='template'&&(!values.category||r.categories?.includes(values.category)||r.screenCategories?.includes(values.category))).map(labelScreen),ids=new Set(existing.map(r=>r.id));
  const pages=screens.items.filter(r=>!ids.has(r.id)).map(r=>r.type==='page'?labelScreen(r):{...r,next:'add '+r.id+' --destination PATH'});
  const items=[...templates.items,...existing,...pages];result={...base,items,total:items.length};
 }
 const items=result.items.slice(offset,all?undefined:offset+limit);
 return {...result,items,total:result.total,offset,limit:all?items.length:limit,nextOffset:offset+items.length<result.total?offset+items.length:null};
}
async function nextCommands(root) {
 const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 const quote=value=>"'"+String(value).replaceAll("'",process.platform==='win32'?"''":"'\\''")+"'";
 const commands=['cd '+quote(root),(await exists(path.join(root,'package-lock.json'))?'npm ci':'npm install')+' --ignore-scripts'];
 // Report the template's declared commands, without guessing or executing downloaded scripts.
 if(pkg.scripts?.dev)commands.push('npm run dev');else if(pkg.scripts?.start)commands.push('npm start');else if(pkg.scripts?.build)commands.push('npm run build');
 return commands;
}
// Free reference library (owner decision 2026-11-17): save screenshots of Congo's clone apps into a project as
// pictures for the person's own AI, with an index file naming each screen, its app, credit and code link. No sign-in.
export const REFERENCE_INDEX='congo-references.json';
const REFERENCE_FILE=/^[a-z0-9-]{1,80}\/[a-z0-9-]{1,80}-[a-f0-9]{8}\.(?:png|jpg|webp)$/;
const REFERENCE_PATH=/^\/api\/catalog\/screenshots\/([a-f0-9]{64})\.(png|jpg|webp)$/;
export async function saveReferences(origin,root,{query='',app,category,limit,all=false,out='references'}={},fetcher=fetch) {
 if(!query&&!app&&!category)throw Error('Say what to save: a search ("pricing page"), --app NAME or --category ID. Example: congo references "pricing page"');
 if(query.length>200)throw Error('Use search text with at most 200 characters');
 if(!safeRelative(out))throw Error('Use --out with a folder inside the project, such as references');
 const everything=all||!!app&&!query&&!category,pageSize=everything?100:limit??24;
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw Error('Use --limit 1..100, or --all');
 const items=[];let offset=0,total=0,partial=false;
 for(;;) {
  const p=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(query)p.set('q',query);if(app)p.set('app',app);if(category)p.set('category',category);
  const response=await request(origin+'/api/references?'+p,{},fetcher);if(!response.ok)throw await httpFailure(response,origin);
  const page=await responseData(response,origin);if(!Array.isArray(page.items)||!Number.isSafeInteger(page.total))throw Error('Congo returned an invalid response from '+new URL(origin).host+'. Retry this command.');
  items.push(...page.items);total=page.total;partial||=page.match==='partial';
  if(!everything||page.nextOffset===null||page.nextOffset===undefined||page.nextOffset<=offset||items.length>=2000)break;
  offset=page.nextOffset;
 }
 await mkdir(root,{recursive:true});
 const canonical=await realpath(root),folder=await destination(canonical,out);
 await mkdir(folder,{recursive:true});
 const indexFile=await destination(canonical,out+'/'+REFERENCE_INDEX);
 let index={screens:[]};try{const held=JSON.parse(await readFile(indexFile,'utf8'));if(Array.isArray(held?.screens))index=held;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 const saved=[],skipped=[];let next=0;
 const worker=async()=>{for(;;){const item=items[next++];if(!item)return;
  let match=null;try{match=REFERENCE_PATH.exec(new URL(item.image?.url??'',origin).pathname);}catch{}
  const file=item.image?.fileName;
  if(!match||match[1]!==item.image.sha256||typeof file!=='string'||!REFERENCE_FILE.test(file)||!file.endsWith('.'+match[2])){skipped.push({id:String(item.id),reason:'invalid picture'});continue;}
  const target=await destination(canonical,out+'/'+file),held=await readFile(target).catch(()=>null);
  if(!held||sha(held)!==match[1]) {
   // Pictures always come from the chosen Congo registry, whatever host a response names.
   const response=await request(origin+match[0],{},fetcher);if(!response.ok){skipped.push({id:String(item.id),reason:'HTTP '+response.status});continue;}
   const bytes=Buffer.from(await response.arrayBuffer());if(sha(bytes)!==match[1]){skipped.push({id:String(item.id),reason:'checksum mismatch'});continue;}
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
  }
  saved.push({id:String(item.id),title:oneLine(item.title),app:{id:oneLine(item.app?.id),name:oneLine(item.app?.name)},inspiredBy:item.inspiredBy?{name:oneLine(item.inspiredBy.name),url:oneLine(item.inspiredBy.url)}:null,route:typeof item.route==='string'?item.route:null,file,width:item.image.width,height:item.image.height,sha256:match[1],image:origin+match[0],galleryUrl:typeof item.galleryUrl==='string'?item.galleryUrl:null,code:{url:typeof item.code?.url==='string'?item.code.url:null,install:oneLine(item.code?.install),access:oneLine(item.code?.access)}});
 }};
 await Promise.all(Array.from({length:4},worker));
 const order=new Map(items.map((item,i)=>[String(item.id),i]));saved.sort((a,b)=>order.get(a.id)-order.get(b.id));
 const kept=index.screens.filter(screen=>!saved.some(s=>s.id===screen?.id));
 index={about:'Screenshots of Congo clone apps, saved as free reference pictures for your AI. Each screen names its app and the product that inspired it. Its working code is linked under code; the code needs a Congo Library subscription ('+origin+'/pricing).',registry:origin,updatedAt:new Date().toISOString(),screens:[...kept,...saved]};
 await writeFile(indexFile,JSON.stringify(index,null,2)+'\n');
 return {saved:saved.length,skipped,total,...partial?{match:'partial'}:{},folder:path.relative(process.cwd(),folder)||'.',index:path.relative(process.cwd(),indexFile),screens:saved};
}
export function formatReferences(result,origin=DEFAULT_REGISTRY) {
 if(!result.saved&&!result.skipped.length)return 'No Congo screens matched. Try other words, or name an app with --app.';
 const apps=[...new Set(result.screens.map(s=>s.app.name))];
 return [`Saved ${result.saved} Congo reference screen${result.saved===1?'':'s'}${result.match==='partial'?' (closest matches)':''}${apps.length?' from '+apps.slice(0,4).join(', ')+(apps.length>4?' and '+(apps.length-4)+' more':''):''} to ${result.folder}.`,
  `Index: ${result.index} (each screen's app, Inspired-by credit and code link).`,
  ...(result.skipped.length?[`Skipped ${result.skipped.length}: ${result.skipped.slice(0,3).map(s=>s.id+' ('+s.reason+')').join(', ')}`]:[]),
  ...(result.total>result.saved+result.skipped.length?[`${result.total} matched; add --all or a higher --limit for more.`]:[]),
  `Point your AI at ${result.folder}. The code for any screen needs the Congo Library: ${origin}/pricing`].join('\n');
}
function installDependencies(root,allowScripts=false) {
 // Install scripts stay off unless the person opts in with --allow-scripts (owner decision 2026-11-18).
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['install',...allowScripts?[]:['--ignore-scripts']],{cwd:root,stdio:['ignore',process.stderr,process.stderr],shell:process.platform==='win32',windowsHide:true});
 if(result.error||result.status!==0)throw Error('Dependency installation failed. Review package.json, then run npm install in your project.');
}
export async function main(args=process.argv.slice(2)) {
 if(args[0]==='workspace'){let launcher;try{launcher=await import('./congo-workspace.mjs');}catch{throw Error('gocongo workspace comes with the npm package. Run it with: npx gocongo workspace');}await launcher.launchWorkspace(args.slice(1));return;}
 if(args[0]==='skills'){let skills;try{skills=await import('./congo-skills.mjs');}catch{throw Error('gocongo skills comes with the npm package. Run it with: npx gocongo skills');}await skills.installSkillsCommand(args.slice(1));return;}
 args=[...args];let command=args.shift();const values={},positionals=[];
 const booleans=new Set(['help','new','all','json','install','update-shared','no-browser','yes','allow-scripts']);
 for(let i=0;i<args.length;i++) {
  if(!args[i].startsWith('--')){positionals.push(args[i]);continue;}
  const key=args[i].slice(2);
  if(booleans.has(key)){values[key]=true;continue;}
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for --'+key);
  values[key]=args[++i];
 }
 if(!command||['help','--help'].includes(command)||values.help){console.log(USAGE);return;}
 if(['--version','-v'].includes(command)){console.log(CLI_VERSION);return;}
 if(!['login','logout','whoami','saved','init','create','templates','search','categories','references','inspect','add','update','handbooks','handbook'].includes(command))throw Error(USAGE);
 const json=!!values.json||!process.stdout.isTTY,root=path.resolve(values.project??process.cwd());
 let config;
 if(!['init','create'].includes(command)) {
  try{const canonical=await realpath(root);config=JSON.parse(await readFile(await destination(canonical,'congo.json'),'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(config&&(config.schemaVersion!==1||!safeRelative(config.components)))throw Error('Invalid Congo project configuration.');
 }
 if(['add','update'].includes(command)&&!config)throw Error('No Congo project here. Run `congo init` or pass `--project PATH`.');
 const origin=registryOrigin(values.registry??config?.registry??process.env.CONGO_REGISTRY??DEFAULT_REGISTRY);
 if(command==='login'){const result=await login(origin,{noBrowser:!!values['no-browser']});printResult(result,'Signed in to Congo. Next: congo templates',json);return;}
 if(command==='logout'){const result=await logout(origin);printResult(result,'Signed out of Congo on this registry.',json);if(process.env.CONGO_LIBRARY_TOKEN)console.error('CONGO_LIBRARY_TOKEN is still set; automation will continue using it.');return;}
 const get=async(route,{anonymous=false}={})=>{
  const token=anonymous?null:await accessToken(origin),response=await request(origin+route,{headers:token?{Authorization:'Bearer '+token}:{}});
  if(!response.ok)throw await httpFailure(response,origin);
  return responseData(response,origin);
 };
 if(command==='whoami') {
  const result=await get('/api/resources/identity');
  printResult(result,oneLine(result.email)+' — '+(result.subscription.active?'subscription active':'no active subscription')+(result.subscription.paidThrough?' through '+oneLine(result.subscription.paidThrough):''),json);return;
 }
 if(command==='saved') {
  const offset=Number(values.offset??0),limit=Number(values.limit??100),query=values.query??positionals.join(' ');
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Use --offset >= 0 and --limit 1..100');
  if(query.length>200)throw Error('Use --query with at most 200 characters');
  const result=await listSaved(origin,{query,offset,limit,all:!!values.all});printResult(result,formatSaved(result,query),json);return;
 }
 if(command==='inspect') {
  const id=positionals[0],file=positionals[1];if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id??''))throw Error('Use: gocongo inspect <screen or app id> [file path]');
  const token=await accessToken(origin);if(!token)throw signInRequired(origin);
  if(!file){const result=await inspectFiles(origin,id,{version:values.version,token});printResult(result,formatInspect(result),json);return;}
  const result=await inspectFile(origin,id,file,{version:values.version,token});
  if(typeof values.out==='string'){const target=path.resolve(values.out);if(await exists(target))throw Error('Refusing to overwrite '+target);await writeFile(target,result.bytes,{flag:'wx'});printResult({...result,bytes:undefined,text:undefined,out:target},`Saved ${file} (${sizeText(result.size)}) to ${target}. Nothing was added to a project.`,json);return;}
  if(json){printResult({...result,bytes:undefined,encoding:result.text===null?'base64':'utf8',content:result.text??result.bytes.toString('base64'),text:undefined},'',true);return;}
  if(result.text===null)throw Error(`${file} is a binary file (${sizeText(result.size)}). Save it with --out FILE to look at it.`);
  process.stdout.write(result.text.endsWith('\n')?result.text:result.text+'\n');return;
 }
 if(command==='references') {
  const limit=values.limit===undefined?undefined:Number(values.limit);
  const result=await saveReferences(origin,root,{query:values.query??positionals.join(' '),app:values.app??values.source,category:values.category,limit,all:!!values.all,out:values.out??'references'});
  printResult(result,formatReferences(result,origin),json);return;
 }
 if(command==='categories'){const result=await get('/api/screen-categories',{anonymous:true});printResult(result,result.categories.map(c=>oneLine(c.id)+' | '+oneLine(c.title)+' | '+oneLine(c.group)).join('\n')+'\nUse one with search --category ID.',json);return;}
 if(command==='templates'||command==='create'&&!positionals[0]){command='search';values.kind='template';}
 if(command==='search') {
  const offset=Number(values.offset??0),limit=Number(values.limit??50);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Use --offset >= 0 and --limit 1..100');
  values.query=values.query??positionals.join(' ');
  const p=new URLSearchParams({q:values.query,limit:String(limit),offset:String(offset)});
  if(['component','flow'].includes(values.kind))throw Error("Congo offers screens and templates; components and flows are no longer listed. Search screens and take the piece you need from a screen's source.");
  if(values.kind)p.set('kind',values.kind);if(values.source)p.set('source',values.source);if(values.category)p.set('category',values.category);
  if(values.kind==='template'||!values.kind){
   const options={kind:values.kind??'',offset,limit,all:!!values.all};
   const out=await serverSearch(origin,values,options)??await legacySearch(route=>get(route,{anonymous:true}),values,options);
   printResult(out,formatSearch(out),json);return;
  }
  const screens=values.kind==='screen';if(screens){p.delete('kind');p.delete('source');if(values.source)p.set('app',values.source);}
  const endpoint=screens?'/api/screens?':'/api/resources?',result=await get(endpoint+p,{anonymous:true});
  if(values.all){while(result.offset+result.items.length<result.total){p.set('offset',String(result.offset+result.items.length));const page=await get(endpoint+p,{anonymous:true});if(!page.items.length)throw Error('Registry pagination made no progress');result.items.push(...page.items);}result.limit=result.items.length;}
  if(screens)result.items=result.items.map(item=>item.type==='page'?labelScreen(item):{...item,next:'add '+item.id+' --destination PATH'});
  const out={...result,nextOffset:result.offset+result.items.length<result.total?result.offset+result.items.length:null};printResult(out,formatSearch(out),json);return;
 }
 if(command==='create') {
  const id=positionals[0];if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id))throw Error('Use a template ID from search or an app ID such as hush-creative-audio');
  await mkdir(root,{recursive:true});if((await readdir(root)).length)throw Error('Create needs an empty new project directory');
  const token=await accessToken(origin),options={headers:token?{Authorization:'Bearer '+token}:{}};
  let response=await request(origin+'/api/resources/'+id+'/install'+(values.version?'?version='+encodeURIComponent(values.version):''),options),app=false;
  if(response.status===404&&!values.version){response=await request(origin+'/api/apps/'+id+'/install',options);app=true;}
  if(!response.ok)throw await httpFailure(response,origin);
  const bundle=await responseData(response,origin),fingerprint=await verifyFingerprint(origin,bundle,{app});
  const confirm=plan=>askToWrite(plan,{yes:!!values.yes,json});
  const receipt=await installBundle(root,bundle,{},{create:true,confirm,fingerprint});
  await writeFile(await destination(await realpath(root),'congo.json'),JSON.stringify({schemaVersion:1,registry:origin,components:'src/components/congo',framework:'react-vite'},null,2),{flag:'wx'});
  if(values.install)installDependencies(root,!!values['allow-scripts']);
  const commands=await nextCommands(root);if(values.install)commands.splice(1,1);
  printResult(receipt,`Created ${id} in ${root}.\nNext:\n${commands.join('\n')}\nInstall scripts are off. If a package needs one, review it and run npm rebuild <name>.`,json);return;
 }
 if(command==='init') {
  await mkdir(root,{recursive:true});const canonical=await realpath(root),targets=['congo.json','CONGO.md',...(values.new?['package.json','index.html','src/main.jsx','vite.config.js']:[])];
  for(const rel of targets)if(await exists(await destination(canonical,rel)))throw Error('Initialization target already exists: '+rel);
  if(values.new) {
   const name=path.basename(root).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'my-app';
   const title=path.basename(root).replace(/[&<>"']/g,'');
   const files={
    'package.json':JSON.stringify({name,private:true,type:'module',scripts:{dev:'vite',build:'vite build',preview:'vite preview'},dependencies:{react:'19.2.0','react-dom':'19.2.0'},overrides:{rollup:'4.65.1'},devDependencies:{vite:'7.3.7','@vitejs/plugin-react':'5.0.4',typescript:'5.9.3','@types/react':'19.1.16','@types/react-dom':'19.1.9'}},null,2)+'\n',
    'index.html':`<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${title}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
    'src/main.jsx':`import React from 'react';\nimport {createRoot} from 'react-dom/client';\n\ncreateRoot(document.getElementById('root')).render(\n  <main>\n    <h1>Your Congo project</h1>\n    <p>Search for a screen, then add it and import its source and stylesheet.</p>\n  </main>\n);\n`,
    'vite.config.js':`import {defineConfig} from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`
   };
   for(const [rel,content] of Object.entries(files)){const target=await destination(canonical,rel);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content,{flag:'wx'});}
  }
  const pkg=JSON.parse(await readFile(await destination(canonical,'package.json'),'utf8'));
  if(!(pkg.dependencies?.react||pkg.devDependencies?.react)||!(pkg.devDependencies?.vite||pkg.dependencies?.vite))throw Error('This installer currently supports React/Vite projects; other stacks require explicit adaptation');
  const next={schemaVersion:1,registry:origin,components:'src/components/congo',framework:'react-vite'};
  await writeFile(path.join(root,'congo.json'),JSON.stringify(next,null,2),{flag:'wx'});
  await writeFile(await destination(canonical,'CONGO.md'),`Congo resources: search /api/screens?q=... for every app page and /api/resources?q=... for screens, templates and handbooks on the configured registry. A packaged screen installs alone (add ID --destination PATH). A screen marked not yet installable on its own has no package yet; full-app source is the separate template product (create APP_ID). Take individual pieces from a screen's source. Browsing and search are free; source needs an active subscription. Use congo login for browser sign-in, or CONGO_LIBRARY_TOKEN from a secret manager for CI. Saved sign-in stays outside projects. Never write credentials into source, congo.json, npm configuration or Git. The CLI verifies and copies source, styles and notices; import styles and use the returned styleScope wrapper. Read each installed guide and example for providers and states. Installed file hashes are in .congo/<id>.json. Preserve existing project rules. Your own coding client performs edits, installation and builds.\n`,{flag:'wx'});
  printResult(next,'Connected Congo in '+root+'. Next: congo search --kind screen --query contacts',json);return;
 }
 if(command==='handbooks') {
  const result=await get('/api/handbooks');
  const items=[...(result.published??result.items??[]),...(result.mine??[])];
  printResult(result,items.map(item=>oneLine(item.id)+' | '+oneLine(item.title)).join('\n')||'No design handbooks found.',json);return;
 }
 if(command==='handbook') {
  if(positionals[0]==='save') {
   if(typeof values.title!=='string'||typeof values.file!=='string')throw Error('Use handbook save --title NAME --file HANDBOOK.md [--description TEXT --id HANDBOOK_ID]');
   if(values.id!==undefined&&!/^hb_[a-f0-9]{16}$/.test(values.id))throw Error('Use a handbook ID from handbooks');
   const token=await accessToken(origin);if(!token)throw Error('Sign in required. Run `congo login`.');
   const body={title:values.title,content:await readFile(path.resolve(values.file),'utf8'),...typeof values.description==='string'?{description:values.description}:{}};
   const response=await request(origin+'/api/handbooks'+(values.id?'/'+values.id:''),{method:values.id?'PUT':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
   if(!response.ok)throw await httpFailure(response,origin);const saved=await responseData(response,origin),result={id:saved.id,title:saved.title,updatedAt:saved.updatedAt};
   printResult(result,'Saved '+oneLine(saved.title)+'. Next: congo handbook '+saved.id,json);return;
  }
  if(!/^hb_[a-f0-9]{16}$/.test(positionals[0]??''))throw Error('Use handbook HANDBOOK_ID (from handbooks) or handbook save …');
  const handbook=await get('/api/handbooks/'+positionals[0]);process.stdout.write(handbook.content.endsWith('\n')?handbook.content:handbook.content+'\n');return;
 }
 const id=positionals[0];if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id??''))throw Error('Use a resource ID from search');
 const confirm=async plan=>{if(plan.installScripts===null&&plan.packages.length)plan.installScripts=await lookupInstallScripts(plan.packages);return askToWrite(plan,{yes:!!values.yes,json});};
 const bundle=await get('/api/resources/'+id+'/install'+(values.version?'?version='+encodeURIComponent(values.version):'')),fingerprint=await verifyFingerprint(origin,bundle);
 const receipt=await installBundle(root,bundle,config,{destination:values.destination,update:command==='update',updateShared:!!values['update-shared'],confirm,fingerprint});
 if(values.install)installDependencies(root,!!values['allow-scripts']);
 printResult(receipt,`${command==='add'?'Added':'Updated'} ${id}@${receipt.version}. Next: read .congo/${id}.json and the installed guide for imports and styles.`,json);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main().catch(e=>{console.error(redact(e.message));process.exitCode=1;});
