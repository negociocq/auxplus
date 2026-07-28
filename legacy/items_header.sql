CREATE TABLE IF NOT EXISTS `items` (
  `id` int(11) NOT NULL,
  `folder_id` int(11) NOT NULL,
  `item_id` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `due_date` date DEFAULT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `status` enum('Longe de Vencer','Perto de Vencer','Já Vencido','Sem Vencimento') NOT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

