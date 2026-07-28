<?php
include 'db.php';  // Assuming db.php is in the same directory
$stmt = $pdo->query("SELECT 1");
echo "Query successful: " . $stmt->fetchColumn();
?>