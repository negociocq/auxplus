<?php
require 'db.php';

header('Content-Type: application/json');

$user_id = $_SESSION['user_id'];
$folder_id = $_GET['folder_id'] ?? null;

// Obter dados para o gráfico de pizza
$pie_stmt = $pdo->prepare("
    SELECT 
        status,
        COUNT(*) as count
    FROM items
    WHERE folder_id = ?
    GROUP BY status
");
$pie_stmt->execute([$folder_id]);
$pie_data = $pie_stmt->fetchAll(PDO::FETCH_ASSOC);

// Obter dados para o gráfico de barras
$bar_stmt = $pdo->prepare("
    SELECT 
        item_id,
        COUNT(*) as count
    FROM items
    WHERE folder_id = ?
    GROUP BY item_id
");
$bar_stmt->execute([$folder_id]);
$bar_data = $bar_stmt->fetchAll(PDO::FETCH_ASSOC);

// Organize data for pie chart
$pie_labels = [];
$pie_values = [];
foreach ($pie_data as $data) {
    $pie_labels[] = $data['status'];
    $pie_values[] = (int)$data['count'];
}

// Organize data for bar chart
$bar_labels = [];
$bar_values = [];
foreach ($bar_data as $data) {
    $bar_labels[] = $data['item_id'];
    $bar_values[] = (int)$data['count'];
}

echo json_encode([
    'pie' => [
        'labels' => $pie_labels,
        'values' => $pie_values
    ],
    'bar' => [
        'labels' => $bar_labels,
        'values' => $bar_values
    ]
]);
?>
