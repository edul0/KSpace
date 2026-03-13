const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM = urlParams.get('sala');

let user = { 
    name: localStorage.getItem('kanban_custom_name') || 'Eduardo', 
    avatar: localStorage.getItem('kanban_custom_avatar') || 'https://github.com/edul0.png' 
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
            <h1>KSpace /</h1>
            <input type="text" id="sala-in" placeholder="nome-da-sala" style="font-size:1.8rem; text-align:center; border:none; border-bottom:4px solid #000; outline:none; width:280px;">
        </div>`;
    document.getElementById('sala-in').onkeypress = (e) => { if(e.key==='Enter') window.location.href=`?sala=${e.target.value}`; };
}

function renderSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <img src="marca.png" class="logo" onclick="window.location.href='index.html'">
                <div id="online-status" title="Conexão Realtime"></div>
                <div class="user-profile" onclick="manageProfile()" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <img src="${user.avatar}" style="width:28px; height:28px; border-radius:50%; border:1px solid #000;">
                    <span style="font-size:11px; font-weight:bold;">${user.name}</span>
                </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <div id="online-list" class="online-users"></div>
                
                <button onclick="nukeRoom()" style="background:none; border:none; font-size:18px; cursor:pointer;" title="Limpar Sala">☢️</button>
                <button onclick="toggleDark()" style="background:none; border:none; font-size:18px; cursor:pointer;">🌓</button>
                <button onclick="share()" style="background:#000; color:#fff; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:11px;">LINK</button>
            </div>
        </header>
        <main id="board" class="board-container"></main>
        <div class="side-panel">
            <div style="padding:10px; background:#333; font-size:11px; font-weight:bold;">HISTÓRICO</div>
            <div id="log-content" style="flex:1; overflow-y:auto; padding:15px; font-family:monospace; font-size:11px;"></div>
        </div>`;
}

async function initData() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM).maybeSingle();
    
    if (!data) {
        state = [{id:"todo", title:"Para fazer", cards:[]},{id:"doing", title:"Em curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        await _supabase.from('kanban_data').insert([{ room_name: ROOM, state: state, logs: [] }]);
    } else {
        state = data.state;
        logs = data.logs || [];
    }
    
    renderBoard(); renderLogs();

    // CANAL REALTIME + PRESENCE
    const channel = _supabase.channel(`room_${ROOM}`, {
        config: { presence: { key: user.name } }
    });

    channel
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM}` }, 
        (p) => {
            state = p.new.state; logs = p.new.logs || [];
            renderBoard(); renderLogs();
        })
        .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            renderOnlineUsers(newState);
        })
        .subscribe(async (status) => {
            if(status === 'SUBSCRIBED') {
                document.getElementById('online-status').classList.add('live');
                // "Anuncia" minha entrada na sala
                await channel.track({
                    online_at: new Date().toISOString(),
                    avatar: user.avatar,
                    name: user.name
                });
            }
        });
}

function renderOnlineUsers(presenceState) {
    const list = document.getElementById('online-list');
    if (!list) return;

    // Extrai os dados únicos de cada usuário online
    const users = [];
    Object.values(presenceState).forEach(presenceArray => {
        presenceArray.forEach(p => {
            if(!users.find(u => u.name === p.name)) users.push(p);
        });
    });

    list.innerHTML = users.map(u => `
        <img src="${u.avatar}" class="online-user-dot" title="${u.name} está online" onerror="this.src='https://github.com/identicons/ghost.png'">
    `).join('');
}

function renderBoard() {
    const b = document.getElementById('board');
    if (!b) return;
    b.innerHTML = state.map(col => `
        <div class="column" ondragover="allowDrop(event)" ondrop="drop(event, '${col.id}')">
            <div class="column-header">${col.title} (${col.cards.length})</div>
            <div class="card-list">
                ${col.cards.map(c => `
                    <div class="card ${c.prio}" id="${c.id}" draggable="true" ondragstart="drag(event)" ondblclick="delCard('${c.id}')">
                        <div class="prio-indicator">${c.prio === "prio-alta" ? "📌" : (c.prio === "prio-baixa" ? "🍃" : "⚡")}</div>
                        <div style="font-weight:bold; flex:1; font-size:14px; margin-top:5px;">${c.content}</div>
                        ${c.img ? `<img src="${c.img}" class="task-img">` : ''}
                        <div style="font-size:9px; color:#666; margin-top:10px; cursor:pointer; text-align:right;" onclick="addImg('${c.id}')">🖼️ IMAGEM</div>
                        <div class="card-footer" onclick="assign('${c.id}')" style="cursor:pointer;">
                            <img src="${c.ownerAvatar || 'https://github.com/identicons/ghost.png'}">
                            <span>@${c.owner || 'atribuir'}</span>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ NOVO POST-IT</button>
        </div>`).join('');
}

// ... (Restante das funções: nukeRoom, save, drag, allowDrop, drop, addCard, addImg, delCard, toggleDark, renderLogs, share, manageProfile permanecem iguais)
async function nukeRoom() { if(confirm("☢️ Resetar sala?")) { state.forEach(col => col.cards = []); await save("SALA RESETADA POR " + user.name.toUpperCase()); renderBoard(); } }
async function save(msg) { if(msg) logs.unshift({ msg, time: new Date().toLocaleTimeString() }); await _supabase.from('kanban_data').update({ state, logs: logs.slice(0,20) }).eq('room_name', ROOM); }
function drag(ev) { ev.dataTransfer.setData("cardId", ev.target.id); }
function allowDrop(ev) { ev.preventDefault(); }
async function drop(ev, destColId) { ev.preventDefault(); const cardId = ev.dataTransfer.getData("cardId"); let cardData = null; state.forEach(col => { const idx = col.cards.findIndex(c => c.id === cardId); if (idx > -1) cardData = col.cards.splice(idx, 1)[0]; }); if (cardData) { state.find(col => col.id === destColId).cards.push(cardData); renderBoard(); await save(`@${user.name} moveu card`); } }
async function addCard(cid) { const t = prompt("Tarefa:"); if(!t) return; const p = prompt("1-Alta, 2-Média, 3-Baixa", "2"); const prioClass = p==="1"?"prio-alta":(p==="3"?"prio-baixa":"prio-media"); state.find(x => x.id === cid).cards.push({ id: crypto.randomUUID(), content: t, prio: prioClass, owner: user.name, ownerAvatar: user.avatar }); renderBoard(); await save(`@${user.name} criou tarefa`); }
async function addImg(id) { const u = prompt("URL Imagem:"); if(!u) return; state.forEach(col => { const c = col.cards.find(x => x.id === id); if(c) c.img = u; }); renderBoard(); await save(`Imagem anexada`); }
async function delCard(id) { if(confirm("Apagar?")) { state.forEach(col => col.cards = col.cards.filter(x => x.id !== id)); renderBoard(); await save(`Removido`); } }
function toggleDark() { document.body.classList.toggle('dark-mode'); }
function renderLogs() { document.getElementById('log-content').innerHTML = logs.map(l => `<div style="margin-bottom:8px; border-left:2px solid #0f0; padding-left:8px;">[${l.time}] ${l.msg}</div>`).join(''); }
function share() { navigator.clipboard.writeText(window.location.href); alert("Copiado!"); }
function manageProfile() { const mode = prompt("1-GitHub, 2-Manual, 3-Reset", "2"); if(mode === "1") { const n = prompt("GitHub User:"); if(n) { localStorage.removeItem('kanban_custom_name'); localStorage.setItem('kanban_user', n); location.reload(); } } else if(mode === "2") { const n = prompt("Seu Nome:"); const a = prompt("URL Foto:"); if(n && a) { localStorage.setItem('kanban_custom_name', n); localStorage.setItem('kanban_custom_avatar', a); location.reload(); } } else if(mode === "3") { localStorage.clear(); location.reload(); } }
async function assign(id) { const n = prompt("User GitHub:"); if(!n) return; state.forEach(col => { const c = col.cards.find(x => x.id === id); if(c) { c.owner = n; c.ownerAvatar = `https://github.com/${n}.png`; } }); renderBoard(); await save(`Tarefa delegada para @${n}`); }

start();
