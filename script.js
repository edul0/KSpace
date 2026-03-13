// === CONFIGURAÇÃO SUPABASE ===
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// === VARIÁVEIS GLOBAIS (DEFINIDAS NO TOPO PARA NÃO DAR ERRO) ===
const urlParams = new URLSearchParams(window.location.search);
let ROOM_NAME = urlParams.get('sala'); // Captura a sala da URL
let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUser = { login: GITHUB_USER, avatar: `https://github.com/${GITHUB_USER}.png`, name: GITHUB_USER };
let boardState = [];
let activityLogs = [];
let filterOnlyMe = false;

// === INICIALIZAÇÃO ===
async function startApp() {
    if (!ROOM_NAME) {
        // Se não tem sala na URL, mostra a Landing Page estilo Dontpad
        renderLandingPage();
    } else {
        // Se tem sala, carrega o perfil e inicia o mural
        await fetchUserProfile(GITHUB_USER);
        initRoom();
    }
}

function renderLandingPage() {
    // Substitui o corpo do HTML pela tela inicial
    document.body.innerHTML = `
        <div class="landing-container" style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; font-family:monospace;">
            <h1 style="font-size: 3rem; margin: 0; letter-spacing: -2px;">Post-it Board /</h1>
            <input type="text" id="room-input" placeholder="nome-da-sala" 
                style="font-size:2.5rem; border:none; border-bottom:3px solid #000; outline:none; text-align:center; width:80%; max-width:600px; padding:10px;">
            <p style="margin-top:20px; color:#888;">Crie ou acesse murais instantâneos. Como o Dontpad.</p>
        </div>
    `;
    
    const input = document.getElementById('room-input');
    input.focus();
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value) {
            window.location.href = `?sala=${input.value.trim()}`;
        }
    });
}

async function initRoom() {
    // 1. Busca a sala no Supabase
    let { data, error } = await _supabase.from('kanban_data').select('*').eq('room_name', ROOM_NAME).maybeSingle();

    // 2. Se a sala não existir, cria uma nova no banco
    if (!data) {
        const pass = prompt(`Mural "${ROOM_NAME}" é novo. Deseja uma senha? (Deixe em branco para público)`);
        const initialState = [
            {id:"todo", title:"Para fazer", cards:[]},
            {id:"doing", title:"Em curso", cards:[]},
            {id:"done", title:"Concluído", cards:[]}
        ];
        
        const { data: newData, error: insError } = await _supabase
            .from('kanban_data')
            .insert([{ 
                room_name: ROOM_NAME, 
                state: initialState, 
                logs: [], 
                room_password: pass || null 
            }])
            .select().single();
            
        data = newData;
    }

    // 3. Verifica Senha se a sala for privada
    if (data && data.room_password) {
        let auth = sessionStorage.getItem(`auth_${ROOM_NAME}`);
        if (auth !== data.room_password) {
            const p = prompt("Esta sala é privada. Senha:");
            if (p === data.room_password) {
                sessionStorage.setItem(`auth_${ROOM_NAME}`, p);
            } else {
                alert("Senha incorreta!"); window.location.href = "index.html"; return;
            }
        }
    }

    // 4. Se chegamos aqui, renderiza o mural
    if (data) {
        boardState = data.state;
        activityLogs = data.logs || [];
        const display = document.getElementById('room-display');
        if(display) display.innerText = ROOM_NAME;
        renderBoard();
        renderLogs();
        updateStats();
        
        // Ativa Realtime para esta sala
        _supabase.channel(`room-${ROOM_NAME}`).on('postgres_changes', { 
            event: 'UPDATE', schema: 'public', table: 'kanban_data', filter: `room_name=eq.${ROOM_NAME}` 
        }, payload => {
            boardState = payload.new.state;
            activityLogs = payload.new.logs || [];
            renderBoard(); renderLogs(); updateStats();
        }).subscribe();
    }
}

// === FUNÇÕES DE RENDERIZAÇÃO E AÇÕES ===
function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const search = document.getElementById('board-search').value.toLowerCase();
    
    board.innerHTML = boardState.map(col => {
        let cards = col.cards.filter(c => c.content.toLowerCase().includes(search));
        if (filterOnlyMe) cards = cards.filter(c => c.owner === currentUser.login);
        
        return `
        <div class="column">
            <div class="column-header">${col.title}</div>
            <div class="card-list" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${cards.map(card => `
                    <div class="card ${card.owner === currentUser.login ? 'is-mine' : ''}" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <div class="card-content">${card.content}</div>
                        <div class="card-footer">
                            <span>@${card.owner}</span>
                            <img src="${card.ownerAvatar}" style="width:16px; height:16px; border-radius:50%;">
                        </div>
                    </div>`).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Post-it</button>
        </div>`;
    }).join('');
}

async function addCard(colId) {
    const txt = prompt("Texto do Post-it:"); if (!txt) return;
    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(), content: txt, createdAt: new Date().toLocaleDateString(),
        owner: currentUser.login, ownerAvatar: currentUser.avatar
    });
    renderBoard(); await save(`@${currentUser.login} criou card`);
}

async function save(logMsg) {
    if (logMsg) activityLogs.unshift({ msg: logMsg, time: new Date().toLocaleTimeString() });
    await _supabase.from('kanban_data').update({ state: boardState, logs: activityLogs }).eq('room_name', ROOM_NAME);
}

async function fetchUserProfile(u) {
    try {
        const r = await fetch(`https://api.github.com/users/${u}`);
        const d = await r.json();
        currentUser = { login: d.login, avatar: d.avatar_url, name: d.name || d.login };
    } catch(e) {}
}

function renderLogs() { const lc = document.getElementById('log-content'); if(lc) lc.innerHTML = activityLogs.map(l => `<div>${l.msg}</div>`).join(''); }
function updateStats() { /* Lógica de stats aqui */ }
function drag(e) { e.dataTransfer.setData("text", e.target.id); }
function drop(e, colId) { /* Lógica de drop aqui */ }

// INICIAR TUDO
document.addEventListener('DOMContentLoaded', startApp);
