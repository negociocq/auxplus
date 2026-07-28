<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

if ($_SERVER['REQUEST_METHOD'] == 'GET') {
    $folder_id = $_GET['folder_id'] ?? ''; // Capturando o folder_id da requisição
    $user_id = $_SESSION['user_id'];

    try {
        // Busca a mensagem para o folder_id e usuário especificado
        $stmt = $pdo->prepare("SELECT message FROM whatsapp_messages WHERE user_id = ? AND folder_id = ?");
        $stmt->execute([$user_id, $folder_id]);
        $row = $stmt->fetch();

        if ($row) {
            // Se a mensagem foi encontrada, retorne-a
            echo json_encode(['status' => 'success', 'message' => $row['message']]);
        } else {
            // Se não encontrar uma mensagem no banco, retorne uma mensagem padrão
            echo json_encode(['status' => 'success', 'message' => ""]); // Retornar uma string vazia, em vez de uma mensagem padrão
        }
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Erro ao carregar a mensagem: ' . $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Método de requisição inválido.']);
}
?>