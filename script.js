// === CONFIGURAÇÕES ===
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YW5zcXV4anZiYWx6eG5mZ2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTIzNTYsImV4cCI6MjA4ODk2ODM1Nn0.C8FaFGWv0VyOew47NfYXfAl-ksx9TFlI6mkPWcV9diM'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUserAvatar = '';
let boardState = [
    { id: "todo", title: "Para fazer", cards: [] },
    { id: "doing", title: "Em curso", cards: [] },
    { id: "done", title: "Concluído", cards: [] }
];

// === SINCRONIZAÇÃO ===
async function initRealtime() {
    const { data, error } = await _supabase
        .from('kanban_data')
        .select('state')
        .eq('id', 1);

    if (data && data.length > 0) {
        updateBoardState(data[0].state);
    }

    _supabase
        .channel('kanban-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, payload => {
            if (payload.new && payload.new.state) {
                updateBoardState(payload.new.state);
            }
        })
        .subscribe();
}

function updateBoardState(newState) {
    try {
        const parsed = typeof newState === 'string' ? JSON.parse(newState) : newState;
        if (Array.isArray(parsed)) {
            boardState = parsed;
            renderBoard();
        }
    } catch (e) { console.error("Erro no Parse:", e); }
}

async function save() {
    await _supabase.from('kanban_data').update({ state: boardState }).eq('id', 1);
}

// === USUÁRIO ===
async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        currentUserAvatar = data.avatar_url;
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}">
            <span>${data.name || data.login} | Workspace</span>
        `;
    } catch(e) {
        currentUserAvatar = 'https://cdn-icons-png.flaticon.com/512/25/25231.png';
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" style="opacity:0.5">
            <span>Eduardo (Modo Local)</span>
        `;
    }
}

function changeUser() {
    const user = prompt("GitHub username:");
    if (user) { localStorage.setItem('kanban_user', user); location.reload(); }
}

function shareBoard() {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copiado!");
}

// === LÓGICA DO QUADRO ===
function handleDragStart(e) { e.dataTransfer.setData("text", e.target.id); }
function handleDragOver(e) { e.preventDefault(); }

async function handleDrop(e) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text");
    const targetCol = e.target.closest('.card-list');
    if (targetCol) moveCard(cardId, targetCol.id);
}

async function moveCard(cardId, targetColId) {
    let card;
    boardState.forEach(col => {
        const idx = col.cards.findIndex(c => c.id === cardId);
        if (idx !== -1) card = col.cards.splice(idx, 1)[0];
    });
    const dest = boardState.find(c => c.id === targetColId);
    if (dest && card) {
        dest.cards.push(card);
        renderBoard();
        await save();
    }
}

async function addCard(colId) {
    const content = prompt("Tarefa:");
    if (!content) return;

    const prioInput = prompt("Prioridade:\n1 - Alta\n2 - Média\n3 - Baixa");
    const priorities = {
        "1": { label: "Alta", class: "prio-alta" },
        "2": { label: "Média", class: "prio-media" },
        "3": { label: "Baixa", class: "prio-baixa" }
    };
    const selectedPrio = priorities[prioInput] || priorities["3"];

    boardState.find(c => c.id === colId).cards.push({
        id: crypto.randomUUID(),
        content: content,
        priority: selectedPrio,
        authorAvatar: currentUserAvatar
    });
    renderBoard();
    await save();
}

async function deleteCard(cardId) {
    if (confirm("Excluir?")) {
        boardState.forEach(col => {
            col.cards = col.cards.filter(c => c.id !== cardId);
        });
        renderBoard();
        await save();
    }
}

function renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = boardState.map(col => `
        <div class="column">
            <div class="column-header">
                <div style="font-size: 11px; opacity: 0.6; margin-bottom:5px">${col.title.toUpperCase()}</div>
                <div style="font-size: 24px; font-weight:bold">${col.cards.length}</div>
            </div>
            <div class="card-list" id="${col.id}" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
                ${col.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" ondragstart="handleDragStart(event)" ondblclick="deleteCard('${card.id}')">
                        <span class="priority-tag ${card.priority?.class || 'prio-baixa'}">${card.priority?.label || 'BAIXA'}</span>
                        <div style="font-size: 14px; margin-bottom: 10px; font-weight: 500;">${card.content}</div>
                        <div class="card-footer"><img src="${card.authorAvatar}" class="card-avatar"></div>
                    </div>
                `).join('')}
            </div>
            <button class="add-btn" onclick="addCard('${col.id}')">+ Adicionar tarefa</button>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(GITHUB_USER);
    initRealtime();
});
