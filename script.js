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
