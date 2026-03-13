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
    const container = document.getElementById('app-container');
    if (!container) return;

    if (!ROOM_NAME) {
        renderLanding();
    } else {
        await fetchUserProfile(GITHUB_USER);
        renderMuralSkeleton();
        initRoom();
    }
}

function renderLanding() {
    const container = document.getElementById('app-container');
    container.innerHTML = `
        <div class="landing-page">
            <h1>Post-it Board /</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" autofocus>
            <p>Salas instantâneas com senha.</p>
        </div>`;
    
    const input = document.getElementById('room-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.value) {
            window.location.href = `?sala=${e.target.value.trim()}`;
        }
    });
}

function renderMuralSkeleton() {
    document.getElementById('app-container').innerHTML = `
        <header>
            <div class="header-left">
                <div class="user-profile" onclick="changeUser()"><img src="${currentUser.avatar}"> <span>${currentUser.login}</span></div>
                <div class="room-info" onclick="window.location.href='index.html'">Mural: <strong>${ROOM_NAME}</strong></div>
                <input type="text" id="board-search" placeholder="Buscar..." oninput="renderBoard()">
            </div>
            <div class="actions">
                <button onclick="shareBoard()">Compartilhar</button>
            </div>
        </header>
        <main id="kanban-board" class="board-container"></main>
        <div class="side-panel">
            <div class="panel-header">Status <span id="stats-content">0%</span></div>
            <div class="panel-header">Histórico <button onclick="clearLogs()">🗑️</button></div>
            <div id="log-content"></div>
        </div>`;
}

async function initRoom() {
    let { data } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();

    if (!data) {
        const pass = prompt(`Mural "${ROOM_NAME}" é novo. Criar senha? (Vazio = público)`);
        const initialState = [{id:"todo", title:"Para fazer", cards:[]},{id:"doing", title:"Em curso", cards:[]},{id:"done", title:"Concluído", cards:[]}];
        const { data: newData } = await _supabase.from('kanban_data').insert([{ room_name: ROOM_NAME, state: initialState, logs: [], room_password: pass || null }]).select().single();
        data = newData;
        if(pass) sessionStorage.setItem(`auth_${ROOM_NAME}`, pass);
    }

    if (data.room_password) {
        let auth = sessionStorage.getItem(`auth_${ROOM_NAME}`);
        if (auth !== data.room_password) {
            const p = prompt("Senha da sala:");
            if (p === data.room_password) {
                sessionStorage.setItem(`auth_${ROOM_NAME}`, p);
            } else {
                alert("Senha errada!"); 
                window.location.href = "index.html"; 
                return;
            }
        }
    }

    boardState = data.state;
    activityLogs = data.logs || [];
    renderBoard();
    renderLogs();
    
    _supabase.channel(`room-${ROOM_NAME}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` }, 
    payload => {
        boardState = payload.new.state;
        activityLogs = payload.new.logs || [];
        renderBoard();
        renderLogs();
    }).subscribe();
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

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    if (activityLogs.length > 20) activityLogs.pop();
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('room_name', ROOM_NAME);
}

// Funções auxilia
