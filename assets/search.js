const inp=document.getElementById('q'),box=document.getElementById('results');let IDX=null;
fetch('search-index.json').then(r=>r.json()).then(d=>{IDX=d;});
function norm(s){return (s||'').toLowerCase();}
function stripFor(r){if(!r.rev||!r.rev.total)return '';
var parts=[['don','#C8743A'],['gov','#7A5C45'],['gift','#D9B26F'],['else','#B8B0A4']];var h='<div class="strip mini" style="margin:0">';
parts.forEach(function(p){var v=r.rev[p[0]];if(v){h+='<div class="seg" style="flex:'+v+' 1 0;background:'+p[1]+'"></div>'}});
return h+'</div>'}
inp&&inp.addEventListener('input',()=>{const q=norm(inp.value).trim();if(!IDX||q.length<2){box.innerHTML='';return;}
const hits=IDX.filter(e=>norm(e.n).includes(q)||norm(e.a).includes(q)||e.b.replace(/[^0-9A-Z]/gi,'').includes(q.replace(/[^0-9A-Z]/gi,''))).slice(0,60);
box.innerHTML=hits.length?hits.map(e=>'<div class="result"><div class="rmain"><a href="charity/'+e.b+'.html">'+e.n.replace(/</g,'&lt;')+'</a><div class="small">'+(e.c?e.c+' · ':'')+'Business number '+e.b+'</div></div><div class="rstrip">'+stripFor(e)+'</div></div>').join(''):'<p class="small">No charity in this preview matches that. Check the spelling, or try the business number.</p>';});
