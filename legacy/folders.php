<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION['user_id'];

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    if (isset($_POST['delete_folder'])) {
        $password = filter_input(INPUT_POST, 'password', FILTER_SANITIZE_STRING);
        $stmt = $pdo->prepare("SELECT password FROM users WHERE id = ?");
        $stmt->execute([$user_id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (password_verify($password, $user['password'])) {
            $folder_id = filter_input(INPUT_POST, 'folder_id', FILTER_VALIDATE_INT);
            if ($folder_id) {
                $stmt = $pdo->prepare("DELETE FROM folders WHERE id = ? AND user_id = ?");
                $stmt->execute([$folder_id, $user_id]);
            }
        } else {
            $error_message = "Senha incorreta!";
        }
    } elseif (isset($_POST['create_folder'])) {
        $type = filter_input(INPUT_POST, 'type', FILTER_SANITIZE_STRING);
        $name = filter_input(INPUT_POST, 'name', FILTER_SANITIZE_STRING);
        if ($type && $name) {
            $stmt = $pdo->prepare("INSERT INTO folders (user_id, type, name) VALUES (?, ?, ?)");
            $stmt->execute([$user_id, $type, $name]);
        }
    } elseif (isset($_POST['edit_folder'])) {
        $folder_id = filter_input(INPUT_POST, 'folder_id', FILTER_VALIDATE_INT);
        $new_name = filter_input(INPUT_POST, 'new_name', FILTER_SANITIZE_STRING);
        $new_type = filter_input(INPUT_POST, 'new_type', FILTER_SANITIZE_STRING);
        if ($folder_id && $new_name && $new_type) {
            $stmt = $pdo->prepare("UPDATE folders SET name = ?, type = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$new_name, $new_type, $folder_id, $user_id]);
        }
    }
}

// Calcular itens que vencem hoje, amanhã e em dois dias
$today = date('Y-m-d');
$tomorrow = date('Y-m-d', strtotime('+1 day'));
$two_days_later = date('Y-m-d', strtotime('+2 days'));

$due_items_stmt = $pdo->prepare("
    SELECT 
        f.id AS folder_id,
        f.name AS folder_name,
        COUNT(CASE WHEN i.due_date = :today THEN 1 END) AS today_count,
        COUNT(CASE WHEN i.due_date = :tomorrow THEN 1 END) AS tomorrow_count,
        COUNT(CASE WHEN i.due_date = :two_days THEN 1 END) AS two_days_count
    FROM items i
    JOIN folders f ON i.folder_id = f.id
    WHERE f.user_id = :user_id
    GROUP BY f.id
");

$due_items_stmt->execute([
    ':today' => $today,
    ':tomorrow' => $tomorrow,
    ':two_days' => $two_days_later,
    ':user_id' => $user_id
]);

$due_folders = $due_items_stmt->fetchAll(PDO::FETCH_ASSOC);

// Recupera pastas separadas por tipo
$folders_stmt = $pdo->prepare("SELECT * FROM folders WHERE user_id = ?");
$folders_stmt->execute([$user_id]);
$folders = $folders_stmt->fetchAll(PDO::FETCH_ASSOC);

// Organizando pastas por tipo
$folders_by_type = [];
foreach ($folders as $folder) {
    $folders_by_type[$folder['type']][] = $folder;
}

// Coletando dados das pastas (quantidade de itens e preço total)
$folders_data = [];
foreach ($folders as $folder) {
    $stmt = $pdo->prepare("SELECT COUNT(*) as item_count, SUM(price) as total_price FROM items WHERE folder_id = ?");
    $stmt->execute([$folder['id']]);
    $data = $stmt->fetch(PDO::FETCH_ASSOC);

    // Armazenando os dados
    $folders_data[] = [
        'folder_name' => $folder['name'],
        'item_count' => $data['item_count'] ?: 0, // Garantir que não tenha valores nulos
        'total_price' => $data['total_price'] ?: 0 // Garantir que não tenha valores nulos
    ];
}

// Calculando o preço total e a quantidade de itens de todas as pastas
$total_general_price = array_sum(array_column($folders_data, 'total_price'));
$total_items_count = array_sum(array_column($folders_data, 'item_count'));
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Minhas Pastas</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
.notification-modal {
    display: none; /* Escondido por padrão */
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    justify-content: center;
    align-items: center;
}

.notification-modal-content {
    background-color: #ffffff;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    text-align: center;
    position: relative;
    max-width: 400px;
    width: 80%;
}

.close {
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 20px;
    color: #aaa;
    cursor: pointer;
}
.close:hover {
    color: black;
}
        body {
            font-family: 'Arial', sans-serif;
            background-color: #f4f7fa;
            margin: 0;
            padding: 0;
            color: #333;
            height: 100%;
            overflow: auto;
        }
        .folders-container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background-color: #ffffff;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            height: auto;
        }
        header {
            text-align: center;
            margin-bottom: 15px;
        }
        h1 {
            font-size: 2.5em;
            color: #007bff;
            margin: 0;
        }
        form {
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background-color: #f9f9f9;
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: bold;
            margin: 10px 0 5px;
        }
        select, 
        input[type="text"] {
            width: calc(100% - 20px);
            padding: 8px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            outline: none;
            transition: border-color 0.3s;
        }
        select:focus, 
        input[type="text"]:focus {
            border-color: #007bff;
        }
        button {
            padding: 8px 12px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 15px;
            transition: background-color 0.3s, transform 0.2s;
        }
        button:hover {
            background-color: #0056b3;
            transform: translateY(-1px);
        }
        h2 {
            margin: 15px 0 10px;
            padding-bottom: 5px;
            border-bottom: 2px solid #007bff;
            color: #007bff;
            font-size: 1.8em;
        }
        ul {
            list-style: none;
            padding: 0;
        }
        li {
            padding: 5px;
            margin: 4px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
            background-color: #f1f1f1;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.3s, box-shadow 0.3s;
            cursor: pointer;
            font-size: 14px;
        }
        li:hover {
            background-color: #e9ecef;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
        }
        .folder-link {
            flex-grow: 1;
            padding: 0px 0;
            text-decoration: none;
            color: #333;
            font-weight: bold;
        }
        .delete-button {
            background-color: #dc3545;
            border: none;
            padding: 5px;
            cursor: pointer;
            color: white;
            border-radius: 5px;
        }
        .edit-button {
            background-color: #000;
            color: white;
            border: none;
            padding: 5px;
            cursor: pointer;
            border-radius: 5px;
        }
        .modal {
            display: none; /* Escondido por padrão */
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.5);
        }
        .modal-content {
            background-color: #fefefe;
            margin: 15% auto;
            padding: 20px;
            border: 1px solid #888;
            width: 80%;
            max-width: 500px;
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
                /* Estilos para o slide do gráfico */
.chart-slide {
    max-height: 80vh; /* Ajuste a altura máxima conforme necessário */
    overflow-y: auto; /* Permite rolagem vertical */
    background: white; /* Cor do fundo */
    padding: 20px; /* Espaçamento interno */
    border: 1px solid #ccc; /* Adiciona uma borda ao contêiner */
    position: fixed; /* Pode ser 'fixed' ou 'absolute', dependendo do layout desejado */
    top: 10%; /* Para centralizar o slide */
    left: 50%;
    transform: translate(-50%, 0);
    width: 90%; /* Largura do contêiner */
    z-index: 1000; /* Certifique-se de que esteja acima do conteúdo */
    display: none; /* Inicialmente escondido */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); /* Sombra para destaque */
}


.chart-slide.show {
    display: block; /* Altera para 'block' quando a classe 'show' é aplicada */
}

.chart-slide-content {
    padding: 20px;
    height: 100%;
    overflow-y: auto;
}

.chart-slide .close {
    position: absolute;
    top: 20px;
    left: 20px;
    font-size: 28px;
    cursor: pointer;
}

.chart-slide canvas {
    width: 100%;
    height: 300px;
}
.chart-container {
    width: 100%;
    overflow-x: auto; /* Adiciona barra de rolagem horizontal */
    white-space: nowrap; /* Impede que o conteúdo quebre em várias linhas */
}

.canvas-wrapper {
    display: inline-block; /* Permite que os gráficos fiquem em linha e se tornem roláveis */
}
    </style>
</head>
<body>
    <div class="folders-container">
        <header>
            <h1>Minhas Pastas</h1>
        </header>
        <main>
            <form method="post">
                <label for="type">Tipo:</label>
                <select id="type" name="type" required>
                    <option value="Produto">Produto</option>
                    <option value="Cliente">Cliente</option>
                </select>
                <label for="name">Nome da Pasta:</label>
                <input type="text" id="name" name="name" placeholder="Digite o nome da pasta" required>
                <button type="submit" name="create_folder"><i class="fas fa-folder-plus"></i> Criar Pasta</button>
            </form>

            <h2>Pastas por Tipo</h2>
            <button id="open-chart-slide" class="button-with-icon">
                <i class="fas fa-chart-bar"></i> Mostrar Gráfico
            </button>
            <?php foreach (['Produto', 'Cliente'] as $type): ?>
                <h3><?php echo htmlspecialchars($type); ?>s</h3>
                <ul>
                    <?php if (!empty($folders_by_type[$type])): ?>
                        <?php foreach ($folders_by_type[$type] as $folder): ?>
                            <li>
                                <a class="folder-link" href="dashboard.php?page=items&folder_id=<?php echo htmlspecialchars($folder['id']); ?>">
                                    <?php echo htmlspecialchars($folder['name']); ?>
                                </a>
                                <div>
                                    <button onclick="openEditModal(<?php echo htmlspecialchars($folder['id']); ?>, '<?php echo htmlspecialchars($folder['name']); ?>', '<?php echo htmlspecialchars($folder['type']); ?>')" class="edit-button"><i class="fas fa-pencil-alt"></i></button>
                                    <button onclick="openDeleteModal(<?php echo htmlspecialchars($folder['id']); ?>)" class="delete-button"><i class="fas fa-times"></i></button>
                                </div>
                            </li>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <li>Nenhuma pasta encontrada.</li>
                    <?php endif; ?>
                </ul>
            <?php endforeach; ?>
        </main>
    </div>

    <div id="chart-slide" class="chart-slide">
        <button id="close-chart-slide">Fechar</button>
        <div style="display: flex; flex-direction: column; gap: 20px;">
            <canvas id="chartItems" height="300"></canvas>
            <canvas id="chartPrices" height="300"></canvas>
            <canvas id="chartArea" height="300"></canvas>
        </div>
    </div>

<div id="notificationModal" class="notification-modal">
    <div class="notification-modal-content">
        <span class="close" onclick="closeNotificationModal()">×</span>
        <h2>Aviso de Itens Vencidos</h2>
        <?php if (!empty($due_folders)): ?>
            <p>Você tem itens vencendo:</p>
            <ul>
                <?php foreach ($due_folders as $folder): ?>
                    <?php if ($folder['today_count'] > 0): ?>
                        <li>
                            Na pasta 
                            <a class="folder-link" href="dashboard.php?page=items&folder_id=<?php echo htmlspecialchars($folder['folder_id']); ?>">
                                "<?php echo htmlspecialchars($folder['folder_name']); ?>"
                            </a>: 
                            <?php echo htmlspecialchars($folder['today_count']); ?> item(s) vencendo hoje.
                        </li>
                    <?php endif; ?>
                    <?php if ($folder['tomorrow_count'] > 0): ?>
                        <li>
                            Na pasta 
                            <a class="folder-link" href="dashboard.php?page=items&folder_id=<?php echo htmlspecialchars($folder['folder_id']); ?>">
                                "<?php echo htmlspecialchars($folder['folder_name']); ?>"
                            </a>: 
                            <?php echo htmlspecialchars($folder['tomorrow_count']); ?> item(s) vencendo amanhã.
                        </li>
                    <?php endif; ?>
                    <?php if ($folder['two_days_count'] > 0): ?>
                        <li>
                            Na pasta 
                            <a class="folder-link" href="dashboard.php?page=items&folder_id=<?php echo htmlspecialchars($folder['folder_id']); ?>">
                                "<?php echo htmlspecialchars($folder['folder_name']); ?>"
                            </a>: 
                            <?php echo htmlspecialchars($folder['two_days_count']); ?> item(s) vencendo em dois dias.
                        </li>
                    <?php endif; ?>
                <?php endforeach; ?>
            </ul>
        <?php else: ?>
            <p>Não há itens vencendo em nenhuma pasta.</p>
        <?php endif; ?>
    </div>
</div>

    <script>
        document.addEventListener('DOMContentLoaded', function () {
            // Exibir a modal de notificação se houver itens vencendo
            <?php if (!empty($due_folders) && (array_sum(array_column($due_folders, 'today_count')) > 0 || array_sum(array_column($due_folders, 'tomorrow_count')) > 0 || array_sum(array_column($due_folders, 'two_days_count')) > 0)): ?>
                document.getElementById('notificationModal').style.display = 'flex'; // Muda para 'flex' para centralizar
            <?php endif; ?>
        });

        function closeNotificationModal() {
            document.getElementById('notificationModal').style.display = 'none';
        }

        // Fecha a modal se o usuário clicar fora dela
        window.onclick = function (event) {
            const modal = document.getElementById('notificationModal');
            if (event.target == modal) {
                modal.style.display = "none";
            }
        }
    </script>

    <!-- Modal para editar -->
    <div id="editModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeEditModal()">&times;</span>
            <form id="editForm" method="post">
                <input type="hidden" name="folder_id" id="edit-folder-id">
                <label for="edit-name">Novo Nome:</label>
                <input type="text" id="edit-name" name="new_name" required>
                <label for="edit-type">Novo Tipo:</label>
                <select id="edit-type" name="new_type" required>
                    <option value="Produto">Produto</option>
                    <option value="Cliente">Cliente</option>
                </select>
                <button type="submit" name="edit_folder">Salvar Alterações</button>
            </form>
        </div>
    </div>

    <!-- Modal para deletar -->
    <div id="deleteModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeDeleteModal()">&times;</span>
            <form id="deleteForm" method="post">
                <input type="hidden" name="folder_id" id="delete-folder-id">
                <label for="password">Digite sua senha para confirmar a exclusão:</label>
                <input type="password" id="password" name="password" required>
                <button type="submit" name="delete_folder">Deletar Pasta</button>
                <?php if (isset($error_message)) echo "<p style='color:red;'>$error_message</p>"; ?>
            </form>
        </div>
    </div>

    <script>
        function renderCharts() {
            // Dados das pastas
            const folderNames = <?php echo json_encode(array_column($folders_data, 'folder_name')); ?>;
            const itemCounts = <?php echo json_encode(array_column($folders_data, 'item_count')); ?>;
            const totalPrices = <?php echo json_encode(array_column($folders_data, 'total_price')); ?>;

            const totalItems = <?php echo $total_items_count; ?>;
            const totalPrice = <?php echo $total_general_price; ?>;

            // Gráfico - Quantidade de Itens (Barras)
            const ctxItems = document.getElementById('chartItems').getContext('2d');
            new Chart(ctxItems, {
                type: 'bar',
                data: {
                    labels: [...folderNames, 'Total Geral'],
                    datasets: [{
                        label: 'Quantidade de Itens',
                        data: [...itemCounts, totalItems],
                        backgroundColor: '#4e73df',
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Pastas',
                            },
                            ticks: {
                                autoSkip: false,
                                maxRotation: 90,
                                minRotation: 45,
                            },
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Quantidade de Itens',
                            },
                            beginAtZero: true,
                        },
                    }
                }
            });

            // Gráfico - Preço Total (Barras)
            const ctxPrices = document.getElementById('chartPrices').getContext('2d');
            new Chart(ctxPrices, {
                type: 'bar',
                data: {
                    labels: [...folderNames, 'Total Geral'],
                    datasets: [{
                        label: 'Preço Total (R$)',
                        data: [...totalPrices, totalPrice],
                        backgroundColor: '#1cc88a',
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: { title: { display: true, text: 'Pastas' }},
                        y: { title: { display: true, text: 'Preço (R$)' }, beginAtZero: true }
                    }
                }
            });

            // Gráfico - Área
            const ctxArea = document.getElementById('chartArea').getContext('2d');
            new Chart(ctxArea, {
                type: 'line',
                data: {
                    labels: [...folderNames, 'Total Geral'],
                    datasets: [{
                        label: 'Quantidade de Itens',
                        data: [...itemCounts, totalItems],
                        fill: true,
                        backgroundColor: 'rgba(78, 115, 223, 0.2)',
                        borderColor: '#4e73df',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        x: { title: { display: true, text: 'Pastas' }},
                        y: { title: { display: true, text: 'Quantidade de Itens' }, beginAtZero: true }
                    }
                }
            });
        }

        // Abrir o slide e renderizar os gráficos
        document.getElementById('open-chart-slide').onclick = function () {
            document.getElementById('chart-slide').classList.add('show');
            renderCharts();
        }

        // Fechar o slide
        document.getElementById('close-chart-slide').onclick = function () {
            document.getElementById('chart-slide').classList.remove('show');
        }

        // Fechar o slide ao clicar fora dele
        document.addEventListener('click', function (event) {
            const chartSlide = document.getElementById('chart-slide');
            if (chartSlide.classList.contains('show') && !chartSlide.contains(event.target) && !document.getElementById('open-chart-slide').contains(event.target)) {
                chartSlide.classList.remove('show');
            }
        });
    </script>

    <script>
        function openEditModal(id, name, type) {
            document.getElementById('edit-folder-id').value = id;
            document.getElementById('edit-name').value = name;
            document.getElementById('edit-type').value = type;
            document.getElementById('editModal').style.display = "block";
        }

        function closeEditModal() {
            document.getElementById('editModal').style.display = "none";
        }

        function openDeleteModal(id) {
            document.getElementById('delete-folder-id').value = id;
            document.getElementById('deleteModal').style.display = "block";
        }

        function closeDeleteModal() {
            document.getElementById('deleteModal').style.display = "none";
        }

        // Fecha o modal se o usuário clicar fora dele
        window.onclick = function (event) {
            let editModal = document.getElementById('editModal');
            let deleteModal = document.getElementById('deleteModal');
            if (event.target == editModal) {
                closeEditModal();
            } else if (event.target == deleteModal) {
                closeDeleteModal();
            }
        }
    </script>
</body>
</html>