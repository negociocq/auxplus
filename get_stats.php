<?php
session_start();
require 'db.php';

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['error' => 'Usuário não autenticado']);
    exit();
}

$user_id = $_SESSION['user_id'];
$folder_id = $_POST['folder_id'] ?? null;

if (!$folder_id) {
    echo json_encode(['error' => 'ID da pasta não fornecido']);
    exit();
}

$far_due_days = 20; // Pode ajustar conforme as configurações do usuário
$near_due_days = 10;

$stats_stmt = $pdo->prepare("
    SELECT
        SUM(CASE WHEN DATEDIFF(due_date, NOW()) > ? THEN 1 ELSE 0 END) AS far_count,
        SUM(CASE WHEN DATEDIFF(due_date, NOW()) <= ? AND DATEDIFF(due_date, NOW()) >= 0 THEN 1 ELSE 0 END) AS near_count,
        SUM(CASE WHEN DATEDIFF(due_date, NOW()) < 0 THEN 1 ELSE 0 END) AS expired_count
    FROM items
    WHERE folder_id = ?
");
$stats_stmt->execute([$far_due_days, $near_due_days, $folder_id]);
$stats = $stats_stmt->fetch(PDO::FETCH_ASSOC);

echo json_encode([
    'far' => $stats['far_count'],
    'near' => $stats['near_count'],
    'expired' => $stats['expired_count']
]);
?>
