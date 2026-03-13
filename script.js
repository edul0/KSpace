const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala');
let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: `https://github.com/${GITHUB_USER}.png` };
let boardState = [];
let activityLogs = [];

async function startApp() {
    if (!ROOM_NAME) { 
        renderLanding(); 
    } else {
        await fetchUserProfile(GITHUB_USER);
        renderMuralSkeleton();
        initRoom();
    }
}

function renderLanding() {
    document.getElementById('app-container').innerHTML = `
        <div class="landing-page">
            <h1>KanbanSpace</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" autofocus>
            <p>Crie ou acesse murais instantâneos compartilháveis.</p>
        </div>`;
    const input = document.getElementById('room-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.value) window.location.href = `?sala=${e.target.value.trim()}`;
    });
}

function renderMuralSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <div class="user-profile" onclick="changeUser()"><img src="${currentUser.avatar}"> <span>${currentUser.login}</span></div>
                <div class="room-info" onclick="window.location.href='index.html'">Mural: <strong>${ROOM_NAME}</strong></div>
                <input type="text" id="board-search" placeholder="Buscar..." oninput="renderBoard()" style="padding:5px 10px; border-radius:15px; border:1px solid #ccc; outline:none; margin-left:10px;">
            </div>
            <div class="actions">
                <button onclick="shareBoard()" style="padding:8px 15px; background:#000; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Compartilhar Link</button>
            </div>
        </header>
        <main id="kanban-board" class="board-container"></main>
        <div class="side-panel">
            <div class="panel-header">Status <span id="stats-content">0%</span></div>
            <div class="panel-header">Histórico <button onclick="clearLogs()" style="border:none; background:transparent; cursor:pointer;">🗑️</button></div>
            <div id="log-content"></div>
        </div>`;
}

async function initRoom() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();
    if (!data) {
        const initialState = [{id:"todo", title:"Para fazer", cards:[]},{id:"doing", title:"Em curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        const { data: newData } = await _supabase.from('kanban_data').insert([{ room_name: ROOM_NAME, state: initialState, logs: [] }]).select().single();
        data = newData;
    }
    boardState = data.state;
    activityLogs = data.logs || [];
    renderBoard(); renderLogs();
    
    _supabase.channel(`room-${ROOM_NAME}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` }, 
    payload => { boardState = payload.new.state; activityLogs = payload.new.logs || []; renderBoard(); renderLogs(); }).subscribe();
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const search = document.getElementById('board-search').value.toLowerCase();
    
    board.innerHTML = boardState.map(col => `
        <div class="column">
            <div class="column-header">${col.title} (${col.cards.length})</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${col.cards.filter(c => c.content.toLowerCase().includes(search)).map(card => `
                    <div class="card ${card.priorityClass || 'prio-media'}" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <div class="card-content">${card.content}</div>
                        ${card.imageUrl ? `<img src="${card.imageUrl}" class="attached-image">` : ''}
                        <div style="font-size:9px; color:#999; margin-top:10px; cursor:pointer;" onclick="attachImage('${card.id}')">🖼️ Anexar Imagem</div>
                        <div class="card-footer">
                            <div class="owner-info" onclick="assignTask('${card.id}')">
                                <img src="${card.ownerAvatar || 'https://github.com/identicons/ghost.png'}">
                                <span>@${card.owner || currentUser.login}</span>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Post-it</button>
        </div>`).join('');
}

async function addCard(colId) {
    const txt = prompt("Texto:"); if (!txt) return;
    const p = prompt("Prioridade: 1-Alta, 2-Média, 3-Baixa", "2");
    const prio = p === "1" ? "prio-alta" : (p === "3" ? "prio-baixa" : "prio-media");
    boardState.find(c => c.id === colId).cards.push({ id: crypto.randomUUID(), content: txt, owner: currentUser.login, ownerAvatar: currentUser.avatar, priorityClass: prio, imageUrl: null });
    renderBoard(); await save(`@${currentUser.login} criou card`);
}

async function attachImage(cardId) {
    const url = prompt("Cole a URL da imagem:"); if (!url) return;
    boardState.forEach(col => { const c = col.cards.find(x => x.id === cardId); if (c) c.imageUrl = url; });
    renderBoard(); await save(`@${currentUser.login} anexou imagem`);
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    if (activityLogs.length > 25) activityLogs.pop();
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('room_name', ROOM_NAME);
}

function renderLogs() {
    const lc = document.getElementById('log-content');
    if(lc) lc.innerHTML = activityLogs.map(l => `<div style="margin-bottom:5px; border-bottom:1px dashed #eee;">[${l.time}] ${l.msg}</div>`).join('');
    const ok = boardState.find(c => c.id === 'done')?.cards.length || 0;
    const tot = boardState.reduce((a, c) => a + c.cards.length, 0);
    const st = document.getElementById('stats-content');
    if(st) st.innerText = `${tot > 0 ? Math.round((ok/tot)*100) : 0}%`;
}

function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }
async function fetchUserProfile(u) { try { const r = await fetch(`https://api.github.com/users/${u}`); const d = await r.json(); if(d.login) currentUser = { login: d.login, avatar: d.avatar_url }; } catch(e) {} }
function changeUser() { const u = prompt("GitHub User:"); if(u) { localStorage.setItem('kanban_user', u); location.reload(); } }
async function deleteCard(id) { if(confirm("Deletar?")) { boardState.forEach(c => c.cards = c.cards.filter(x => x.id !== id)); renderBoard(); await save(`Removido`); } }
function drag(e) { e.dataTransfer.setData("text", e.target.id); }
async function drop(e, colId) {
    const id = e.dataTransfer.getData("text"); let card;
    boardState.forEach(c => { const i = c.cards.findIndex(x => x.id === id); if(i > -1) card = c.cards.splice(i, 1)[0]; });
    if(card) { boardState.find(c => c.id === colId).cards.push(card); renderBoard(); await save(`Movido`); }
}
async function assignTask(cardId) { const target = prompt("Delegar para:"); if(!target) return; const nick = target.toLowerCase() === 'eu' ? currentUser.login : target.replace('@', ''); boardState.forEach(col => { const c = col.cards.find(x => x.id === cardId); if (c) { c.owner = nick; c.ownerAvatar = `https://github.com/${nick}.png`; } }); renderBoard(); await save(`Delegado para @${nick}`); }

document.addEventListener('DOMContentLoaded', startApp);
