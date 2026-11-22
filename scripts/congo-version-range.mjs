// Conservative semver range matching for an exact, public registry dependency.
// Unsupported protocols/tags fail closed; existing compatible ranges are retained.
const parse=s=>/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?$/.exec(s);
const cmp=(a,b)=>{for(let i=1;i<=3;i++){const d=Number(a[i])-Number(b[i]);if(d)return Math.sign(d);}return a[4]===b[4]?0:!a[4]?1:!b[4]?-1:Math.sign(a[4].localeCompare(b[4],undefined,{numeric:true}));};
export function acceptsPinnedVersion(range,pinned){
 if(range===pinned)return true;
 const alias=/^npm:((?:@[^/]+\/)?[^@]+)@(.+)$/.exec(pinned);
 if(alias){const old=/^npm:((?:@[^/]+\/)?[^@]+)@(.+)$/.exec(range);return !!old&&old[1]===alias[1]&&acceptsPinnedVersion(old[2],alias[2]);}
 const v=parse(pinned);if(!v)return false;
 return range.split('||').some(part=>{
  part=part.trim();if(!part)return false;
  part=part.replace(/(\d+\.\d+\.\d+)\s+-\s+(\d+\.\d+\.\d+)/g,'>=$1 <=$2').replace(/([<>]=?|[~^])\s+/g,'$1');
  const terms=part.split(/\s+/);if(v[4]&&!terms.some(t=>{const x=parse(t.replace(/^[~^<>=]+/,''));return x?.[4]&&x.slice(1,4).join('.')===v.slice(1,4).join('.');}))return false;
  return terms.every(term=>{
   const m=/^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(term),op=m[1]??'=',raw=m[2],p=parse(raw);
   if(p){const d=cmp(v,p);if(op==='^'||op==='~'){const n=p.slice(1,4).map(Number),upper=op==='~'?[n[0],n[1]+1,0]:n[0]>0?[n[0]+1,0,0]:n[1]>0?[0,n[1]+1,0]:[0,0,n[2]+1];return d>=0&&cmp(v,parse(upper.join('.')))<0;}return op==='='?d===0:op==='>'?d>0:op==='>='?d>=0:op==='<'?d<0:d<=0;}
   if(op!=='=')return false;
   const parts=raw.split('.');if(parts.length>3||!parts.every(p=>/^(?:\d+|x|\*)$/i.test(p)))return false;
   let wildcard=false;return parts.every((p,i)=>{if(/^(x|\*)$/i.test(p)){wildcard=true;return true;}return !wildcard&&Number(v[i+1])===Number(p);});
  });
 });
}
