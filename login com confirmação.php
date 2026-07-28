<?php
session_start();
require 'db.php';

$error_message = '';

// Verifica se o usuário já está logado
if (isset($_SESSION['user_id'])) {
    if ($_SESSION['is_admin']) {
        header("Location: dashboard_adm.php");
    } else {
        header("Location: dashboard.php");
    }
    exit();
}

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    $captchaResponse = $_POST['g-recaptcha-response'] ?? '';

    // Suas chaves do reCAPTCHA
    $secretKey = "6Lc7wA4rAAAAAMo-ZR75scotauRcD7TWG9wDzH9V"; // Chave Secreta
    $siteKey = "6Lc7wA4rAAAAABlYx2eA3HNTz7BzyPiy88BcGLoQ"; // Chave do Site
    
    // Verifica se o reCAPTCHA foi preenchido
    $response = file_get_contents("https://www.google.com/recaptcha/api/siteverify?secret={$secretKey}&response={$captchaResponse}");
    $responseKeys = json_decode($response, true);

    if (!$responseKeys["success"]) {
        $error_message = "Por favor, confirme que você não é um robô.";
    } else {
        if (empty($username) || empty($password)) {
            $error_message = "Por favor, preencha todos os campos.";
        } else {
            try {
                $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
                $stmt->execute([$username]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($user) {
                    if (!$user['is_active']) {
                        $error_message = "Sua conta está desativada. Entre em contato com o suporte.";
                    } elseif (password_verify($password, $user['password'])) {
                        $_SESSION['user_id'] = $user['id'];
                        $_SESSION['is_admin'] = $user['is_admin'];

                        if ($user['is_admin']) {
                            header("Location: dashboard_adm.php");
                        } else {
                            header("Location: dashboard.php");
                        }
                        exit();
                    } else {
                        $error_message = "Nome de usuário ou senha inválidos.";
                    }
                } else {
                    $error_message = "Nome de usuário ou senha inválidos.";
                }
            } catch (PDOException $e) {
                $error_message = "Erro ao acessar o banco de dados: " . $e->getMessage();
            }
        }
    }
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: url('01.png') no-repeat center center fixed;
            background-size: cover;
            font-family: Arial, sans-serif;
        }

        .login-container {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 400px;
            animation: fadeIn 1s ease-in;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        h1 {
            margin-top: 0;
            color: #333;
            text-align: center;
            font-size: 24px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #555;
        }

        .password-container {
            position: relative;
        }

        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
        }

        .toggle-password {
            position: absolute;
            right: 10px;
            top: 10px;
            cursor: pointer;
            color: #aaa;
        }

        button {
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 10px;
            cursor: pointer;
            width: 100%;
            font-size: 16px;
            transition: background-color 0.3s;
            position: relative; /* Para o spinner */
            overflow: hidden; /* Para evitar que o spinner transborde o botão */
        }

        button.loading {
            background-color: #0056b3; /* Altera a cor quando estiver carregando */
            pointer-events: none; /* Desabilita cliques enquanto carrega */
        }

        .spinner {
            display: none; /* Ocultar por padrão */
            margin-left: 5px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            width: 1em;
            height: 1em;
            animation: spin 1s linear infinite;
            vertical-align: middle; /* Alinha o spinner ao texto */
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        button:hover:not(.loading) {
            background-color: #0056b3; /* Altera a cor hover do botão */
        }

        .error-message {
            color: #d9534f;
            font-size: 14px;
            margin-bottom: 15px;
            text-align: center;
        }

        a {
            display: block;
            margin-top: 10px;
            text-align: center;
            color: #007bff;
            text-decoration: none;
            font-size: 14px;
        }

        a:hover {
            text-decoration: underline;
        }

        @media (max-width: 600px) {
            .login-container {
                padding: 15px;
            }

            h1 {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>Login</h1>
        <?php if ($error_message): ?>
            <div class="error-message"><?php echo htmlspecialchars($error_message); ?></div>
        <?php endif; ?>
        <form method="post" id="loginForm">
            <label for="username">Nome de Usuário:</label>
            <input type="text" id="username" name="username" required>
            <label for="password">Senha:</label>
            <div class="password-container">
                <input type="password" id="password" name="password" required>
                <span class="toggle-password" id="togglePassword">👁️</span>
            </div>
            <div class="g-recaptcha" data-sitekey="6Lc7wA4rAAAAABlYx2eA3HNTz7BzyPiy88BcGLoQ"></div>
            <button type="submit" id="loginButton">Entrar
                <span class="spinner" id="spinner"></span> <!-- Spinner adicional -->
            </button>
            <a href="register.php">Criar Conta</a>
        </form>
    </div>

    <script src="https://www.google.com/recaptcha/api.js" async defer></script>
    <script>
        const togglePassword = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('password');

        togglePassword.addEventListener('click', function () {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '🙈';
        });

        const loginForm = document.getElementById("loginForm");
        const loginButton = document.getElementById("loginButton");
        const spinner = document.getElementById("spinner");

        loginForm.addEventListener("submit", function (event) {
            if (grecaptcha.getResponse() === "") {
                // Se o reCAPTCHA não tiver sido completado, previne o envio do formulário
                event.preventDefault();
                alert("Por favor, confirme que você não é um robô.");
            } else {
                event.preventDefault(); // Previne o envio do formulário imediatamente

                // Simula carregamento
                loginButton.classList.add("loading"); // Adiciona a classe de carregamento
                spinner.style.display = "inline-block"; // Exibe o spinner
                loginButton.innerHTML = "Entrando " + '<span class="spinner" style="display:inline-block;"></span>'; // Adiciona spinner ao botão

                // Envia o formulário após um pequeno atraso
                setTimeout(() => {
                    loginForm.submit(); // Envia o formulário após 1 segundo 
                }, 1000);
            }
        });
    </script>
</body>
</html>