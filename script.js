// CONFIGURAÇÕES DO SUPABASE
const SUPABASE_URL = 'https://tuansquxjvbalzxnfglz.supabase.co';
const SUPABASE_KEY = 'SUA_ANON_KEY_AQUI'; // Pegue aquela chave eyJ...
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const GITHUB_USER = localStorage.getItem('kanban_user') || 'edul0';
let currentUserAvatar = '';
let boardState = [];

// === 1. SINCRONIZAÇÃO EM TEMPO REAL ===
async function initRealtime() {
    console.log("Conectando ao banco de dados...");
    
    // Busca inicial (Lê a linha 1 que você criou)
    const { data, error } = await _supabase
        .from('kanban_data')
        .select('state')
        .eq('id', 1);

    if (error) {
        console.error("Erro ao carregar dados:", error.message);
        return;
    }

    if (data && data.length > 0) {
        // Se o banco devolveu texto, transforma em objeto. Se já for objeto, usa direto.
        const rawState = data[0].state;
        boardState = typeof rawState === 'string' ? JSON.parse(rawState) : rawState;
        renderBoard();
        console.log("Dados sincronizados com sucesso!");
    }

    // Escuta mudanças (Realtime)
    _supabase
        .channel('custom-filter-channel')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kanban_data' }, payload => {
            console.log("Nova atualização detectada em tempo real!");
            const newState = payload.new.state;
            boardState = typeof newState === 'string' ? JSON.parse(newState) : newState;
            renderBoard();
        })
        .subscribe();
}

async function save() {
    // Envia o estado atual para o banco de dados
    const { error } = await _supabase
        .from('kanban_data')
        .update({ state: boardState })
        .eq('id', 1);
    
    if (error) console.error("Erro ao salvar:", error.message);
}

// === 2. GESTÃO DE PERFIL ===
async function fetchUserProfile(username) {
    try {
        const res = await fetch(`https://api.github.com/users/${username}`);
        const data = await res.json();
        currentUserAvatar = data.avatar_url || 'https://via.placeholder.com/32';
        document.getElementById('user-profile').innerHTML = `
            <img src="${currentUserAvatar}" style="width:32px;border-radius:50%">
            <span>${data.name || data.login} | Workspace</span>
        `;
    } catch(e) {
        console.warn("Usando perfil genérico.");
        currentUserAvatar = 'https://via.placeholder.com/32';
    }
}

function changeUser() {
    const user = prompt("Digite seu @ do GitHub:");
    if (user) {
        localStorage.setItem('kanban_user', user);
        location.reload();
    }
}

// === 3. LÓGICA DO QUADRO ===
function handleDragStart(e) { e.dataTransfer.setData("text", e.target.id); }
function handleDragOver(e) { e.preventDefault(); }

function handleDrop(e) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text");
    const targetCol = e.target.closest('.card-list');
    if (targetCol) moveCard(cardId, targetCol.id);
}

function moveCard(cardId, targetColId) {
    let card;
    boardState.forEach(col => {
        const idx = col.cards.findIndex(c => c.id === cardId);
        if (idx !== -1) card = col.cards.splice(idx, 1)[0];
    });
    const dest = boardState.find(c => c.id === targetColId);
    if (dest && card) {
        dest.cards.
