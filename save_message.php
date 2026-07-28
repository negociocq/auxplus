<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Usuário não autenticado.']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $user_id = $_SESSION['user_id'];
    $message = $_POST['message'] ?? '';
    $folder_id = $_POST['folder_id'] ?? ''; // Capturando o folder_id da requisição

    if (!empty($message)) {
        try {
            // Atualiza ou insere a mensagem no banco de dados
            $stmt = $pdo->prepare("REPLACE INTO whatsapp_messages (user_id, folder_id, message) VALUES (?, ?, ?)");
            $stmt->execute([$user_id, $folder_id, $message]);

            echo json_encode(['status' => 'success', 'message' => 'Mensagem salva com sucesso.']);
        } catch (PDOException $e) {
            echo json_encode(['status' => 'error', 'message' => 'Erro ao salvar a mensagem: ' . $e->getMessage()]);
        }
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Mensagem não pode ser vazia.']);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Método de requisição inválido.']);
}
?>