<?php
session_start();
require 'db.php';

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $username = trim($_POST['username']);
    $password = trim($_POST['password']);
    $confirm_password = trim($_POST['confirm_password']);
    $admin_password = trim($_POST['admin_password']);
    $is_admin = isset($_POST['is_admin']) ? 1 : 0;

    // Define a senha administrativa
    $admin_password_correct = 'tarciocq@..';

    // Verifica se as senhas coincidem
    if ($password !== $confirm_password) {
        $message = "As senhas não coincidem.";
    } elseif ($admin_password !== $admin_password_correct) {
        $message = "Senha ADM incorreta. Registro falhou.";
    } else {
        // Criptografa a senha
        $hashed_password = password_hash($password, PASSWORD_DEFAULT);

        // Insere o novo usuário no banco de dados
        $stmt = $pdo->prepare("INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)");
        if ($stmt->execute([$username, $hashed_password, $is_admin])) {
            $message = "Conta criada com sucesso.";
        } else {
            $message = "Falha ao criar a conta.";
        }
    }
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registrar</title>
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

        .register-container {
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

        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
        }

        .password-container {
            position: relative;
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
        }

        button:hover {
            background-color: #0056b3;
        }

        .message {
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
            .register-container {
                padding: 15px;
            }

            h1 {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="register-container">
        <h1>Registrar Nova Conta</h1>
        <?php if (isset($message)): ?>
            <div class="message"><?php echo htmlspecialchars($message); ?></div>
        <?php endif; ?>
        <form method="post">
            <label for="username">Nome de Usuário:</label>
            <input type="text" id="username" name="username" required>
            
            <label for="password">Senha:</label>
            <div class="password-container">
                <input type="password" id="password" name="password" required>
                <span class="toggle-password" id="togglePassword1">👁️</span>
            </div>
            
            <label for="confirm_password">Confirmar Senha:</label>
            <div class="password-container">
                <input type="password" id="confirm_password" name="confirm_password" required>
                <span class="toggle-password" id="togglePassword2">👁️</span>
            </div>
            
            <label for="admin_password">Senha ADM:</label>
            <div class="password-container">
                <input type="password" id="admin_password" name="admin_password" required>
                <span class="toggle-password" id="togglePassword3">👁️</span>
            </div>
            
            <label for="is_admin">Conta ADM:</label>
            <input type="checkbox" id="is_admin" name="is_admin">
            
            <button type="submit">Registrar</button>
            <a href="login.php">Já tem uma conta? Faça login.</a>
        </form>
    </div>

    <script>
        // Funcionalidade para alternar a visibilidade da senha
        const togglePassword1 = document.getElementById('togglePassword1');
        const passwordInput1 = document.getElementById('password');

        togglePassword1.addEventListener('click', function () {
            const type = passwordInput1.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput1.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '🙈';
        });

        const togglePassword2 = document.getElementById('togglePassword2');
        const passwordInput2 = document.getElementById('confirm_password');

        togglePassword2.addEventListener('click', function () {
            const type = passwordInput2.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput2.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '🙈';
        });

        const togglePassword3 = document.getElementById('togglePassword3');
        const passwordInput3 = document.getElementById('admin_password');

        togglePassword3.addEventListener('click', function () {
            const type = passwordInput3.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput3.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '🙈';
        });
    </script>
</body>
</html>