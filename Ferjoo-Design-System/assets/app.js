'use strict';
const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
const icon=(name)=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML=(v)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assetURL=path=>(window.FERJOO_EMBEDDED_ASSETS||{})[path]||path;
const referenceData=[
 ['r01','图标叠层研究','1d06fa4c21bac273bd0308b4562fd555.jpg','吸收圆润轮廓与少量叠层；舍弃厚重灰色底座和普遍光晕。'],
 ['r02','图标圆角研究','216a4d786f8505ebddd4f1412f8b6ec1.jpg','吸收圆角比例与暖橙体块；功能图标统一为轻量 SVG，不直接搬用参考图标。'],
 ['r03','提示面板','IMG_1807.PNG','采纳聚焦单一行动的面板结构；压缩长文，避免由缺少记录直接得出健康或安全结论。'],
 ['r04','酵种主页','IMG_1808.PNG','采纳轻量陪伴角色；补充当前对象、最近记录和导航标签，降低无效留白。'],
 ['r05','日期日记','IMG_1809.PNG','采纳按日回看和独立提示卡；增强日期辨识、空记录入口及文字对比。'],
 ['r06','工具计算器','IMG_1810.PNG','采纳分段器与步进器；输入范围、公式与结果保持清晰，不沿用模糊结果遮挡。'],
 ['r07','分组设置','IMG_1811.PNG','采纳分组列表、尾随值和开关；收敛多色图标，补齐权限失败后的说明。'],
 ['r08','奶油色工具卡','a55c74fefebbd82739ab690c71777439.jpg','采纳奶油表面与整齐卡片比例；不移植与酵种工具无关的专注统计。'],
 ['r09','暖色渐变海报','cdd0dd2fb7c2121faac6c22bb769b7b5.jpg','采纳暖色调与纵向节奏；高饱和渐变只放在品牌展示，表单保持实色背景。'],
 ['r10','柔光与表情','e7f2611d4edfee066d8e7c752fd62ff0.jpg','采纳软边界、暖色柔光与极简表情；柔光限单个品牌区域，正文放在实色面板上。']
];
const palette=[
 ['品牌橙','#FF6B25','brand-orange','标识 / 品牌点缀'],['操作深橙','#B84A16','action-primary','主行动 / 选中态'],['杏橙浅底','#FFF0E2','surface-warm','强调底座 / 陪伴区域'],['页面暖白','#FBF8F3','surface-page','页面基础底色'],
 ['卡片白','#FFFFFF','surface-card','内容容器'],['正文棕黑','#302820','text-primary','标题 / 正文'],['次级棕灰','#75685C','text-secondary','说明 / 时间'],['分组浅边','#E9E1D6','border-subtle','只作装饰分隔'],
 ['控件边线','#9B8D82','border-control','输入边界'],['成功绿','#356449','success','成功 + 文字 / 图标'],['提醒棕','#895A15','warning','注意 + 文字 / 图标'],['错误红','#B33A2D','danger','错误 / 危险行动'],
 ['信息蓝','#315F8A','info','中性信息'],['焦点蓝','#285DA8','focus-ring','键盘焦点'],['选中浅橙','#FBE6D3','surface-selected','导航 / 互斥选项'],['禁用底色','#EEE8E0','disabled-surface','不可用控件背景']
];
$('#palette').innerHTML=palette.map(([label,hex,token,desc])=>`<button class="swatch" style="--swatch:${hex}" data-copy="${hex}" aria-label="复制${label}色值 ${hex}"><span class="swatch-color"></span><span class="swatch-info"><strong>${label}${icon('copy')}</strong><code>${hex} / --${token}</code><small>${desc}</small></span></button>`).join('');
$('#reference-grid').innerHTML=referenceData.map(([id,title])=>`<div class="reference-thumb"><button class="reference-image" data-reference="${id}" aria-label="放大参考 ${id.toUpperCase()} ${title}"><img src="${assetURL('assets/references/'+id+'.webp')}" width="300" height="420" alt="${id.toUpperCase()}：${title}" loading="lazy"></button><strong>${id.toUpperCase()} / ${title}</strong><small>查看设计取舍 ↗</small></div>`).join('');
$('#icon-gallery').innerHTML=[['jar','酵种'],['book','日记'],['scale','工具'],['settings','设置'],['plus','新增'],['bell','提醒'],['leaf','观察'],['warning','警示']].map(([name,label])=>`<div class="icon-item">${icon(name)}<span>${label}</span></div>`).join('');
function luminance(hex){const c=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return ((l[0]+.05)/(l[1]+.05)).toFixed(2);}
const colorPairs=[['正文棕黑 / 页面暖白','#302820','#FBF8F3','正文与标题'],['次级棕灰 / 页面暖白','#75685C','#FBF8F3','辅助文字'],['白字 / 操作深橙','#FFFFFF','#B84A16','主按钮'],['正文棕黑 / 品牌橙','#302820','#FF6B25','品牌展示区短文字'],['白字 / 品牌橙','#FFFFFF','#FF6B25','不用于普通字号按钮文字'],['控件边线 / 卡片白','#9B8D82','#FFFFFF','交互边界，目标 ≥ 3:1'],['焦点蓝 / 页面暖白','#285DA8','#FBF8F3','焦点环，目标 ≥ 3:1'],['成功绿 / 成功浅底','#356449','#E9F2EA','成功文字'],['提醒棕 / 提醒浅底','#895A15','#FFF1D8','提醒文字'],['错误红 / 错误浅底','#B33A2D','#FCEBE7','错误文字'],['信息蓝 / 信息浅底','#315F8A','#EAF1F7','信息文字']];
$('#contrast-table').innerHTML=colorPairs.map(([name,a,b,desc])=>`<tr><td>${name}</td><td><strong>${contrast(a,b)} : 1</strong></td><td>${desc}</td></tr>`).join('');

// Toasts are polite, dismissible, and pause on pointer or keyboard interaction.
let toastTimer,toastStart,toastRemaining=0,undoAction=null;
const toast=$('#toast');
function dismissToast(){clearTimeout(toastTimer);toast.hidden=true;undoAction=null;$('#toast-message').replaceChildren();}
function pauseToast(){if(toast.hidden)return;clearTimeout(toastTimer);toastRemaining=Math.max(0,toastRemaining-(performance.now()-toastStart));}
function resumeToast(){if(toast.hidden||toast.matches(':hover')||toast.contains(document.activeElement))return;clearTimeout(toastTimer);toastStart=performance.now();toastTimer=setTimeout(dismissToast,Math.max(1,toastRemaining));}
function notify(message,undo=null){clearTimeout(toastTimer);$('#toast-message').textContent=message;undoAction=undo;$('#toast-action').hidden=!undo;toast.hidden=false;toastRemaining=undo?8000:4000;toastStart=performance.now();resumeToast();}
toast.addEventListener('mouseenter',pauseToast);toast.addEventListener('mouseleave',resumeToast);toast.addEventListener('focusin',pauseToast);toast.addEventListener('focusout',()=>setTimeout(resumeToast,0));
$('#toast-dismiss').onclick=dismissToast;
$('#toast-action').onclick=()=>{const action=undoAction;dismissToast();if(action)action();};
async function copyText(value){
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value);}else{const t=document.createElement('textarea');t.value=value;t.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok)throw new Error('copy unavailable');}notify('已复制：'+(value.length<25?value:'核心 CSS 变量'));}
 catch{const box=document.createElement('div');box.className='manual-copy';const p=document.createElement('p');p.textContent='自动复制不可用，请选中文本后复制。';const t=document.createElement('textarea');t.readOnly=true;t.value=value;t.setAttribute('aria-label','待复制文本');box.append(p,t);notify('请手动复制');$('#toast-message').append(box);toastRemaining=30000;t.focus();t.select();}
}
document.addEventListener('click',e=>{const copy=e.target.closest('[data-copy]');if(copy)copyText(copy.dataset.copy);const n=e.target.closest('[data-toast]');if(n)notify(n.dataset.toast);});
$('#copy-tokens').onclick=()=>copyText(':root {\n  --surface-page: #FBF8F3;\n  --surface-card: #FFFFFF;\n  --text-primary: #302820;\n  --text-secondary: #75685C;\n  --action-primary: #B84A16;\n  --on-action: #FFFFFF;\n  --border-control: #9B8D82;\n  --focus-ring: #285DA8;\n  --radius-control: 12px;\n  --radius-card: 20px;\n  --radius-container: 28px;\n  --space-20: 20px;\n  --duration-fast: 120ms;\n  --ease-out: cubic-bezier(.2,.8,.2,1);\n}');
$('#print-doc').onclick=()=>window.print();

const sidebar=$('#sidebar'),menu=$('#menu-toggle');
function closeMenu(returnFocus=false){sidebar.classList.remove('open');sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');$('#main').inert=false;menu.setAttribute('aria-expanded','false');$('#nav-scrim').hidden=true;if(returnFocus)menu.focus();}
menu.onclick=()=>{if(sidebar.classList.contains('open')){closeMenu(true);return;}sidebar.classList.add('open');sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');$('#main').inert=true;menu.setAttribute('aria-expanded','true');$('#nav-scrim').hidden=false;$('#chapter-search').focus();};
$('#nav-scrim').onclick=()=>closeMenu(true);
document.addEventListener('keydown',e=>{if(!sidebar.classList.contains('open'))return;if(e.key==='Escape')closeMenu(true);if(e.key==='Tab'){const items=[$('#chapter-search'),...$$('#chapter-nav a').filter(a=>!a.hidden)],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
window.addEventListener('resize',()=>{if(window.innerWidth>=960&&sidebar.classList.contains('open'))closeMenu();});
$$('#chapter-nav a').forEach(a=>a.addEventListener('click',()=>closeMenu()));
$('#chapter-search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();let visible=0;$$('#chapter-nav a').forEach(a=>{a.hidden=!a.textContent.toLowerCase().includes(q);if(!a.hidden)visible++;});$('#chapter-nav').classList.toggle('searching',!!q);$$('.nav-group').forEach(g=>g.hidden=!!q);$('.search-empty').hidden=visible>0;});
let spyQueued=false;
function updateSection(){let active='';for(const s of $$('.doc-section')){if(s.getBoundingClientRect().top<=150)active=s.id;}$$('#chapter-nav a').forEach(a=>{const selected=a.hash==='#'+active;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});spyQueued=false;}
window.addEventListener('scroll',()=>{if(!spyQueued){spyQueued=true;requestAnimationFrame(updateSection);}},{passive:true});updateSection();

const referenceDialog=$('#reference-dialog');let refTrigger;
document.addEventListener('click',e=>{const b=e.target.closest('[data-reference]');if(!b)return;const r=referenceData.find(r=>r[0]===b.dataset.reference);if(!r)return;refTrigger=b;$('#reference-title').textContent=r[0].toUpperCase()+' / '+r[1];$('#reference-large').src=assetURL('assets/references/'+r[0]+'.webp');$('#reference-large').alt=r[1]+'，用户提供的设计参考';$('#reference-caption').textContent=r[3];$('#reference-filename').textContent='原始文件：'+r[2];referenceDialog.showModal();});
$('[data-close-reference]').onclick=()=>referenceDialog.close();referenceDialog.addEventListener('close',()=>refTrigger?.focus());referenceDialog.addEventListener('click',e=>{if(e.target===referenceDialog){const r=referenceDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)referenceDialog.close();}});

// ARIA tabs: arrow keys move and select, Home/End choose an endpoint.
const tabs=$$('.component-tabs [role=tab]');
function chooseTab(tab,focus=false){tabs.forEach(t=>{const on=t===tab;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;$('#'+t.getAttribute('aria-controls')).hidden=!on;});if(focus)tab.focus();}
tabs.forEach((t,i)=>{t.onclick=()=>chooseTab(t);t.onkeydown=e=>{let n;if(e.key==='ArrowRight')n=(i+1)%tabs.length;if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;if(n!==undefined){e.preventDefault();chooseTab(tabs[n],true);}};});
$('#font-weight').oninput=e=>{$('#font-weight-value').textContent=e.target.value;$('#font-specimen').style.fontWeight=e.target.value;};
$('#save-demo').onclick=()=>{const b=$('#save-demo'),w=b.offsetWidth;b.style.minWidth=w+'px';b.disabled=true;b.setAttribute('aria-busy','true');b.innerHTML='<span class="spinner" aria-hidden="true"></span><span>保存中…</span>';setTimeout(()=>{b.disabled=false;b.removeAttribute('aria-busy');b.innerHTML=icon('plus')+'<span>保存记录</span>';notify('示例记录已保存');},750);};
$('#delete-demo').onclick=()=>{$('#delete-state').textContent='示例记录已删除，可在下方提示中撤销。';$('#delete-demo').disabled=true;notify('示例记录已删除',()=>{$('#delete-state').textContent='已撤销删除，示例记录恢复。';$('#delete-demo').disabled=false;notify('已撤销删除');});};
const nameInput=$('#starter-name');
function validateName(){const n=nameInput.value.trim(),good=n.length>=1&&n.length<=12;$('#name-error').hidden=good;$('#name-error').textContent=good?'':'请输入 1–12 个字符的名称。';nameInput.setAttribute('aria-invalid',String(!good));return good;}
nameInput.oninput=()=>{$('#name-count').textContent=nameInput.value.length+' / 12';if(nameInput.getAttribute('aria-invalid')==='true')validateName();};
nameInput.onblur=()=>{if(nameInput.value.length)validateName();};
$('#field-demo').onsubmit=e=>{e.preventDefault();if(!validateName()){nameInput.focus();return;}notify('名称已保存：'+nameInput.value.trim()+'（示例）');};
$('#reminder-switch').onclick=e=>{const b=e.currentTarget,on=b.getAttribute('aria-checked')!=='true';b.setAttribute('aria-checked',String(on));notify('示例记录提醒已'+(on?'开启':'关闭'));};
function configureSegments(root,callback){const buttons=$$('button',root);function select(b,focus=false){buttons.forEach(x=>{const on=x===b;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',String(on));x.tabIndex=on?0:-1;});if(focus)b.focus();callback(b);}buttons.forEach((b,i)=>{b.tabIndex=b.classList.contains('selected')?0:-1;b.onclick=()=>select(b);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;select(buttons[j],true);};});}
configureSegments($('.segmented', $('#panel-inputs')),b=>{$('#unit-readout').textContent=b.dataset.unit==='c'?'24.0 °C':'75.2 °F';notify('温度单位已切换（示例）');});

// In-memory prototype. Dates are fixed to match the document's illustrative data.
const today=new Date(2026,9,28,12),formatDate=d=>`${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日`;
function dayDate(offset=0){const d=new Date(today);d.setDate(d.getDate()+offset);return d;}
let currentScreen='home',dateOffset=0,portions=1,temperatureUnit='c',notification='off',scrollPositions={};
const initialRecords=[{id:'sample',day:0,time:'10:30',text:'顶部平整，侧壁出现细小气泡。',temperature:24}];
let records=initialRecords.map(x=>({...x}));
const patterns={home:['PATTERN 01 / HOME','先知道状态，再决定行动。','标题确认对象；最近记录建立上下文。插画作为轻量陪伴，把主要空间留给观察摘要和“记录观察”。',[['信息顺序','对象 → 最近记录 → 当前摘要 → 主行动。'],['操作层级','每屏 1 个主按钮；日记回看为次要入口。'],['内容边界','只描述记录，不把时间长短自动解释为酵种健康程度。']]],journal:['PATTERN 02 / JOURNAL','每一天，都有清楚的上下文。','日期与前后切换保持稳定。已有记录按时间回看；没有记录时解释空白，并提供当前日期的记录入口。',[['日期切换','前后按钮触达 44px；未来日期不可继续前进。'],['空状态','空日给出说明和记录入口，不让用户猜测。'],['保存回流','新观察按所选日期写入日记，并更新主页摘要。']]],tools:['PATTERN 03 / TOOLS','输入透明，结果也透明。','把输入、结果和公式放在一起。步进器到边界时禁用，不循环。所有结果随输入即时更新。',[['输入边界','演示份数范围 1–6，每次增减 1 份。'],['公式公开','演示基准为每份 20g + 40g + 40g，总量 100g。'],['内容约束','配比仅用于交互示例，真实业务公式待核实。']]],settings:['PATTERN 04 / SETTINGS','少做选择，始终可控。','设置按提醒与显示分组。尾随值便于扫读；单位切换即时生效，开启提醒先经过权限说明。',[['分组方式','提醒 → 单位 → 数据说明；低频项放在后面。'],['权限一致','允许后才显示开启；拒绝后显示原因并保持关闭。'],['交互边界','此原型模拟权限结果，不实际请求系统通知。']]]};
function navTo(screen){scrollPositions[currentScreen]=$('#phone-screen').scrollTop;currentScreen=screen;renderPhone();$('#phone-screen').scrollTop=scrollPositions[screen]||0;}
function latestRecord(){return [...records].sort((a,b)=>b.day-a.day||b.time.localeCompare(a.time))[0];}
function renderPhone(){
 const screen=$('#phone-screen'),last=latestRecord();
 $$('.phone-nav button').forEach(b=>{const on=b.dataset.screen===currentScreen;b.classList.toggle('selected',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const p=patterns[currentScreen];$('#pattern-number').textContent=p[0];$('#pattern-title').textContent=p[1];$('#pattern-description').textContent=p[2];$('#pattern-rules').innerHTML=p[3].map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('');screen.setAttribute('aria-label',({home:'酵种',journal:'日记',tools:'工具',settings:'设置'})[currentScreen]+'页面预览');
 if(currentScreen==='home')screen.innerHTML=`<span class="eyebrow">MY STARTER</span><h3 style="margin-top:8px">早上好，小麦。</h3><p class="p-meta">第 8 天 · ${last?'最近记录 '+last.time:'还没有观察记录'}</p><img class="phone-illustration" src="${assetURL('assets/brand/companion.svg')}" alt="酵种罐陪伴插画" width="115" height="125"><div class="phone-summary"><span class="small-muted">${last?'最近一次观察':'开始第一条观察'}</span><h4>${last?escapeHTML(last.text):'今天，看到了什么变化？'}</h4><p>${last?'记录是观察的起点。下次可以一起回看。':'记下顶部、气泡或高度，留下一点线索。'}</p></div><button class="btn primary full" data-record="0">${icon('plus')}记录观察</button><button class="text-link" data-go="journal">回看今天的日记 ${icon('arrow')}</button>`;
 if(currentScreen==='journal'){
 const entries=records.filter(r=>r.day===dateOffset).sort((a,b)=>b.time.localeCompare(a.time));
 screen.innerHTML=`<span class="eyebrow">DAILY NOTES</span><h3 style="margin-top:8px">观察日记</h3><div class="journal-date"><button class="icon-button" id="prev-day" aria-label="查看前一天" ${dateOffset<=-30?'disabled':''}>${icon('chevron-left')}</button><strong>${formatDate(dayDate(dateOffset))}</strong><button class="icon-button" id="next-day" aria-label="查看后一天" ${dateOffset>=0?'disabled':''}>${icon('chevron-right')}</button></div>${entries.length?entries.map(r=>`<article class="journal-entry"><time>${escapeHTML(r.time)}</time><p>${escapeHTML(r.text)}</p>${r.temperature!==null?`<small>环境温度 ${temperatureUnit==='c'?r.temperature.toFixed(1)+' °C':(r.temperature*1.8+32).toFixed(1)+' °F'}</small>`:''}</article>`).join(''):`<div class="empty-journal">${icon('book')}<h4>这一天还没有记录</h4><p>想记下什么？先从看到的变化开始。</p></div>`}<button class="btn primary full" data-record="${dateOffset}">${icon('plus')}记录这一天</button><p class="tool-caption">原型支持回看前 30 天；记录按所选日期归档。</p>`;
 }
 if(currentScreen==='tools')screen.innerHTML=`<span class="eyebrow">SIMPLE TOOLS</span><h3 style="margin-top:8px">配比演示</h3><p class="p-meta">输入清楚，结果也清楚。</p><div class="tool-box"><div class="stepper-row"><span>演示份数</span><div class="stepper"><button class="icon-button" id="decrease" aria-label="减少一份" ${portions<=1?'disabled':''}>${icon('minus')}</button><strong id="portion-count">${portions}</strong><button class="icon-button" id="increase" aria-label="增加一份" ${portions>=6?'disabled':''}>${icon('plus')}</button></div></div><p class="tool-caption">范围 1–6 份，每次调整 1 份。</p><div class="tool-result" aria-live="polite"><div><span>酵种</span><span>${20*portions} g</span></div><div><span>面粉</span><span>${40*portions} g</span></div><div><span>水</span><span>${40*portions} g</span></div><div style="border-top:1px solid #DFC4AA;padding-top:12px"><span>总量</span><span>${100*portions} g</span></div></div><p class="tool-caption">计算示例：比例 1 : 2 : 2。<br>每份 = 20g + 40g + 40g。<br>数值仅展示 UI 行为，不是养护建议。</p></div><p class="tool-caption">真实工具上线前，需确认公式、条件、范围和舍入规则。</p>`;
 if(currentScreen==='settings')screen.innerHTML=`<span class="eyebrow">PREFERENCES</span><h3 style="margin-top:8px">照顾你的习惯。</h3><p class="phone-group-title">提醒</p><div class="phone-settings-group"><div class="settings-row"><div><strong>记录提醒</strong><small>系统权限流程演示</small></div><button class="switch" id="phone-reminder" role="switch" aria-checked="${notification==='allowed'}" aria-label="原型记录提醒"><span></span></button></div></div>${notification==='denied'?'<p class="permission-message">模拟权限被拒：提醒未开启，仍可手动记录。再次开启可重试流程。</p>':notification==='allowed'?'<p class="permission-message allowed">模拟权限已允许，提醒已开启。</p>':''}<p class="phone-group-title">显示</p><div class="phone-settings-group"><div class="settings-row"><strong>温度单位</strong><div class="segmented" id="phone-units" role="group" aria-label="原型温度单位"><button data-phone-unit="c" aria-pressed="${temperatureUnit==='c'}" class="${temperatureUnit==='c'?'selected':''}">°C</button><button data-phone-unit="f" aria-pressed="${temperatureUnit==='f'}" class="${temperatureUnit==='f'?'selected':''}">°F</button></div></div><div class="settings-row"><strong>示例温度</strong><span class="small-muted" id="phone-temperature">${temperatureUnit==='c'?'24.0 °C':'75.2 °F'}</span></div></div><p class="phone-group-title">数据与说明</p><div class="phone-settings-group"><button class="phone-setting-link" data-toast="原型数据仅在当前页内存中保存，刷新后重置。">示例数据说明 ${icon('info')}</button><button class="phone-setting-link" data-go="journal">查看观察日记 ${icon('chevron-right')}</button></div>`;
 if(currentScreen==='settings')configureSegments($('#phone-units'),b=>{temperatureUnit=b.dataset.phoneUnit;$('#phone-temperature').textContent=temperatureUnit==='c'?'24.0 °C':'75.2 °F';notify('原型温度单位已切换');});
}
$$('.phone-nav button').forEach(b=>b.onclick=()=>navTo(b.dataset.screen));
$('#phone-screen').addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target||target.disabled)return;
 if(target.dataset.go)navTo(target.dataset.go);
 if(target.dataset.record!==undefined)openRecord(Number(target.dataset.record),target);
 if(target.id==='prev-day'){dateOffset=Math.max(-30,dateOffset-1);renderPhone();$('#prev-day').focus();}
 if(target.id==='next-day'){dateOffset=Math.min(0,dateOffset+1);renderPhone();(dateOffset===0?$('#prev-day'):$('#next-day')).focus();}
 if(target.id==='increase'||target.id==='decrease'){const id=target.id;portions=Math.max(1,Math.min(6,portions+(id==='increase'?1:-1)));renderPhone();const next=$('#'+id);(next.disabled?$('#'+(id==='increase'?'decrease':'increase')):next).focus();}
 if(target.id==='phone-reminder'){if(notification==='allowed'){notification='off';renderPhone();$('#phone-reminder').focus();notify('原型提醒已关闭');}else{$('#permission-dialog').showModal();}}
});
$('#reset-prototype').onclick=()=>{records=initialRecords.map(x=>({...x}));dateOffset=0;portions=1;temperatureUnit='c';notification='off';scrollPositions={};$('#simulate-failure').checked=false;navTo('home');$('#phone-screen').scrollTop=0;notify('原型已重置');};
const permissionDialog=$('#permission-dialog');$('#close-permission').onclick=()=>permissionDialog.close();$('#permission-allow').onclick=()=>{notification='allowed';permissionDialog.close();renderPhone();notify('模拟结果：提醒已开启');};$('#permission-deny').onclick=()=>{notification='denied';permissionDialog.close();renderPhone();notify('模拟结果：权限被拒，提醒未开启');};permissionDialog.addEventListener('close',()=>setTimeout(()=>$('#phone-reminder')?.focus(),0));

const recordDialog=$('#record-dialog'),form=$('#record-form');let recordDay=0,recordTrigger=null,isSaving=false;
const observation=$('#observation'),temperature=$('#record-temperature');
function isDirty(){return !!(observation.value||temperature.value);}
function openRecord(day,trigger){recordDay=day;recordTrigger=trigger;form.reset();observation.setAttribute('aria-invalid','false');temperature.setAttribute('aria-invalid','false');['observation-error','temperature-error','save-error','discard-confirm'].forEach(id=>$('#'+id).hidden=true);$('#observation-count').textContent='0 / 100';$('#record-date').textContent=formatDate(dayDate(day));recordDialog.showModal();observation.focus();}
function closeRecord(force=false){if(isSaving){notify('正在保存，请稍候');return;}if(!force&&isDirty()){$('#discard-confirm').hidden=false;$('#continue-editing').focus();return;}recordDialog.close();}
$('#close-record').onclick=()=>closeRecord();$('#cancel-record').onclick=()=>closeRecord();$('#continue-editing').onclick=()=>{$('#discard-confirm').hidden=true;observation.focus();};$('#discard-editing').onclick=()=>{form.reset();closeRecord(true);};
recordDialog.addEventListener('cancel',e=>{e.preventDefault();closeRecord();});recordDialog.addEventListener('click',e=>{if(e.target===recordDialog){const r=recordDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeRecord();}});
recordDialog.addEventListener('close',()=>{if(recordTrigger?.isConnected)recordTrigger.focus();else $('#phone-screen').focus();});
function validateObservation(){const ok=observation.value.trim().length>0;observation.setAttribute('aria-invalid',String(!ok));$('#observation-error').hidden=ok;$('#observation-error').textContent=ok?'':'请写下 1–100 个字符的观察内容。';return ok;}
function validateTemperature(){const raw=temperature.value.trim(),value=raw===''?null:Number(raw),ok=!temperature.validity.badInput&&(value===null||(Number.isFinite(value)&&value>=-20&&value<=60&&Math.abs(value*10-Math.round(value*10))<1e-6));temperature.setAttribute('aria-invalid',String(!ok));$('#temperature-error').hidden=ok;$('#temperature-error').textContent=ok?'':'请输入 −20 至 60 之间的温度，最多 1 位小数，或留空。';return ok;}
observation.oninput=()=>{$('#observation-count').textContent=observation.value.length+' / 100';if(observation.getAttribute('aria-invalid')==='true')validateObservation();};observation.onblur=()=>{if(observation.value.length)validateObservation();};temperature.onblur=()=>{if(temperature.value.length||temperature.validity.badInput)validateTemperature();};temperature.oninput=()=>{if(temperature.getAttribute('aria-invalid')==='true')validateTemperature();};
form.onsubmit=e=>{
 e.preventDefault();if(isSaving)return;const o=validateObservation(),t=validateTemperature();if(!o||!t){(!o?observation:temperature).focus();return;}
 const b=$('#submit-record');isSaving=true;b.disabled=true;b.setAttribute('aria-busy','true');b.innerHTML='<span class="spinner" aria-hidden="true"></span><span>保存中…</span>';$('#save-error').hidden=true;$('#discard-confirm').hidden=true;observation.readOnly=true;temperature.readOnly=true;
 setTimeout(()=>{
  isSaving=false;b.disabled=false;b.removeAttribute('aria-busy');b.innerHTML='<span>保存观察</span>';observation.readOnly=false;temperature.readOnly=false;
  if($('#simulate-failure').checked){$('#simulate-failure').checked=false;$('#save-error').hidden=false;b.innerHTML='<span>重试保存</span>';return;}
  records.push({id:'entry-'+Date.now(),day:recordDay,time:'11:00',text:observation.value.trim(),temperature:temperature.value.trim()===''?null:Number(temperature.value)});form.reset();recordDialog.close();dateOffset=recordDay;navTo('journal');$('#phone-screen').scrollTop=0;$('#phone-screen').focus();notify('观察已保存到 '+formatDate(dayDate(recordDay))+' 的日记');
 },800);
};
renderPhone();
