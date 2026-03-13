// === PASSO 1: DADOS ===
const generateId = () => crypto.randomUUID();

let boardState = [
    {
        id: "todo",
        title: "A Fazer",
        cards: [
            { id: generateId(), content: "Configurar o projeto" },
            { id: generateId(), content: "Estudar Drag and Drop" }
        ]
    },
    { id: "doing", title: "Em Andamento", cards: [] },
    { id: "done", title: "Concluído", cards: [] }
];

// === PASSO 2: LÓGICA DE EXIBIÇÃO ===
function renderBoard() {
    const boardElement = document.getElementById('kanban-board');
    
    boardElement.innerHTML = boardState.map(column => `
        <div class="column">
            <h3>${column.title}</h3>
            <div class="card-list" id="${column.id}">
                ${column.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true">
                        ${card.content}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Inicializa a tela
window.onload = renderBoard;
function renderBoard() {
    console.log("Executando renderBoard..."); // Verifique se isso aparece no F12
    const boardElement = document.getElementById('kanban-board');
    
    if (!boardElement) {
        console.error("ERRO: Elemento kanban-board não encontrado!");
        return;
    }

    boardElement.innerHTML = boardState.map(column => `
        <div class="column" style="background: #ebedf0; border-radius: 8px; margin: 10px; padding: 15px; width: 250px; min-height: 400px; float: left; font-family: sans-serif;">
            <h3 style="margin-top: 0;">${column.title}</h3>
            <div class="card-list" id="${column.id}" style="min-height: 20px;">
                ${column.cards.map(card => `
                    <div class="card" id="${card.id}" draggable="true" style="background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 8px; padding: 10px; cursor: grab;">
                        ${card.content}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Chame a função diretamente aqui também para garantir
renderBoard();
