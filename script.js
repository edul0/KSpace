const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUserData = { login: GITHUB_USER, avatar: '' };
let boardState = [];

// === INICIALIZAÇÃO ===
async function initRealtime() {
    const { data } = await _supabase.from('kanban_data').select('state').eq('id', 1);
    if (data?.length > 0) updateBoardState(data[0].state);

    _supabase.channel('kanban-realtime').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, 
    payload => updateBoardState(payload.new.state)).subscribe();
}

function updateBoardState(newState) {
    boardState = typeof newState === 'string' ? JSON.parse(newState) : newState;
    renderBoard();
}

async function save() {
    await _supabase.from('kanban_data').update({ state: boardState }).eq('id', 1);
}

// === USUÁRIO ===
async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        const data = await res.json();
        currentUserData = { login: data.login, avatar: data.avatar_url, name: data.name || data.login };
        document.getElementById('user-profile').innerHTML = `<img src="${data.avatar_url}"> <span>${currentUserData.name}</span>`;
    } catch(e) {
        document.getElementById('user-profile').innerHTML = `<span>Modo Offline</span>`;
    }
}

function changeUser() {
    const u = prompt("User GitHub:");
    if(u) { localStorage.setItem('kanban_user', u); location.reload(); }
}

// === KANBAN LÓGICA ===
async function addCard(colId) {
    const content = prompt("Tarefa:");
    if (!content) return;
    const p = prompt("Prioridade (1-Alta, 2-Média, 3-Baixa):");
    const prios = {"1": {label:"Alta", class:"prio-alta"}, "2":{label:"Média", class:"prio-media"}, "3":{label:"Baixa", class:"prio-baixa"}};
    
    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(),
        content: content,
        priority: prios[p] || prios["3"],
        creator: currentUserData.login,
        owner: currentUserData.login, // Quem cria é o dono inicial
        ownerAvatar: currentUserData.avatar
    });
    renderBoard(); await save();
}

async function takeTask(cardId) {
    if(confirm("Deseja assumir esta tarefa?")) {
        boardState.forEach(col => {
            const card = col.cards.find(c => c.id === cardId);
            if(card) {
                card.owner = currentUserData.login;
                card.ownerAvatar = currentUserData.avatar;
            }
        });
        renderBoard(); await save();
    }
}

async function deleteCard(cardId) {
    if(confirm("Excluir?")) {
        boardState.forEach(col => col.cards = col.cards.filter(c => c.id !== cardId));
        renderBoard(); await save();
    }
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    const searchTerm = document.getElementById('board-search').value.toLowerCase();
    
    board.innerHTML = boardState.map(col => {
        const filteredCards = col.cards.filter(card => 
            card.content.toLowerCase().includes(searchTerm) || 
            card.priority.label.toLowerCase().includes(searchTerm) ||
            card.owner.toLowerCase().includes(searchTerm)
        );

        return `
        <div class="column">
            <div class="column-header">${col.title} (${filteredCards.length})</div>
            <div class="card-list" id="${col.id}" ondragover="event.preventDefault()" ondrop="drop(event, '${col.id}')">
                ${filteredCards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="drag(event)" ondblclick="deleteCard('${card.id}')">
                        <span class="priority-tag ${card.priority.class}">${card.priority.label}</span>
                        <div class="card-content">${card.content}</div>
                        <div class="card-footer">
                            <span onclick="takeTask('${card.id}')" style="cursor:pointer">👤 @${card.owner}</span>
                            <div class="owner-info">
                                <img src="${card.ownerAvatar}" title="Responsável: ${card.owner}">
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Novo Card</button>
        </div>`;
    }).join('');
}

// Drag & Drop Simplificado
function drag(e) { e.dataTransfer.setData("text", e.target.id); }
async function drop(e, colId) {
    const id = e.dataTransfer.getData("text");
    let card;
    boardState.forEach(c => {
        const i = c.cards.findIndex(x => x.id === id);
        if(i > -1) card = c.cards.splice(i, 1)[0];
    });
    boardState.find(c => c.id === colId).cards.push(card);
    renderBoard(); await save();
}

function shareBoard() { navigator.clipboard.writeText(window.location.href); alert("Link copiado!"); }

document.addEventListener('DOMContentLoaded', () => { fetchUserProfile(GITHUB_USER); initRealtime(); });
