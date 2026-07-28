<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id']) || !$_SESSION['is_admin']) {
    header("Location: login.php");
    exit();
}

$page = $_GET['page'] ?? 'manage_users';
$search_query = $_POST['search_query'] ?? '';

// Lógica para processar ações POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action'])) {
        $action = $_POST['action'];
        $target_user_id = $_POST['user_id'];

        try {
            switch ($action) {
                case 'delete':
                    if ($target_user_id != $_SESSION['user_id']) {
                        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
                        $stmt->execute([$target_user_id]);
                    }
                    break;

                case 'deactivate':
                    if ($target_user_id != $_SESSION['user_id']) {
                        $stmt = $pdo->prepare("UPDATE users SET is_active = 0 WHERE id = ?");
                        $stmt->execute([$target_user_id]);
                    }
                    break;

                case 'activate':
                    $stmt = $pdo->prepare("UPDATE users SET is_active = 1 WHERE id = ?");
                    $stmt->execute([$target_user_id]);
                    break;

                case 'change_password':
                    $new_password = $_POST['new_password'] ?? '';
                    if (!empty($new_password)) {
                        $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
                        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
                        $stmt->execute([$hashed_password, $target_user_id]);
                    }
                    break;
            }
            header("Location: dashboard_adm.php?page=manage_users");
            exit();
        } catch (PDOException $e) {
            echo "Erro: " . $e->getMessage();
        }
    } elseif (isset($_POST['ticket_id'])) {
        // Enviando resposta ao ticket
        $ticket_id = $_POST['ticket_id'];
        $response = $_POST['response'];

        $stmt = $pdo->prepare("UPDATE tickets SET response = ?, responded_at = NOW() WHERE id = ?");
        $stmt->execute([$response, $ticket_id]);

        header("Location: dashboard_adm.php?page=tickets");
        exit();
    } elseif (isset($_POST['edit_ticket_id'])) {
        // Editando a resposta do ticket
        $edit_ticket_id = $_POST['edit_ticket_id'];
        $new_response = $_POST['new_response'];

        $stmt = $pdo->prepare("UPDATE tickets SET response = ? WHERE id = ?");
        $stmt->execute([$new_response, $edit_ticket_id]);

        header("Location: dashboard_adm.php?page=tickets");
        exit();
    }
}

// Preparar a consulta de usuários com base na busca
$query = "SELECT * FROM users WHERE 1";

if (!empty($search_query)) {
    $query .= " AND (id LIKE :search OR username LIKE :search)";
}
$stmt = $pdo->prepare($query);

if (!empty($search_query)) {
    $stmt->bindValue(':search', '%' . $search_query . '%');
}

$stmt->execute();
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Para gerenciar tickets
$tickets = [];
if ($page === 'tickets') {
    $stmt = $pdo->prepare("SELECT t.*, u.username FROM tickets t JOIN users u ON t.user_id = u.id ORDER BY created_at DESC");
    $stmt->execute();
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
}

if ($page === 'logout') {
    session_destroy();
    header("Location: login.php");
    exit();
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Administrador</title>
    <style>
        /* Estilos Globais */
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            display: flex;
            min-height: 100vh;
            background-color: #f8f9fa;
        }

        .menu-toggle {
            position: fixed;
            top: 15px;
            left: 15px;
            cursor: pointer;
            font-size: 24px;
            background-color: #007bff;
            padding: 10px;
            border-radius: 4px;
            border: none;
            color: white;
            z-index: 2;
            transition: background-color 0.3s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }

        .menu-toggle:hover {
            background-color: #0056b3;
        }

        .sidebar {
            width: 250px;
            background-color: #343a40;
            color: white;
            position: fixed;
            height: 100%;
            top: 0;
            left: 0;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 1;
            overflow-y: auto;
        }

        .sidebar.open {
            transform: translateX(0);
        }

        .sidebar .banner {
            background-color: #007bff; 
            color: white;
            text-align: center; 
            padding: 15px 0; 
            font-size: 22px; 
            font-weight: bold; 
        }

        .menu-options {
            padding-top: 20px; 
        }

        .sidebar a {
            display: block;
            padding: 15px; 
            color: white;
            text-decoration: none;
            margin-bottom: 10px;
            border-radius: 4px;
            transition: background-color 0.3s ease; 
        }

        .sidebar a:hover {
            background-color: #495057;
        }

        .main-content {
            margin-left: 10; 
            padding: 20px;
            flex: 1;
            transition: margin-left 0.3s ease;
            width: 100%; 
            box-sizing: border-box; 
        }

        h1 {
            text-align: center;
            margin: 20px 0;
            color: #333;
        }

        /* Estilo para a Busca */
        .search-bar {
            margin-bottom: 20px; 
        }

        .search-input {
            width: calc(100% - 120px); 
            padding: 8px; 
            border-radius: 4px; 
            border: 1px solid #ddd; 
            display: inline-block;
            margin-right: 10px;
        }

        .search-button {
            padding: 8px 12px; 
            background-color: #007bff; 
            color: white; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            transition: background-color 0.3s; 
        }

        .search-button:hover {
            background-color: #0056b3; 
        }

        /* Estilo das Tabelas */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px; 
            background-color: white; 
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            overflow: hidden;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }

        th {
            background-color: #007bff; 
            color: white;
        }

        tbody tr:hover {
            background-color: #f1f1f1; 
        }

        .ticket-item {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            margin-bottom: 10px;
            background-color: #fff;
            transition: background-color 0.3s;
        }

        .ticket-item.answered {
            background-color: #d4edda; /* Verde claro para tickets respondidos */
        }

        .response-section {
            display: none;
            margin-top: 10px;
            word-wrap: break-word; /* Permite a quebra de palavra */
            overflow-wrap: break-word; /* Compatibilidade com outros navegadores */
        }

        .response-section pre {
            white-space: pre-wrap; /* Permite quebras de linha */
            word-wrap: break-word; /* Quebra palavras longas */
            max-width: 100%; /* Impede que o elemento saia da tela */
            overflow: hidden; /* Evita que ultrapasse o contêiner */
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .modal-content {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            width: 80%;
            max-width: 500px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        @media (max-width: 768px) {
            .sidebar {
                width: 200px;
            }
            .search-input {
                width: calc(100% - 70px); 
                margin-right: 5px;
            }
            .menu-toggle {
                top: 10px;
                left: 10px;
                font-size: 20px;
                padding: 8px;
            }
        }
        .container {
            display: flex; /* Mantém as divs na mesma linha */
            align-items: flex-start; /* Alinha as divs pelo topo */
        }
        .spaced-div {
            margin-left: 40px; /* Espaço à esquerda */
            margin-top: -19px; /* Desloca a segunda div para baixo */
        }
        .second-div {
            margin-top: 10px; /* Desloca a segunda div para baixo */
        }
    </style>
</head>
<body>
    <button class="menu-toggle" id="menu-toggle">☰</button>
    <div class="sidebar" id="sidebar">
        <div class="banner">AuxPlus</div>
        <div class="menu-options">
            <a href="#" onclick="navigate('manage_users')">👥 Gerenciar Usuários</a>
            <a href="#" onclick="navigate('tickets')">🎟️ Tickets</a>
            <a href="#" onclick="navigate('logout')">🚪 Sair</a>
        </div>
    </div>
    <div class="main-content" id="main-content">
        <?php if ($page === 'manage_users'): ?>
            <h1>Gerenciar Usuários</h1>
            <div class="search-bar">
                <form method="post">
                    <input type="text" name="search_query" class="search-input" placeholder="Buscar por ID ou Nome" value="<?php echo htmlspecialchars($search_query); ?>">
                    <button type="submit" class="search-button">Buscar</button>
                </form>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nome de Usuário</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($users as $user): ?>
                    <tr>
                        <td><?php echo htmlspecialchars($user['id']); ?></td>
                        <td><?php echo htmlspecialchars($user['username']); ?></td>
                        <td><?php echo $user['is_active'] ? 'Ativo' : 'Desativado'; ?></td>
                        <td class="actions">
                            <span title="Alterar Senha" onclick="openModal('change_password', '<?php echo htmlspecialchars($user['id']); ?>')">🔑</span>
                            <?php if (!$user['is_admin']): ?>
                                <?php if ($user['is_active']): ?>
                                    <span title="Desativar" onclick="openModal('deactivate', '<?php echo htmlspecialchars($user['id']); ?>')">🚫</span>
                                <?php else: ?>
                                    <span title="Ativar" onclick="openModal('activate', '<?php echo htmlspecialchars($user['id']); ?>')">✅</span>
                                <?php endif; ?>
                                <div class="container"> <div class="spaced-div"><span title="Excluir" onclick="openModal('delete', '<?php echo htmlspecialchars($user['id']); ?>')">❌</div></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        <?php elseif ($page === 'tickets'): ?>
            <h1>Tickets de Usuários</h1>
            <div>
                <?php foreach ($tickets as $ticket): ?>
                    <div class="ticket-item <?php echo !empty($ticket['response']) ? 'answered' : ''; ?>">
                        <strong>ID:</strong> <?php echo htmlspecialchars($ticket['id']); ?><br>
                        <strong>Usuário:</strong> <?php echo htmlspecialchars($ticket['username']); ?><br>
                        <strong>Dúvida:</strong> <?php echo nl2br(htmlspecialchars($ticket['question'])); ?><br>
                        <strong>Criado em:</strong> <?php echo date('d/m/Y', strtotime($ticket['created_at'])); ?><br>
                        
                        <?php if (!empty($ticket['response'])): ?>
                            <strong>Status:</strong> Respondido
                            <button onclick="toggleResponseView('<?php echo htmlspecialchars($ticket['id']); ?>')">Visualizar Resposta</button>
                            <div class="response-section" id="response-view-<?php echo htmlspecialchars($ticket['id']); ?>" style="display:none;">
                                <strong>Resposta:</strong><br>
                                <pre><?php echo nl2br(htmlspecialchars($ticket['response'])); ?></pre>
                            </div>
                        <?php else: ?>
                            <button onclick="toggleResponse('<?php echo htmlspecialchars($ticket['id']); ?>')">Responder</button>
                        <?php endif; ?>
                        
                        <div class="response-section" id="response-<?php echo htmlspecialchars($ticket['id']); ?>">
                            <form method="post">
                                <input type="hidden" name="ticket_id" value="<?php echo htmlspecialchars($ticket['id']); ?>">
                                <textarea name="response" required placeholder="Digite sua resposta aqui..." rows="3"></textarea><br>
                                <button type="submit">Enviar Resposta</button>
                            </form>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <div id="modal" class="modal">
            <div class="modal-content">
                <h2 id="modal-title"></h2>
                <p id="modal-message"></p>
                <form id="modal-form" method="post">
                    <input type="hidden" id="modal-action" name="action">
                    <input type="hidden" id="modal-user_id" name="user_id">
                    <input type="password" id="new_password" name="new_password" placeholder="Nova Senha" style="display:none;">
                    <button type="submit">Confirmar</button>
                    <button type="button" onclick="closeModal()">Cancelar</button>
                </form>
            </div>
        </div>

        <div id="edit-response-modal" class="modal">
            <div class="modal-content">
                <h2>Editar Resposta</h2>
                <form id="edit-response-form" method="post">
                    <input type="hidden" name="edit_ticket_id" id="edit_ticket_id">
                    <textarea name="new_response" required id="new_response" rows="4"></textarea><br>
                    <button type="submit">Atualizar Resposta</button>
                    <button type="button" onclick="closeEditResponseModal()">Cancelar</button>
                </form>
            </div>
        </div>

        <script>
            document.addEventListener('DOMContentLoaded', function() {
                var sidebar = document.getElementById('sidebar');
                var mainContent = document.getElementById('main-content');
                var menuToggle = document.getElementById('menu-toggle');

                menuToggle.addEventListener('click', function() {
                    var isOpen = sidebar.classList.contains('open');
                    sidebar.classList.toggle('open', !isOpen);
                    mainContent.classList.toggle('shifted', !isOpen);
                });
            });

            function navigate(page) {
                if (page === 'logout') {
                    window.location.href = 'dashboard_adm.php?page=logout';
                } else {
                    window.location.href = 'dashboard_adm.php?page=' + page;
                }
            }

            function openModal(action, userId) {
                var modalTitle = document.getElementById('modal-title');
                var modalMessage = document.getElementById('modal-message');
                document.getElementById('modal-action').value = action;
                document.getElementById('modal-user_id').value = userId;

                switch (action) {
                    case 'delete':
                        modalTitle.innerText = 'Excluir Usuário';
                        modalMessage.innerText = 'Você tem certeza que deseja excluir este usuário?';
                        break;
                    case 'deactivate':
                        modalTitle.innerText = 'Desativar Usuário';
                        modalMessage.innerText = 'Você tem certeza que deseja desativar este usuário?';
                        break;
                    case 'activate':
                        modalTitle.innerText = 'Ativar Usuário';
                        modalMessage.innerText = 'Você tem certeza que deseja ativar este usuário?';
                        break;
                    case 'change_password':
                        modalTitle.innerText = 'Alterar Senha';
                        modalMessage.innerText = 'Digite a nova senha para este usuário:';
                        document.getElementById('new_password').style.display = 'block';
                        break;
                }
                document.getElementById('modal').style.display = 'flex';
            }

            function closeModal() {
                document.getElementById('modal').style.display = 'none';
                document.getElementById('new_password').style.display = 'none';
            }

            function toggleResponse(ticketId) {
                var responseSection = document.getElementById('response-' + ticketId);
                if (responseSection.style.display === "none" || responseSection.style.display === "") {
                    responseSection.style.display = "block";
                } else {
                    responseSection.style.display = "none";
                }
            }

            function toggleResponseView(ticketId) {
                var responseView = document.getElementById('response-view-' + ticketId);
                if (responseView.style.display === "none" || responseView.style.display === "") {
                    responseView.style.display = "block";
                } else {
                    responseView.style.display = "none";
                }
            }

            function openEditResponseModal(ticketId, response) {
                document.getElementById('edit_ticket_id').value = ticketId;
                document.getElementById('new_response').value = response; // Preenche a textarea
                document.getElementById('edit-response-modal').style.display = 'flex'; // Exibe o modal
            }

            function closeEditResponseModal() {
                document.getElementById('edit-response-modal').style.display = 'none';
            }
        </script>
    </body>
</html>