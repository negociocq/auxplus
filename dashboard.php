<?php
session_start();
require 'db.php';

// Definindo o fuso horário para São Paulo
date_default_timezone_set('America/Sao_Paulo');

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

$user_id = $_SESSION['user_id'];
$page = $_SESSION['current_page'] ?? 'folders';

if (isset($_GET['page'])) {
    $page = $_GET['page'];
    $_SESSION['current_page'] = $page;
}

if ($page === 'logout') {
    session_destroy();
    header("Location: login.php");
    exit();
}

// Verificar o tipo de página válida
$valid_pages = ['folders', 'items', 'change_password', 'ticket'];
if (!in_array($page, $valid_pages)) {
    $page = 'folders';
}

// Processar a criação de tickets
if ($page === 'ticket' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $question = $_POST['question'];
    $stmt = $pdo->prepare("INSERT INTO tickets (user_id, question) VALUES (?, ?)");
    $stmt->execute([$user_id, $question]);
    $message = "Ticket enviado com sucesso!";
}

// Buscar tickets do usuário, incluindo respostas
$tickets = [];
if ($page === 'ticket') {
    $stmt = $pdo->prepare("
        SELECT t.*, 
               (SELECT response FROM tickets WHERE id = t.id) AS response 
        FROM tickets t 
        WHERE t.user_id = ? 
        ORDER BY t.created_at DESC
    ");
    $stmt->execute([$user_id]);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            display: flex;
            height: 100vh;
            overflow: auto; /* Permite que a barra de rolagem esteja no corpo */
        }

        .menu-toggle {
            position: fixed;
            top: 15px;
            left: 15px;
            cursor: pointer;
            font-size: 24px;
            background-color: #ddd;
            padding: 10px;
            border-radius: 4px;
            border: none;
            z-index: 2;
            width: 50px; 
            height: 50px;
            box-sizing: border-box; 
            transition: opacity 0.3s ease; 
        }

        .sidebar {
            width: 250px;
            background-color: #333;
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
            text-align: right; 
            padding: 10px 20px; 
            font-size: 22px; 
            font-weight: bold; 
            letter-spacing: 1px; 
        }

        .menu-options {
            padding-top: 40px; 
            padding-bottom: 20px; 
        }

        .sidebar a {
            display: block;
            padding: 15px; 
            color: white;
            text-decoration: none;
            margin-bottom: 10px;
            border-radius: 4px;
            transition: background-color 0.3s ease, transform 0.2s ease; 
        }

        .sidebar a:hover {
            background-color: #444;
            transform: scale(1.05); 
        }

        .main-content {
            margin-left: 10; 
            padding: 20px;
            flex: 1;
            transition: margin-left 0.3s ease;
            height: 100vh; 
            box-sizing: border-box; 
        }

        .main-content.shifted {
            margin-left: 250px; 
        }

        .transparent {
            opacity: 0.5; 
        }

        @media (max-width: 768px) {
            .sidebar {
                width: 200px;
            }
            .main-content {
                margin-left: 0; 
                padding: 10px;
                height: 100%; 
            }
            .main-content.shifted {
                margin-left: 200px; 
            }
        }
                .ticket-list {
            margin-top: 20px;
            padding: 10px;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .ticket-item {
            border-bottom: 1px solid #ddd;
            padding: 10px 0;
        }

        .ticket-item:last-child {
            border-bottom: none;
        }

        .ticket-item.answered {
            background-color: #d4edda; /* Verde claro para tickets respondidos */
        }

        .ticket-item:not(.answered) {
            background-color: #f9f9f9; /* Cor padrão para tickets não respondidos */
        }

        .toggle-response {
            cursor: pointer;
            color: #007bff;
            text-decoration: underline;
        }

        .response {
            display: none;
            margin-top: 10px;
            padding: 10px;
            background-color: #f9f9f9;
            border-left: 3px solid #007bff;
            border-radius: 4px;
        }

        .ticket-form {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: 0 auto;
            max-width: 600px; /* Limita a largura do formulário */
        }

        textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            resize: none;
            font-size: 16px;
            margin-bottom: 10px;
            min-height: 100px; /* Define uma altura mínima */
        }

        .submit-button {
            background-color: #007bff;
            color: #ffffff;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s;
            width: 100%; /* Faz o botão ocupar toda a largura do formulário */
        }

        .submit-button:hover {
            background-color: #0056b3;
        }

        @media (max-width: 768px) {
            .sidebar {
                width: 200px;
            }
            .main-content {
                margin-left: 0; 
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <div id="back-to-top" style="display: none; position: fixed; bottom: 20px; right: 90px; z-index: 100; background-color: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer;">
     <i class="fas fa-arrow-up"></i> <!-- ícone de seta para cima -->
    </div>
    <button class="menu-toggle" id="menu-toggle">☰</button>
    <div class="sidebar" id="sidebar">
        <div class="banner">AuxPlus</div>
        <div class="menu-options">
            <a href="#" onclick="navigate('folders')">Pastas</a>
            <a href="#" onclick="navigate('change_password')">Trocar Senha</a>
                        <a href="#" onclick="navigate('ticket')">Ticket</a>
            <a href="#" onclick="navigate('logout')">Sair</a>
        </div>
    </div>
    <div class="main-content" id="main-content">
        <?php
        if ($page === 'folders') {
            include 'folders.php';
        } elseif ($page === 'items') {
            include 'items.php';
        } elseif ($page === 'change_password') {
            include 'change_password.php';
        } elseif ($page === 'ticket') {
            // Início do formulário de Ticket
            if (isset($message)) {
                echo "<p style='color: green; text-align: center;'>$message</p>";
            }
            ?>
            <center><h2>Tickets</h2></center>
            <form method="post" class="ticket-form">
                <textarea name="question" placeholder="Escreva sua dúvida aqui..." required></textarea>
                <button type="submit" class="submit-button">Enviar Ticket</button>
            </form>
            <h3>Meus Tickets</h3>
            <div class="ticket-list">
                <?php foreach ($tickets as $ticket): ?>
                    <div class="ticket-item <?= !empty($ticket['response']) ? 'answered' : ''; ?>">
                        <strong>Pergunta:</strong> <?php echo htmlspecialchars($ticket['question']); ?>
                        <div><span class="toggle-response" onclick="toggleResponse(<?php echo $ticket['id']; ?>)">[Ver Resposta]</span></div>
                        <div class="response" id="response-<?php echo $ticket['id']; ?>">
                            <?php if (!empty($ticket['response'])): ?>
                                <div><strong>Resposta:</strong></div> <?php echo nl2br(htmlspecialchars($ticket['response'])); ?>
                            <?php else: ?>
                                <strong>Resposta:</strong> Nenhuma resposta ainda.
                            <?php endif; ?>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
            <?php
        } else {
            echo "<p>Conteúdo não encontrado.</p>";
        }
        ?>
    </div>
    <script>
            function toggleResponse(ticketId) {
            var responseDiv = document.getElementById('response-' + ticketId);
            responseDiv.style.display = responseDiv.style.display === "none" || responseDiv.style.display === "" ? "block" : "none";
        }
        document.addEventListener('DOMContentLoaded', function() {
            const backToTopButton = document.getElementById('back-to-top');

            // Mostra ou esconde o botão com base na rolagem
            window.onscroll = function() {
                if (document.body.scrollTop > 5 || document.documentElement.scrollTop > 500) {
                    backToTopButton.style.display = "block";
                } else {
                    backToTopButton.style.display = "none";
                }
            };

            // Rolagem suave ao clicar no botão
            backToTopButton.onclick = function() {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            };
        });

        document.addEventListener('DOMContentLoaded', function() {
            var sidebar = document.getElementById('sidebar');
            var mainContent = document.getElementById('main-content');
            var menuToggle = document.getElementById('menu-toggle');

            var isMenuOpen = localStorage.getItem('menuOpen') === 'true';
            if (isMenuOpen) {
                sidebar.classList.add('open');
                mainContent.classList.add('shifted');
                menuToggle.classList.remove('transparent');
            } else {
                sidebar.classList.remove('open');
                mainContent.classList.remove('shifted');
                menuToggle.classList.add('transparent');
            }

            menuToggle.addEventListener('click', function() {
                var isOpen = sidebar.classList.contains('open');
                sidebar.classList.toggle('open', !isOpen);
                mainContent.classList.toggle('shifted', !isOpen);
                localStorage.setItem('menuOpen', !isOpen);
                menuToggle.classList.toggle('transparent', isOpen);
            });
        });

        function navigate(page, folderId = null) {
            var sidebar = document.getElementById('sidebar');
            var mainContent = document.getElementById('main-content');

            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                mainContent.classList.remove('shifted');
                localStorage.setItem('menuOpen', false);
            }

            setTimeout(function() {
                if (page === 'items' && folderId) {
                    window.location.href = 'dashboard.php?page=items&folder_id=' + folderId;
                } else {
                    window.location.href = 'dashboard.php?page=' + page;
                }
            }, 300);
        }
    </script>
</body>
</html>