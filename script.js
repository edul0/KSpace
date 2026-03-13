const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM = urlParams.get('sala');
let user = { 
    name: 'Eduardo', 
    avatar: 'https://github.com/edul0.png' 
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
        <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:monospace;">
            <img src="marca.png" width="100">
            <h1>KSpace</h1>
            <input type="text" id="sala-in" placeholder="nome-da-sala" style="font-size:1.8rem; text-align:center; border:none; border-bottom:4px solid #000; outline:none; width:280px;">
        </div>`;
    document.getElementById('sala-in').onkeypress = (e) => { if(e.key==='Enter') window.location.href=`?sala=${e.target.value}`; };
}

function renderSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <img src="marca.png" class="logo" onclick="window.location.href='index.html'">
                <img src="${user.avatar}" style="width:28px; border-radius:50%; border:1px solid #000;">
                <b style="font-size:13px;">${ROOM}</b>
            </div>
            <div class="header-right">
                <button class="icon-btn" onclick="toggleDark()">🌓</button>
                <button class="link-btn" onclick="share()">LINK 🔗</button>
            </div>
        </header>
        <main id="board" class="board-container"></main>
        <div class="side-panel">
            <div style="padding:10px; background:#333; font-size:11px; font-weight:bold;">LOGS</div>
            <div id="log-content" style="flex:1; overflow-y:auto; padding:15px; font-family:monospace; font-size:11px;"></div>
        </div>`;
}

async function initData() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM).maybeSingle();
    if (!data) {
        const init = [{id:"todo", title:"A Fazer", cards:[]},{id:"doing", title:"Em Curso", cards:[]},{id:"done", title:"Feito", cards:[]}];
        const { data: nD } = await _supabase.from('kanban_data').insert([{ room_name: ROOM, state: init, logs: [] }]).select().single();
        data = nD;
    }
    state = data.state; logs = data.logs || [];
    renderBoard(); renderLogs();
    
    _supabase.channel(ROOM).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM}` }, 
    p => { state = p.new.state; logs = p.new.logs; renderBoard(); renderLogs(); }).subscribe();
}

function renderBoard() {
    const b = document.getElementById('board');
    if (!b) return;
    b.innerHTML = state.map(col => `
        <div class="column" ondragover="allowDrop(event)" ondrop="drop(event, '${col.id}')">
            <div class="column-header">${col.title} (${col.cards.length})</div>
            <div class="card-list">
                ${col.cards.map(c => {
                    let emoji = c.prio === "prio-alta" ? "📌" : (c.prio === "prio-baixa" ? "🍃" : "⚡");
                    return `
                    <div class="card ${c.prio}" id="${c.id}" draggable="true" ondragstart="drag(event)" ondblclick="delCard('${c.id}')">
                        <div class="prio-indicator">${emoji}</div>
                        <div style="font-weight:bold; flex:1; font-size:14px;">${c.content}</div>
                        ${c.img ? `<img src="${c.img}" class="task-img">` : ''}
                        <div style="font-size:9px; color:#666; margin-top:10px; cursor:pointer;" onclick="addImg('${c.id}')">🖼️ ANEXAR</div>
                        <div class="card-footer" onclick="assign('${c.id}')" style="cursor:pointer;">
                            <img src="${c.ownerAvatar || 'https://github.com/identicons/ghost.png'}">
                            <span>@${c.owner || 'atribuir'}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ NOVO POST-IT</button>
        </div>`).join('');
}

/* DRAG & DROP LOGIC */
function drag(ev) { ev.dataTransfer.setData("cardId", ev.target.id); }
function allowDrop(ev) { ev.preventDefault(); }
async function drop(ev, destColId) {
    ev.preventDefault();
    const cardId = ev.dataTransfer.getData("cardId");
    let cardData = null;
    state.forEach(col => {
        const idx = col.cards.findIndex(c => c.id === cardId);
        if (idx > -1) cardData = col.cards.splice(idx, 1)[0];
    });
    if (cardData) {
        state.find(col => col.id === destColId).cards.push(cardData);
        renderBoard();
        await save(`@${user.name} moveu "${cardData.content}"`);
    }
}

/* ACTIONS */
async function save(msg) {
    if(msg) logs.unshift({ msg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state, logs: logs.slice(0,20) }).eq('room_name', ROOM);
}

async function addCard(cid) {
    const t = prompt("O que precisa ser feito?"); if(!t) return;
    const p = prompt("Prioridade: 1-Alta 📌, 2-Média ⚡, 3-Baixa 🍃", "2");
    const prioClass = p==="1" ? "prio-alta" : (p==="3" ? "prio-baixa" : "prio-media");
    state.find(x => x.id === cid).cards.push({ 
        id: crypto.randomUUID(), content: t, prio: prioClass, owner: user.name, ownerAvatar: user.avatar 
    });
    renderBoard(); await save(`@${user.name} criou tarefa`);
}

async function assign(id) {
    const n = prompt("Delegar para (User GitHub):"); if(!n) return;
    state.forEach(col => {
        const c = col.cards.find(x => x.id === id);
        if(c) { c.owner = n; c.ownerAvatar = `https://github.com/${n}.png`; }
    });
    renderBoard(); await save(`Delegado para @${n}`);
}

async function addImg(id) {
    const u = prompt("Link da imagem:"); if(!u) return;
    state.forEach(col => { const c = col.cards.find(x => x.id === id); if(c) c.img = u; });
    renderBoard(); await save(`Imagem adicionada`);
}

async function delCard(id) { if(confirm("Apagar?")) { state.forEach(col => col.cards = col.cards.filter(x => x.id !== id)); renderBoard(); await save(`Card removido`); } }
function toggleDark() { document.body.classList.toggle('dark-mode'); }
function renderLogs() { document.getElementById('log-content').innerHTML = logs.map(l => `<div style="margin-bottom:8px; border-left:2px solid #0f0; padding-left:8px;">[${l.time}] ${l.msg}</div>`).join(''); }
function share() { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }

start();
