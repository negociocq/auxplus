<?php
// Permitir CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0); // Responde a um pré-requisito OPTIONS e sai
}

if (!isset($_GET['url'])) {
    http_response_code(400);
    echo "URL não informada.";
    exit;
}

$url = $_GET['url'];

// Inicializa cURL
$ch = curl_init();

// Configurações do cURL
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HEADER, false);

// Executa a requisição cURL
$content = curl_exec($ch);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

// Fechar o cURL
curl_close($ch);

if ($content === false) {
    http_response_code(500);
    echo "Erro ao carregar a URL.";
    exit;
}

// Define o tipo de conteúdo apropriado
header("Content-Type: $contentType");
echo $content;
?>