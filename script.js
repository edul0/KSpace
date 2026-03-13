const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM = urlParams.get('sala');
let user = { 
    name: localStorage.getItem('kanban_custom_name') || 'Eduardo', 
    avatar: localStorage.getItem('kanban_custom_avatar') || `https://github.com/edul0.png` 
};

let state = [];
let logs = [];

async function start() {
    if (!ROOM) return renderLanding();
    renderSkeleton();
    initData();
}

function renderLanding() {
    document.getElementById('app-container').innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f4f4f4; font-family:sans-serif;">
            <img src="marca.png" width="100">
            <h1 style="font-size:3.5rem; letter-spacing:-2px; margin:15px 0;">KSpace</h1>
            <p style="color:#666; font-weight:bold; margin-bottom:20px;">DIGITE O NOME DA SALA</p>
            <input type="text" id="sala-in" placeholder="nome-da-sala" style="font-size:1.5rem; text-align:center; border:3px solid #000; padding:15px; border-radius:12px; outline:none; width:320px; box-shadow: 8px 8px 0px #000;">
        </div>`;
    document.getElementById('sala-in').onkeypress = (e) => { 
        if(e.key==='Enter') window.location.href=`?sala=${e.target.value.toLowerCase().trim()}`; 
    };
}

function renderSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <img src="marca.png" class="logo" onclick="window.location.href='index.html'">
                <div id="online-indicator" onclick="togglePanel('user-panel')">
                    <div id="status-dot"></div>
                    <span id="user-count">...</span>
                </div>
            </div>
            <div class="header-right">
                <img src="${user.avatar}" onclick="manageProfile()" style="width:35px; height:35px; border-radius:50%; border:2px solid #000; cursor:pointer;">
                <button class="icon-btn" onclick="togglePanel('log-panel')">📜</button>
                <button class="icon-btn" onclick="toggleTheme()">🌓</button>
                <button class="icon-btn" onclick="nukeRoom()">☢️</button>
                <button class="link-btn" onclick="share()">LINK</button>
            </div>
        </header>
        <main id="board" class="board-container"></main>
        <div id="user-panel" class="side-panel">
            <div class="panel-header">ONLINE <button onclick="togglePanel('user-panel')" style="background:none; border:none; color:#0f0; cursor:pointer;">✖</button></div>
            <div id="user-list"></div>
        </div>
        <div id="log-panel" class="side-panel">
            <div class="panel-header">HISTÓRICO <button onclick="togglePanel('log-panel')" style="background:none; border:none; color:#0f0; cursor:pointer;">✖</button></div>
            <div id="log-content" style="padding:15px; font-family:monospace; font-size:11px;"></div>
        </div>`;
}

async function initData() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM).maybeSingle();
    
    if (!data) {
        const pass = prompt("Defina uma SENHA para esta nova sala (vazio = livre):");
        state = [{id:"todo", title:"Para Fazer", cards:[]},{id:"doing", title:"Em Curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        await _supabase.from('kanban_data').insert([{ room_name: ROOM, state, logs: [], password: pass }]);
    } else {
        if (data.password) {
            const check = prompt("Sala protegida. Digite a SENHA:");
            if (check !== data.password) {
                alert("🚫 Senha incorreta!");
                window.location.href = "index.html";
                return;
            }
        }
        state = data.state; logs = data.logs || [];
    }

    renderBoard(); renderLogs();

    const channel = _supabase.channel(`room_${ROOM}`, { config: { presence: { key: user.name } } });
    channel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM}` }, (p) => {
            state = p.new.state; logs = p.new.logs || [];
            renderBoard(); renderLogs();
        })
        .on('presence', { event: 'sync' }, () => {
            const pState = channel.presenceState();
            const users = [];
            Object.values(pState).forEach(arr => arr.forEach(p => { if(!users.find(u=>u.name===p.name)) users.push(p); }));
            document.getElementById('user-count').innerText = `${users.length} ONLINE`;
            document.getElementById('user-list').innerHTML = users.map(u => `<div style="padding:10px; display:flex; align-items:center; gap:10px;"><img src="${u.avatar}" style="width:25px; border-radius:50%;"> ${u.name}</div>`).join('');
        })
        .subscribe(async (s) => { if(s==='SUBSCRIBED') { document.getElementById('status-dot').classList.add('live'); await channel.track({ avatar: user.avatar, name: user.name }); } });
}

function renderBoard() {
    const b = document.getElementById('board');
    if (!b) return;
    b.innerHTML = state.map(col => `
        <div class="column" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
            <div class="column-header">${col.title} (${col.cards.length})</div>
            <div class="card-list">
                ${col.cards.map(c => `
                    <div class="card ${c.prio || 'prio-media'}" id="${c.id}" draggable="true" ondragstart="drag(event)" ondblclick="delCard('${c.id}')">
                        <div class="prio-indicator">${c.prio==='prio-alta'?'📌':(c.prio==='prio-baixa'?'🍃':'⚡')}</div>
                        <div style="font-weight:bold; flex:1; font-size:15px;">${c.content}</div>
                        ${c.img ? `<img src="${c.img}" class="task-img">` : ''}
                        <div style="font-size:9px; color:#888; margin-top:10px; cursor:pointer; text-align:right;" onclick="addImg('${c.id}')">ANEXAR</div>
                        <div class="card-footer" onclick="assign('${c.id}')" style="cursor:pointer;">
                            <img src="${c.ownerAvatar || 'https://github.com/identicons/ghost.png'}">
                            <span>@${c.owner || 'atribuir'}</span>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ NOVO POST-IT</button>
        </div>`).join('');
}

async function save(msg) {
    if(msg) logs.unshift({ msg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state, logs: logs.slice(0,15) }).eq('room_name', ROOM);
}
function drag(ev) { ev.dataTransfer.setData("cardId", ev.target.id); }
async function drop(ev, dest) {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("cardId");
    let card = null;
    state.forEach(col => { const idx = col.cards.findIndex(c => c.id === id); if(idx > -1) card = col.cards.splice(idx, 1)[0]; });
    if(card) { state.find(c => c.id === dest).cards.push(card); renderBoard(); await save(`@${user.name} moveu tarefa`); }
}
async function addCard(cid) {
    const t = prompt("Tarefa:"); if(!t) return;
    const p = prompt("1-Alta 📌, 2-Média ⚡, 3-Baixa 🍃", "2");
    const prio = p==="1"?"prio-alta":(p==="3"?"prio-baixa":"prio-media");
    state.find(x => x.id === cid).cards.push({ id: crypto.randomUUID(), content: t, prio, owner: user.name, ownerAvatar: user.avatar });
    renderBoard(); await save(`@${user.name} criou post-it`);
}
async function assign(id) {
    const n = prompt("GitHub User:"); if(!n) return;
    state.forEach(col => { const c = col.cards.find(x => x.id === id); if(c){ c.owner = n; c.ownerAvatar = `https://github.com/${n}.png`; } });
    renderBoard(); await save(`Atribuído a @${n}`);
}
async function addImg(id) {
    const u = prompt("URL Imagem:"); if(!u) return;
    state.forEach(col => { const c = col.cards.find(x => x.id === id); if(c) c.img = u; });
    renderBoard(); await save(`Imagem anexada`);
}
async function nukeRoom() { if(confirm("Resetar?")) { state.forEach(c => c.cards = []); await save("RESET TOTAL"); renderBoard(); } }
async function delCard(id) { if(confirm("Apagar?")) { state.forEach(c => c.cards = c.cards.filter(x => x.id !== id)); renderBoard(); await save(`Removido`); } }
function togglePanel(id) { const p = document.getElementById(id); p.classList.toggle('active'); }
function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function renderLogs() { document.getElementById('log-content').innerHTML = logs.map(l => `<div style="margin-bottom:8px;">[${l.time}] ${l.msg}</div>`).join(''); }
function share() { navigator.clipboard.writeText(window.location.href); alert("Copiado!"); }
function manageProfile() { 
    const n = prompt("Seu Nome:", user.name); const a = prompt("Sua Foto URL:", user.avatar);
    if(n&&a){ localStorage.setItem('kanban_custom_name', n); localStorage.setItem('kanban_custom_avatar', a); location.reload(); }
}

start();
