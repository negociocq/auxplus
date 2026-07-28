<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    echo "Acesso não autorizado";
    exit();
}

$user_id = $_SESSION['user_id'];
$folder_id = $_POST['folder_id'] ?? null;
$search_query = $_POST['search'] ?? '';

// Query para obter o nome e o tipo da pasta
$folder_stmt = $pdo->prepare("SELECT type FROM folders WHERE id = ?");
$folder_stmt->execute([$folder_id]);
$folder = $folder_stmt->fetch();
$folder_type = $folder['type'] ?? "Tipo Desconhecido";

$settings_stmt = $pdo->prepare("SELECT * FROM settings WHERE user_id = ?");
$settings_stmt->execute([$user_id]);
$settings = $settings_stmt->fetch();
$near_due_days = $settings['near_due_days'] ?? 10;
$far_due_days = $settings['far_due_days'] ?? 20;

$items_stmt = $pdo->prepare("
    SELECT *, 
    created_at, -- Incluindo o campo created_at na seleção
    CASE
        WHEN due_date IS NULL THEN 'item-sem-vencimento'
        WHEN DATEDIFF(due_date, NOW()) > ? THEN 'item-longe'  
        WHEN DATEDIFF(due_date, NOW()) <= ? AND DATEDIFF(due_date, NOW()) >= 0 THEN 'item-perto'  
        ELSE 'item-vencido'  
    END AS status_class,
    CASE
        WHEN due_date IS NULL THEN 0
        WHEN DATEDIFF(due_date, NOW()) > ? THEN 1  
        WHEN DATEDIFF(due_date, NOW()) <= ? AND DATEDIFF(due_date, NOW()) >= 0 THEN 2  
        ELSE 3  
    END AS status_order
    FROM items 
    WHERE folder_id = ?
    AND (item_id LIKE ? OR name LIKE ?)
    ORDER BY status_order, due_date DESC
");

$items_stmt->execute([$far_due_days, $near_due_days, $far_due_days, $near_due_days, $folder_id, "%$search_query%", "%$search_query%"]);
$items = $items_stmt->fetchAll();

foreach ($items as $item):
    // Formata a data de vencimento
     $due_date_formatted = $item['due_date'] ? date('d/m/Y', strtotime($item['due_date'])) : 'Indefinido'; 
    
    // Formata a data de criação
    $created_at_formatted = date('d/m/Y', strtotime($item['created_at'])); // Formata a data de criação
    
    $price_formatted = number_format($item['price'], 2, ',', '.');
?>
<li class="<?php echo htmlspecialchars($item['status_class']); ?>">
    <div class="status-indicator <?php echo htmlspecialchars($item['status_class']); ?>"></div>
    <div style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
        <div>
            <strong>Usuário: <?php echo htmlspecialchars($item['item_id']); ?></strong><br>
            <strong><?php echo htmlspecialchars($item['name']); ?></strong><br>
            <span>Criado em: <?php echo htmlspecialchars($created_at_formatted); ?></span><br> <!-- Data de criação -->
            <span>Data de Vencimento: <?php echo htmlspecialchars($due_date_formatted); ?></span><br>
            <span>Telefone: <?php echo htmlspecialchars($item['phone']); ?></span><br>
            <span>Notas: <?php echo htmlspecialchars($item['notes']); ?></span><br>
            <strong>Preço: R$ <?php echo $price_formatted; ?></strong><br>
        </div>
        <div class="action-container" style="position: relative;">
            <button class="icon-button three-dots" onclick="toggleMenu(event, this)">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="action-menu" style="display:none;">
                    <button class="icon-button" 
        data-item-id="<?php echo htmlspecialchars($item['item_id']); ?>"
        data-name="<?php echo htmlspecialchars($item['name']); ?>"
        data-due-date="<?php echo htmlspecialchars($item['due_date']); ?>"
        data-phone="<?php echo htmlspecialchars($item['phone']); ?>"
        data-notes="<?php echo htmlspecialchars($item['notes']); ?>"
        data-price="<?php echo htmlspecialchars($item['price']); ?>"
        data-created-at="<?php echo htmlspecialchars(date('Y-m-d', strtotime($item['created_at']))); ?>"
        onclick="openEditModal(
            this.getAttribute('data-item-id'),
            this.getAttribute('data-name'),
            this.getAttribute('data-due-date'),
            this.getAttribute('data-phone'),
            this.getAttribute('data-notes'),
            this.getAttribute('data-price'),
            this.getAttribute('data-created-at') <!-- Passando a data de criação -->
        )">
                        <i class="fas fa-pencil-alt"></i> Editar
                    </button>
                    <button class="icon-button" 
                            data-item-id="<?php echo htmlspecialchars($item['item_id']); ?>" 
                            data-name="<?php echo htmlspecialchars($item['name']); ?>" 
                            data-due-date="<?php echo htmlspecialchars($item['due_date']); ?>" 
                            data-phone="<?php echo htmlspecialchars($item['phone']); ?>"  
                            data-folder-type="<?php echo htmlspecialchars($folder_type); ?>" 
                            onclick="sendReminder(
                                this.getAttribute('data-item-id'), 
                                this.getAttribute('data-name'), 
                                this.getAttribute('data-due-date'), 
                                this.getAttribute('data-phone'), 
                                this.getAttribute('data-folder-type')
                            )">
                        <i class="fas fa-bell"></i> Lembrar
                    </button>
                    <button class="icon-button" 
                            data-item-id="<?php echo htmlspecialchars($item['item_id']); ?>" 
                            onclick="showMoveModal('<?php echo htmlspecialchars($item['item_id']); ?>')">
                        <i class="fas fa-arrows-alt"></i> Mover
                    </button>
                    <form style="display:inline;" method="post" onsubmit="return confirm('Tem certeza que deseja excluir este item?');">
                        <input type="hidden" name="folder_id" value="<?php echo htmlspecialchars($folder_id); ?>">
                        <input type="hidden" name="item_id" value="<?php echo htmlspecialchars($item['item_id']); ?>">
                        <button type="submit" name="delete_item" class="icon-button delete-button1">
                            <i class="fas fa-times"></i> Excluir
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </li>
<?php endforeach; ?>
    
<!-- Modal para Mover Item -->
<div id="move-modal" class="modal" style="display:none;">
    <div class="modal-content">
        <span class="close" id="close-move-modal">×</span>
        <h2>Escolha uma Pasta para Mover o Item</h2>
        <ul id="folder-list">
            <?php
            // Recuperar todas as pastas do usuário
            $folders_stmt = $pdo->prepare("SELECT id, name FROM folders WHERE user_id = ?");
            $folders_stmt->execute([$user_id]);
            $folders = $folders_stmt->fetchAll();

            foreach ($folders as $folder) {
                echo "<li><a href='#' class='move-folder' data-folder-id='" . htmlspecialchars($folder['id']) . "'>" . htmlspecialchars($folder['name']) . "</a></li>";
            }
            ?>
        </ul>
        <button onclick="closeModal()" class="cancel-button">Cancelar</button>
    </div>
</div>

<!-- JavaScript para controlar a exibição do menu -->
<script>
function toggleMenu(event, button) {
    event.stopPropagation(); // Previne o clique de propagar para o documento
    const menu = button.nextElementSibling;
    const isMenuVisible = menu.style.display === 'block';
    const allMenus = document.querySelectorAll('.action-menu');

    // Fecha todos os menus antes de abrir o atual
    allMenus.forEach(m => m.style.display = 'none');

    // Mover os três pontinhos para cima
    if (!isMenuVisible) {
        menu.style.display = 'block';
        button.style.transform = 'translateY(-20px)'; // Mover o botão
    } else {
        button.style.transform = 'translateY(0)';
    }
}

// Fecha o menu ao clicar fora dele
document.addEventListener('click', function() {
    const menus = document.querySelectorAll('.action-menu');
    menus.forEach(menu => {
        menu.style.display = 'none'; // Fecha todos os menus
    });

    // Restaura a posição dos botões de três pontinhos
    const dotsButtons = document.querySelectorAll('.three-dots');
    dotsButtons.forEach(button => {
        button.style.transform = 'translateY(0)'; // Restaura a posição original
    });
});

// Função para fechar o modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Evento para fechar o modal ao clicar no "X"
document.querySelectorAll('.close-modal').forEach(item => {
    item.onclick = function() {
        closeModal(this.dataset.modal); // Usa o data-attribute para fechar o modal correto
    };
});

// Evento para fechar o modal quando clicar fora da janela
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal'); // Seleciona todos os modais
    modals.forEach(modal => {
        if (event.target === modal) { // Verifica se o clique foi no fundo do modal
            closeModal(modal.id);
        }
    });
}

// Função para abrir o modal para mover item
let currentItemId;
function showMoveModal(itemId) {
    currentItemId = itemId; // Armazena o ID do item a ser movido
    document.getElementById('move-modal').style.display = 'block';
}

// Adiciona evento aos links de mover pasta
document.querySelectorAll('.move-folder').forEach(folder => {
    folder.addEventListener('click', function(event) {
        event.preventDefault(); // Evita o comportamento padrão do link
        const newFolderId = this.getAttribute('data-folder-id');

        // Criar e enviar um formulário para mover o item
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = ''; // Envia para a mesma página
        form.innerHTML = `<input type='hidden' name='item_id' value='${currentItemId}'>
                          <input type='hidden' name='new_folder_id' value='${newFolderId}'>
                          <input type='hidden' name='move_item' value='1'>`;
        document.body.appendChild(form);
        form.submit();
    });
});
</script>

<!-- Estilo melhorado para o menu -->
<style>
.action-menu {
    display: none; /* Oculta por padrão */
    position: absolute;
    background-color: white;
    border: 1px solid #ccc;
    z-index: 1000;
    padding: 10px;
    border-radius: 4px;
    right: 0; /* Alinhar à direita do botão */
    left: auto; /* Não usar a posição à esquerda */
    box-shadow: 0 2px 10px rgba(0,0,0,0.1); /* Sombra suave */
}

.icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    display: flex;
    align-items: center;
    font-size: 14px; /* Tamanho da fonte do botão */
    margin: 5px 0; /* Margeando os botões */
    transition: background-color 0.2s; /* Animação para a transição */
}

.icon-button:hover {
    background-color: #f0f0f0; /* Cor de fundo ao passar o mouse */
}

.three-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    transition: transform 0.3s ease; /* Animação de transição suave */
}

.delete-button1 {
    color: red; /* Cor do botão de excluir */
}

i {
    margin-right: 5px; /* Espaço entre o ícone e o texto */
    font-size: 16px; /* Tamanho do ícone */
}

/* Modal Styles */
.modal {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0,0,0,0.5);
}

.modal-content {
    background-color: #fefefe;
    margin: 15% auto;
    padding: 20px;
    border: 1px solid #888;
    width: 80%;
    max-width: 400px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.close {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
}

.close:hover,
.close:focus {
    color: black;
    text-decoration: none;
    cursor: pointer;
}

.cancel-button {
    background-color: #f44336;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

.cancel-button:hover {
    background-color: #d32f2f;
}

.item-sem-vencimento {
    background-color: #e7f1ff; /* Cor clara para itens sem vencimento */
}

.status-indicator.item-sem-vencimento {
    background-color: #00238C; /* Azul para a barra de status */
}
</style>