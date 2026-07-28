<?php
session_start();
require 'db.php';

// Verifica se o token do Google foi enviado
if (isset($_POST['idtoken'])) {
    $id_token = $_POST['idtoken'];
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . $id_token;
    
    $response = file_get_contents($url);
    $user_data = json_decode($response, true);

    if (isset($user_data['sub'])) {
        // Verifica se o usuário já existe na base de dados
        $stmt = $pdo->prepare("SELECT * FROM users WHERE google_id = ?");
        $stmt->execute([$user_data['sub']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            // Usuário já existe, faz login
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['is_admin'] = $user['is_admin'];
            echo "success";
        } else {
            // Usuário não existe, cria um novo
            $stmt = $pdo->prepare("INSERT INTO users (google_id, username, email) VALUES (?, ?, ?)");
            $stmt->execute([$user_data['sub'], $user_data['name'], $user_data['email']]);
            $_SESSION['user_id'] = $pdo->lastInsertId();
            $_SESSION['is_admin'] = 0; // Padrão para novo usuário
            echo "success";
        }
    } else {
        echo "Invalid Google token.";
    }
} else {
    echo "No token provided.";
}
?>
