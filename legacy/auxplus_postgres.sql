-- AuxPlus — PostgreSQL (UTF-8)
-- Compatível com Neon / Supabase / Dyad
-- Sem backticks (MySQL). Rode este arquivo no SQL Editor.
BEGIN;

DROP TABLE IF EXISTS whatsapp_messages CASCADE;
DROP TABLE IF EXISTS folder_messages CASCADE;
DROP TABLE IF EXISTS folder_settings CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS folders CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS folder_type CASCADE;
DROP TYPE IF EXISTS item_status CASCADE;
DROP TYPE IF EXISTS ticket_status CASCADE;

CREATE TYPE folder_type AS ENUM ('Produto', 'Cliente', 'Dívida');
CREATE TYPE item_status AS ENUM ('Longe de Vencer', 'Perto de Vencer', 'Já Vencido', 'Sem Vencimento');
CREATE TYPE ticket_status AS ENUM ('pending', 'answered');

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  remember_token VARCHAR(255)
);

CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type folder_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  whatsapp_message TEXT
);

CREATE TABLE folder_messages (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE folder_settings (
  folder_id INTEGER PRIMARY KEY,
  near_due_days INTEGER NOT NULL,
  far_due_days INTEGER NOT NULL
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  due_date DATE,
  phone VARCHAR(32),
  status item_status NOT NULL DEFAULT 'Sem Vencimento',
  price NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE settings (
  user_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL DEFAULT 0,
  near_due_days INTEGER NOT NULL,
  far_due_days INTEGER NOT NULL,
  PRIMARY KEY (user_id, folder_id)
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  status ticket_status DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at TIMESTAMP,
  response TEXT,
  responded_at TIMESTAMP
);

CREATE TABLE whatsapp_messages (
  user_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL,
  message TEXT,
  PRIMARY KEY (user_id, folder_id)
);

INSERT INTO users (id, username, password, is_admin, is_active) VALUES
(1, 'tarciocq', '$2y$10$cp75Q2VPuS4bujVF9d70v.VY3lO0dlRHKh9pzvVv70zsmUMCQmk9O', FALSE, TRUE),
(9, 'admin', '$2y$10$7HGd2bF/zWbJE8SN6.ntJu9WrVHG97KxtDShcDCoFA6rLcKWum5By', TRUE, TRUE),
(12, 'eronvitor', '$2y$10$FjcxXOjFc5RSQ9Bh/0y/CenFNwxXYsO8xcgAl3ChLlm.7MATgcGdG', FALSE, TRUE),
(18, 'natu', '$2y$10$64Y3ZdI2rRQNsPegpvJUfO4WS1ZJqkkIlVvyU68kRqQX6Y8oX9ER.', FALSE, TRUE),
(16, 'andrelima', '$2y$10$fIMAbzuBIlFFgRS..vRJDO0jqjGLuLBrVyrSDGkGf3t7GHhaXcMMu', FALSE, TRUE),
(17, 'ginhocapu', '$2y$10$wMl5lg7XjJSJBnpftiJ8.erTX.zt1hP1wCkBvE19Vs.60XZsLTzJi', FALSE, TRUE),
(3, 'usuario_3', '$2a$10$w7s.EQndU.opZHnEooLP0u0E8GFx3src6gDCBH0YJC2dH8xERwKnO', FALSE, TRUE),
(2, 'usuario_2', '$2a$10$w7s.EQndU.opZHnEooLP0u0E8GFx3src6gDCBH0YJC2dH8xERwKnO', FALSE, TRUE),
(4, 'usuario_4', '$2a$10$w7s.EQndU.opZHnEooLP0u0E8GFx3src6gDCBH0YJC2dH8xERwKnO', FALSE, TRUE),
(15, 'usuario_15', '$2a$10$w7s.EQndU.opZHnEooLP0u0E8GFx3src6gDCBH0YJC2dH8xERwKnO', FALSE, TRUE);

INSERT INTO folders (id, user_id, type, name, whatsapp_message) VALUES
(3, 1, 'Cliente', 'IPTV', NULL),
(12, 3, 'Cliente', 'Banda larga 30MB', NULL),
(5, 2, 'Cliente', 'Internet', NULL),
(13, 3, 'Produto', 'Mercadinho Preço Bom', NULL),
(14, 4, 'Cliente', 'Hinode', NULL),
(30, 12, 'Cliente', 'Clientes P2P', NULL),
(29, 12, 'Cliente', 'Clientes IPTV', NULL),
(31, 1, 'Cliente', 'Revendedores IPTV', NULL),
(114, 17, 'Cliente', 'IPTV', NULL),
(122, 1, 'Cliente', 'Internet', NULL),
(119, 18, 'Cliente', 'IPTV', NULL),
(106, 16, 'Cliente', 'Clientes 100MB', NULL),
(104, 15, 'Cliente', 'P2P', NULL),
(98, 1, 'Dívida', 'Dívidas', NULL),
(105, 15, 'Cliente', 'REVENDEDOR', NULL),
(103, 15, 'Cliente', 'IPTV', NULL);

INSERT INTO folder_settings (folder_id, near_due_days, far_due_days) VALUES
(3, 2, 2),
(5, 3, 3),
(12, 3, 3),
(13, 3, 3),
(14, 3, 3),
(29, 3, 3),
(30, 3, 3),
(31, 3, 3),
(98, 3, 3),
(103, 3, 3),
(104, 3, 3),
(105, 3, 3),
(106, 3, 3),
(119, 2, 2),
(114, 3, 3),
(122, 3, 3);

INSERT INTO folder_messages (id, folder_id, message) VALUES
(1, 3, '{getGreeting}

? Lembrete da "IPTV" ?

Usuário: {item_id}

{dateText} {due_date}

Não esqueça de renovar para continuar assistindo sem interrupções.

Aproveite seus programas favoritos! ??

> Obrigado pela sua preferência! ?'),
(2, 5, 'Mensagem específica para a pasta Banda larga 30MB');

INSERT INTO items (id, folder_id, item_id, name, due_date, phone, status, price, notes, created_at, is_active) VALUES
(1051, 3, '473917283', 'João Primo IboCQ', '2026-08-26', '+5571994119424', 'Sem Vencimento', 30, 'Mac Address: 23:44:AB:80:0E:AB
Device Key: 747729', '2024-02-21 00:00:00', TRUE),
(1050, 3, '441113572', 'xota natu', '2024-10-30', '+5571986164082', 'Sem Vencimento', 30, NULL, '2024-09-29 00:00:00', TRUE),
(2315, 122, '1', 'Kauan', '2026-07-15', '+557198622-3211', 'Sem Vencimento', 50, NULL, '2026-04-15 00:00:00', TRUE),
(1047, 3, '377693275', 'Caique tolate', '2026-08-25', '+557191792992', 'Sem Vencimento', 60, NULL, '2024-02-29 00:00:00', TRUE),
(1046, 3, '639924176', 'Biel Castro', '2026-08-24', '+557186172272', 'Sem Vencimento', 30, NULL, '2024-05-20 00:00:00', TRUE),
(1045, 3, '399166346', 'Alef Ragah', '2026-08-19', '+5571986840886', 'Sem Vencimento', 30, NULL, '2024-06-28 00:00:00', TRUE),
(1044, 3, '34615128', 'Gal NETGOOL', '2024-11-02', '+5571993756320', 'Sem Vencimento', 30, NULL, '2024-05-23 00:00:00', TRUE),
(1043, 3, '523893325', 'Nilton Cristina', '2026-08-21', '+557187341834', 'Sem Vencimento', 44.9, NULL, '2024-10-02 00:00:00', TRUE),
(1042, 3, '57848839', 'Tamires lorena', '2026-08-21', '+5571992621895', 'Sem Vencimento', 30, NULL, '2024-05-31 00:00:00', TRUE),
(1041, 3, '96239966', 'Richard', '2024-12-26', '+5571992520681', 'Sem Vencimento', 30, NULL, '2024-10-03 00:00:00', TRUE),
(1040, 3, '36115150', 'André Pai Andressa', '2026-05-03', '+557191996305', 'Sem Vencimento', 20, NULL, '2024-05-26 00:00:00', TRUE),
(1039, 3, '1112544', 'Tio Fernando', '2026-08-21', '+557188187209', 'Sem Vencimento', 35, NULL, '2024-05-31 00:00:00', TRUE),
(1038, 3, '626208758', 'Carol prima de andressa', '2026-08-18', '+557182505536', 'Sem Vencimento', 30, NULL, '2024-10-04 00:00:00', TRUE),
(1037, 3, '758406530', 'Tadeu padrasto cadu', '2025-11-21', '+557191729678', 'Sem Vencimento', 30, NULL, '2024-10-05 00:00:00', TRUE),
(1036, 3, '168618488', 'Gilmar andre netgool', '2024-12-06', '+5571984727465', 'Sem Vencimento', 30, NULL, '2024-05-01 00:00:00', TRUE),
(2120, 3, '168762124', 'Leonardo ddd71', '2026-08-26', '+5571981343341', 'Sem Vencimento', 30, NULL, '2025-06-20 00:00:00', TRUE),
(1033, 3, '774323052', 'Fernando Fernandes DDD 83', '2024-11-05', '+5583996043884', 'Sem Vencimento', 30, NULL, '2024-10-05 00:00:00', TRUE),
(1032, 3, '19023944', 'Neilton Alencar', '2026-08-22', '+557188161090', 'Sem Vencimento', 30, NULL, '2024-09-04 00:00:00', TRUE),
(1031, 3, '452452452', 'deisiane vinicius', '2026-08-19', '+557186407786', 'Sem Vencimento', 30, NULL, '2024-05-04 00:00:00', TRUE),
(1030, 3, '7545558', 'Gleidson poli', '2024-11-07', '+5571992461100', 'Sem Vencimento', 30, NULL, '2024-06-04 00:00:00', TRUE),
(1029, 3, '573987687', 'João JT', '2026-01-31', '+5571987525223', 'Sem Vencimento', 30, NULL, '2024-03-03 00:00:00', TRUE),
(1028, 3, '555417172', 'Caio Irmão', '2024-11-08', '+5571986262579', 'Sem Vencimento', 30, NULL, '2024-10-08 00:00:00', TRUE),
(1027, 3, '777752317', 'Viviane Sogra de João', '2025-08-24', '+557191917915', 'Sem Vencimento', 30, NULL, '2024-06-06 00:00:00', TRUE),
(1026, 3, '294710979', 'Geilson PI Xcloud', '2026-03-05', '+557399144978', 'Sem Vencimento', 29.8, NULL, '2024-02-01 00:00:00', TRUE),
(1025, 3, '383947201', 'Everaldo Netgool', '2026-04-02', '+5571999003535', 'Sem Vencimento', 20, NULL, '2024-04-05 00:00:00', TRUE),
(1024, 3, '54632310', 'jeanzinho', '2026-07-29', '+557188627055', 'Sem Vencimento', 30, NULL, '2024-10-10 00:00:00', TRUE),
(1670, 106, 'luiz', 'luiz', '2026-08-20', '+55 71 9305-283', 'Sem Vencimento', 50, 'Cliente pagou R$:100,00
Só vai pagar até 20/08', '2025-03-24 00:00:00', TRUE),
(1022, 3, '356005546', 'Jefinho Irmão de jessica', '2026-07-26', '+557184504772', 'Sem Vencimento', 30, NULL, '2024-10-11 00:00:00', TRUE),
(1021, 3, '958353987', 'Rafael - Chapa Quente', '2026-08-16', '+557182100833', 'Sem Vencimento', 30, '3 telas por R$30,00', '2024-09-10 00:00:00', TRUE),
(1020, 3, '647492926', 'Altamiro vizinho', '2026-08-26', '+557182724040', 'Sem Vencimento', 30, NULL, '2024-05-09 00:00:00', TRUE),
(1019, 3, '9994884', 'Davidson vizinho', '2026-05-19', '+557191278425', 'Sem Vencimento', 30, NULL, '2024-05-10 00:00:00', TRUE),
(2228, 3, '981900389', 'Marcos ddd11', '2025-10-27', '+551199546-9987', 'Sem Vencimento', 29.8, NULL, '2025-09-26 00:00:00', TRUE),
(1017, 3, '116412822', 'Jessica Andressa', '2026-07-02', '+5571991386673', 'Sem Vencimento', 30, NULL, '2024-06-01 00:00:00', TRUE),
(1015, 3, '496464818', 'Junior de kevin', '2026-09-04', '+557192078999', 'Sem Vencimento', 30, NULL, '2024-04-12 00:00:00', TRUE),
(1014, 3, '531441825', 'Davi de levi', '2026-08-27', '+5571991871455', 'Sem Vencimento', 30, NULL, '2024-04-16 00:00:00', TRUE),
(1013, 3, '24542157', 'Cristina Altamiro', '2026-08-31', '+557187776035', 'Sem Vencimento', 30, NULL, '2024-07-17 00:00:00', TRUE),
(1012, 3, '87675811', 'Alessandra lorena prima', '2026-06-03', '+557188867486', 'Sem Vencimento', 30, NULL, '2024-05-09 00:00:00', TRUE),
(1011, 3, '652686345', 'Cadu ubas Xcloud', '2026-08-06', '+557191729678', 'Sem Vencimento', 30, NULL, '2024-02-03 00:00:00', TRUE),
(1010, 3, '54518191', 'Isidio Moura', '2026-08-17', '+557187699927', 'Sem Vencimento', 44.9, NULL, '2024-04-09 00:00:00', TRUE),
(1009, 3, '81297485', 'Tatiane Pessoa Cliente Xcloud', '2026-08-14', '+557191365128', 'Sem Vencimento', 30, NULL, '2024-02-17 00:00:00', TRUE),
(1008, 3, '932309825', 'Jean STF Xcloud', '2026-05-24', '+557182128484', 'Sem Vencimento', 30, NULL, '2024-02-04 00:00:00', TRUE),
(1007, 3, '5134818919', 'Luiz Carlos João Xcloud', '2026-08-09', '+557192384421', 'Sem Vencimento', 30, NULL, '2024-02-15 00:00:00', TRUE),
(1006, 3, '518181', 'Marcelo Rua Xcloud', '2026-08-08', '+557183567641', 'Sem Vencimento', 30, NULL, '2024-01-17 00:00:00', TRUE),
(1005, 3, '183314668', 'Gerson ian', '2026-08-17', '+557188005198', 'Sem Vencimento', 30, NULL, '2024-07-18 00:00:00', TRUE),
(1004, 3, '646455', 'Eliete vó', '2026-07-07', '+557191314941', 'Sem Vencimento', 30, NULL, '2024-05-25 00:00:00', TRUE),
(1003, 3, '986999436', 'Matheus DDD83', '2024-11-24', '+5583988540312', 'Sem Vencimento', 30, NULL, '2024-09-23 00:00:00', TRUE),
(1667, 106, 'junior', 'junior', '2026-08-07', '+5571988632351', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1001, 3, '215433542', 'Ramon Rua', '2024-11-26', '+5571991843513', 'Sem Vencimento', 30, NULL, '2024-07-24 00:00:00', TRUE),
(1000, 3, '895941628', 'Antonio DDD 83', '2024-11-26', '+5583987951702', 'Sem Vencimento', 30, NULL, '2024-09-25 00:00:00', TRUE),
(999, 3, '179501790', 'André Netgool', '2026-08-04', '+557199366866', 'Sem Vencimento', 30, 'Utiliza o XC IPTV', '2024-05-21 00:00:00', TRUE),
(998, 3, '83322258', 'Wallace Kevin', '2026-08-09', '+557581724715', 'Sem Vencimento', 30, 'IPTV Smarters', '2024-04-23 00:00:00', TRUE),
(997, 3, '51551124', 'Noelia Ribeiro - Theilane', '2026-08-09', '+557188590161', 'Sem Vencimento', 52.9, 'Prime IPTV', '2024-07-26 00:00:00', TRUE),
(2211, 3, '745970016', 'Lineia Ddd62', '2025-12-26', '+5562 9373-5338', 'Sem Vencimento', 29.8, NULL, '2025-08-17 00:00:00', TRUE),
(995, 3, '807391052', 'Leo Jean IboCQ', '2026-08-16', '+5571987783521', 'Sem Vencimento', 30, '50 Megas', '2024-01-18 00:00:00', TRUE),
(2208, 3, '246834307', 'Alana ddd35', '2025-10-12', '+5535 9993-3807', 'Sem Vencimento', 29.8, NULL, '2025-08-11 00:00:00', TRUE),
(2207, 3, '349878121', 'Luiz De Pi', '2026-05-23', '+5571993052830', 'Sem Vencimento', 30, NULL, '2025-08-07 00:00:00', TRUE),
(2235, 3, '637730649', 'Luiz Eduardo De Rafael Chapaquente', '2026-08-14', '+5571 9160-6380', 'Sem Vencimento', 38, NULL, '2025-10-06 00:00:00', TRUE),
(2205, 3, '220334074', 'Rafael ddd71', '2025-09-02', '+557198384-8822', 'Sem Vencimento', 29.9, NULL, '2025-08-02 13:33:52', TRUE),
(2209, 106, 'Daniela', 'Daniela', '2026-08-06', '+557191281408', 'Sem Vencimento', 50, NULL, '2025-08-11 00:00:00', TRUE),
(2238, 3, '163861193', 'André Roda Ddd94', '2025-11-21', '+5594 9122-2162', 'Sem Vencimento', 30, NULL, '2025-10-21 03:30:42', TRUE),
(2119, 3, '736321340', 'Andressa ddd27', '2025-07-15', '+552799702-4934', 'Sem Vencimento', 30, NULL, '2025-06-14 19:36:28', TRUE),
(2122, 3, '149857197', 'Williams amigo de tifani', '2025-07-24', '+5571988736914', 'Sem Vencimento', 30, NULL, '2025-06-22 16:31:23', TRUE),
(1553, 3, '123456', 'Lucas amigo', '2026-07-20', '+557199219-4551', 'Sem Vencimento', 25, NULL, '2025-03-20 00:00:00', TRUE),
(2204, 3, '278011563', 'Thierry', '2026-04-04', '+557198831-7165', 'Sem Vencimento', 35, 'Prime iptv - 0C:8E:29:02:30:BE

T&E - 4D:88:61:D9:89:D1
Key : 774251', '2025-07-30 00:00:00', TRUE),
(2203, 3, '105249793', 'Ricardo de Lilian', '2027-07-23', '+5571 8483-4523', 'Sem Vencimento', 24.17, NULL, '2025-07-23 00:00:00', TRUE),
(1550, 3, '807431997', 'Diego cadu ubas', '2025-06-10', '+557193889991', 'Sem Vencimento', 30, NULL, '2025-03-20 00:00:00', TRUE),
(1797, 3, '179878809', 'Lolly Bogoia', '2025-11-27', '+5571996240631', 'Sem Vencimento', 30, NULL, '2025-04-15 00:00:00', TRUE),
(1691, 3, '227637154', 'Rafael ddd45', '2026-07-31', '+55459115-4769', 'Sem Vencimento', 30, NULL, '2025-03-29 00:00:00', TRUE),
(2126, 3, '172134714', 'Caique De Cadu', '2025-08-28', '+5571999413278', 'Sem Vencimento', 30, NULL, '2025-06-27 00:00:00', TRUE),
(2217, 106, 'Cesar', 'Cesar', '2026-08-20', '+557192529991', 'Sem Vencimento', 50, NULL, '2025-08-30 00:00:00', TRUE),
(2202, 29, '491349335', 'Raniel', '2025-11-22', '+5524992172912', 'Sem Vencimento', 40, NULL, '2025-07-21 00:00:00', TRUE),
(2292, 3, '384872954', 'mairon ddd 42', '2026-08-22', '+5542 9956-8070', 'Sem Vencimento', 35, NULL, '2026-03-07 00:00:00', TRUE),
(1611, 103, '2727272', 'Carla Ribeiro', '2024-09-07', '+5511721098765', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1808, 3, '94658340', 'Iago Jr black', '2025-08-07', '+5575998896068', 'Sem Vencimento', 30, NULL, '2025-04-29 00:00:00', TRUE),
(2117, 3, '274515327', 'Dão Tio De Vanessa De Altamiro', '2025-10-28', '+557598174-9259', 'Sem Vencimento', 30, NULL, '2025-06-10 00:00:00', TRUE),
(2326, 3, '571055169', 'Flavio De Danilo', '2026-08-26', '+551198142-5841', 'Sem Vencimento', 30, NULL, '2026-05-26 00:00:00', TRUE),
(1806, 3, '803214749', 'GUTEMBERG de ruan de davidson', '2026-08-20', '+557199903-0630', 'Sem Vencimento', 38, NULL, '2025-04-25 00:00:00', TRUE),
(1804, 3, '311490488', 'Anderson de Jorge de Alencar', '2026-07-19', '+5571984171649', 'Sem Vencimento', 35, '
filhos mac abaixo 80 reais
1 tela e 1 celular titular
1 tv 2 celular filhos

Mac Address: BA:06:0F:0F:BE:2F
Device Key: 760440


Mac Address: 8F:C6:82:05:4B:E5
Device Key: 829588

Mac Address: D0:F4:8A:B4:A6:2D
Device Key: 996884', '2025-04-23 00:00:00', TRUE),
(1803, 3, '335519894', 'Luiza namorada de Joao de wallace', '2025-07-21', '+5571991256224', 'Sem Vencimento', 30, NULL, '2025-04-19 00:00:00', TRUE),
(1177, 3, '891075674', 'Caique ATENTO andressa', '2026-07-15', '+557199720-8178', 'Sem Vencimento', 29, '18:71:22:10:57:39
prime', '2024-11-09 00:00:00', TRUE),
(1176, 3, '213199870', 'Williane Ddd 65', '2026-07-21', '+5565 9279-3513', 'Sem Vencimento', 30, NULL, '2024-08-16 00:00:00', TRUE),
(1124, 3, '952324585', 'Daniel Bueno', '2026-12-09', '+17868623750', 'Sem Vencimento', 24.16, 'Cliente EUA 1 ano
', '2024-09-14 00:00:00', TRUE),
(1052, 3, '414295757', 'Banana Guilherme banda', '2026-06-03', '+557198275-8583', 'Sem Vencimento', 30, NULL, '2024-08-21 00:00:00', TRUE),
(1053, 3, '429374985', 'Wadson Banda', '2026-08-23', '+557198356-4797', 'Sem Vencimento', 44.9, NULL, '2024-09-25 00:00:00', TRUE),
(1054, 3, '542751845', 'Francine INSTA DDD31', '2024-12-25', '+5571986164082', 'Sem Vencimento', 30, NULL, '2024-07-18 00:00:00', TRUE),
(1055, 3, '999613270', 'Aline ddd 63', '2024-10-24', '+556392774730', 'Sem Vencimento', 30, NULL, '2024-09-23 00:00:00', TRUE),
(2212, 3, '774911414', 'Israel Derrama', '2026-02-19', '+557198173-6875', 'Sem Vencimento', 30, NULL, '2025-08-25 00:00:00', TRUE),
(1802, 3, '236670226', 'Eliezer 44,90', '2025-12-26', '+551299189-4605', 'Sem Vencimento', 44.99, NULL, '2025-04-19 00:00:00', TRUE),
(1722, 114, 'IPTV', 'Kleber Claudia', '2025-12-06', '+557199173-4819', 'Sem Vencimento', 45, NULL, '2025-04-10 00:00:00', TRUE),
(1059, 3, '628327287', 'Carlos tia eliane', '2025-10-24', '+557182108867', 'Sem Vencimento', 30, NULL, '2024-09-16 00:00:00', TRUE),
(1060, 3, '722646629', 'William Wallace de Noelia', '2025-08-13', '+5571992681334', 'Sem Vencimento', 44.9, NULL, '2024-11-06 00:00:00', TRUE),
(1061, 3, '9132451', 'Vitoria Netgool', '2024-10-18', '+5571986164082', 'Sem Vencimento', 30, 'Informou que não ia renovar', '2024-08-16 00:00:00', TRUE),
(1062, 3, '514405069', 'Renan Oliveira DDD73', '2025-06-24', '+557381204759', 'Sem Vencimento', 30, NULL, '2024-07-10 00:00:00', TRUE),
(1063, 3, '81464432', 'Hozana DDD22', '2024-10-17', '+5522998019696', 'Sem Vencimento', 30, NULL, '2024-08-15 00:00:00', TRUE),
(1064, 3, '561561521', 'Mauricio Helber', '2025-11-16', '+557192882607', 'Sem Vencimento', 30, NULL, '2024-04-30 00:00:00', TRUE),
(1066, 3, '370089801', 'Gustavo DDD 54', '2024-10-07', '+555496371923', 'Sem Vencimento', 30, NULL, '2024-11-06 00:00:00', TRUE),
(1076, 3, '3899363', 'Vitinho', '2026-02-19', '+5571986164082', 'Longe de Vencer', 0, NULL, '2024-11-06 17:11:22', TRUE),
(2328, 106, 'Alvaro', 'Alvaro', '2026-08-20', '+55 71 9655-549', 'Sem Vencimento', 50, 'Cliente tem essa cortesia até o dia 
20/08/2026.
', '2026-06-05 04:20:37', TRUE),
(2111, 106, 'Michele', 'Michele', '2026-08-20', '+5571983269629', 'Sem Vencimento', 50, NULL, '2025-06-01 00:00:00', TRUE),
(1081, 31, '1', 'Eron', NULL, '+5571986164082', 'Sem Vencimento', 400, '44 clientes - 80x5= 400', '2024-11-06 00:00:00', TRUE),
(1083, 31, '2', 'Jorginho', NULL, '+5571986164082', 'Sem Vencimento', 80, '11clientes- 80x1= 80', '2024-11-06 00:00:00', TRUE),
(1666, 106, 'joaquim', 'joaquim', '2026-08-20', '+5571987889966', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1131, 98, '1', 'TARCIO', '2024-10-29', '+5571986164082', 'Sem Vencimento', 300, 'JUROS 3%', '2024-11-06 17:11:22', TRUE),
(1132, 98, '2', 'Tarcisio', '2024-11-20', '+5571986164082', 'Sem Vencimento', 2000, 'JUROS 2%', '2024-11-06 17:11:22', TRUE),
(1133, 98, '3', 'GYJH', '2024-11-06', '+5571986164082', 'Sem Vencimento', 250, 'JUROS 4', '2024-11-06 17:11:22', TRUE),
(1135, 98, '33', 'HJBJJB', NULL, '+55', 'Sem Vencimento', 0, NULL, '2024-11-06 17:11:22', TRUE),
(1140, 3, '635637856', 'Tarcisio e Outros', '2026-06-15', '+5571992520681', 'Sem Vencimento', 0, 'Khall CELULAR - 22:59:B0:F2:43:9E
554476

Khall TV: D2:E8:31:CB:1A:A8
Device Key: 811255

Khall TV Sala
Mac Address: 0B:C7:B8:74:C3:1B
Device Key: 597535

Richard 0A:FE:6D:D3:E0:72
226715


Meu celular - B8:E8:B3:8E:90:1F
326420

TV Quarto - 8E:58:C6:B5:25:F3
576365

Funplay SALA - Tarcisio
e8:aa:cb:7e:d7:2a
153802

Theylane - 96:0A:87:72:55:6D
351954

Lazer Play
Lore - 70:09:71:84:05:4e
672391

Kauan vizinho prime iptv
B0:37:95:9D:3D:AA
854200', '2024-01-15 00:00:00', TRUE),
(1609, 103, '2525252', 'Felipe Andrade', '2024-11-09', '+5511743210987', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1145, 98, 'Feijao', 'Campeão', NULL, NULL, 'Sem Vencimento', 8.78, NULL, '2024-11-07 12:14:31', TRUE),
(1610, 103, '2626262', 'Marcio Rocha', '2024-10-08', '+5511732109876', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1608, 103, '2424242', 'Rosana Pereira', '2024-12-10', '+5511754321098', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1605, 103, '2020202', 'Leonardo Souza', '2024-04-22', '+5511798765432', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1607, 103, '2222222', 'Vitor Almeida', '2024-02-20', '+5511776543210', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1159, 98, '2', '2 novembro', NULL, '+55', 'Sem Vencimento', 230, NULL, '2024-11-07 19:30:27', TRUE),
(1158, 98, '1', '1 novembro', NULL, '+55', 'Sem Vencimento', 200, NULL, '2024-11-07 19:30:02', TRUE),
(2114, 3, '830609882', 'João de Anderson de Jr black', '2026-07-16', '+5571992612754', 'Sem Vencimento', 30, NULL, '2025-06-07 00:00:00', TRUE),
(1606, 103, '2121212', 'Cristina Lima', '2024-03-21', '+5511787654321', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1179, 3, '643688', 'Diego M7', '2024-12-14', '+5571984354655', 'Sem Vencimento', 30, NULL, '2024-11-13 00:00:00', TRUE),
(2213, 3, '343924041', 'Mãe de vinicius poli', '2025-12-05', '+5571 8373-9054', 'Sem Vencimento', 30, NULL, '2025-08-28 00:00:00', TRUE),
(2113, 3, '976077304', 'Daniel Cerqueira motoboy ifood', '2025-07-05', '+5571991033546', 'Sem Vencimento', 30, NULL, '2025-06-03 16:26:32', TRUE),
(1200, 3, '262884334', 'Daniela super andressa', '2025-07-07', '+5571988174947', 'Sem Vencimento', 30, NULL, '2024-11-28 00:00:00', TRUE),
(1799, 3, '709989101', 'Lucas de Valmar - namorada dele', '2026-06-28', '+5571993369766', 'Sem Vencimento', 30, NULL, '2025-04-17 00:00:00', TRUE),
(2110, 3, '556122438', 'Patrick ddd54', '2025-07-01', '+5551995602822', 'Sem Vencimento', 30, NULL, '2025-05-31 18:13:51', TRUE),
(1798, 3, '64078471', 'Jorge Alencar', '2025-06-25', '+5571999296665', 'Sem Vencimento', 30, NULL, '2025-04-15 00:00:00', TRUE),
(2246, 30, 'thayna3468', 'Thayná', '2025-11-23', '+5511001247342', 'Sem Vencimento', 36.9, NULL, '2025-11-03 09:15:43', TRUE),
(2177, 106, 'adailta', 'Adailta', '2026-08-20', '+557196225964', 'Sem Vencimento', 50, NULL, '2025-07-19 00:00:00', TRUE),
(1891, 3, '305688447', 'Thayna Barbara ddd45', '2025-08-21', '+5545991154769', 'Sem Vencimento', 30, NULL, '2025-05-19 00:00:00', TRUE),
(1805, 3, '990760389', 'Filé', '2025-05-25', '+5521987626679', 'Sem Vencimento', 30, NULL, '2025-04-24 18:54:09', TRUE),
(2115, 3, '897321180', 'Elvis ddd34', '2026-08-29', '+5534999749954', 'Sem Vencimento', 29.9, NULL, '2025-06-08 00:00:00', TRUE),
(2116, 3, '32798557', 'Jeane', '2025-11-07', '+557199185-2607', 'Sem Vencimento', 30, NULL, '2025-06-10 00:00:00', TRUE),
(1604, 103, '1919191', 'Juliana Nascimento', '2024-05-23', '+5511809876543', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(2201, 29, '9149235921', 'Amanda', '2025-11-21', '+5532999040765', 'Sem Vencimento', 62.3, NULL, '2025-07-21 00:00:00', TRUE),
(2200, 29, '593553000000', 'Ademir / Lucia', '2025-11-20', '+5571996199246', 'Sem Vencimento', 44.9, NULL, '2025-07-21 00:00:00', TRUE),
(2173, 3, '382072806', 'Rui Pai De Mirela', '2026-04-11', '+557198678-2343', 'Sem Vencimento', 30, 'Mac Address: 70:39:6D:C8:02:7E
Device Key: 728705

T&E
', '2025-07-05 00:00:00', TRUE),
(1699, 106, 'Juliana', 'Juliana', '2026-08-03', '+5571985057826', 'Sem Vencimento', 50, NULL, '2025-05-08 00:00:00', TRUE),
(1810, 119, '431948151', 'Ademilson', '2025-07-09', '+5571986164082', 'Sem Vencimento', 30, NULL, '2025-05-07 17:21:17', TRUE),
(1811, 119, '476548988', 'Aila', '2025-06-02', '+5571986164082', 'Sem Vencimento', 30, NULL, '2025-05-07 17:21:51', TRUE),
(1812, 3, '155912132', 'Lorena de dão', '2026-08-16', '+5571988796453', 'Sem Vencimento', 35, NULL, '2025-05-08 00:00:00', TRUE),
(1603, 103, '1818181', 'Lucas Teixeira', '2024-06-24', '+5511810987654', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1602, 103, '1717171', 'Larissa Pires', '2024-07-25', '+5511821098765', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1601, 103, '1616161', 'Rafael Gomes', '2024-08-26', '+5511832109876', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1600, 103, '1516161', 'Isabella Cordeiro', '2024-09-27', '+5511843210987', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1599, 103, '1414141', 'Cleber Dias', '2024-10-28', '+5511854321098', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1598, 103, '1313131', 'Sofia Santos', '2024-11-29', '+5511865432109', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1597, 103, '1212121', 'Diego Carvalho', '2024-12-30', '+5511876543210', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1595, 103, '1010101', 'Guilherme Martins', '2024-02-05', '+5511898765432', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1596, 103, '1111111', 'Aline Pereira', '2024-01-01', '+5511887654321', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1594, 103, '9090909', 'Patrícia Rocha', '2024-03-10', '+5511909876543', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1593, 103, '8989898', 'André Barbosa', '2024-04-15', '+5511910987654', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1592, 103, '7878787', 'Fernanda Almeida', '2024-05-20', '+5511921098765', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1591, 103, '6767676', 'Roberto Ferreira', '2024-06-25', '+5511932109876', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1590, 103, '5656565', 'Mariana Lima', '2024-07-01', '+5511943210987', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(2112, 3, '408246590', 'Richard ddd83', '2026-08-04', '+5583988593613', 'Sem Vencimento', 46, 'T&E

3E:5B:9B:38:72:73
464024

Celular
Mac Address: 67:69:6C:6D:79:E1
Device Key: 872555', '2025-06-01 00:00:00', TRUE),
(1551, 3, '999072783', 'helber guitar', '2025-03-17', '+557193330671', 'Sem Vencimento', 10, NULL, '2025-03-20 00:00:00', TRUE),
(2199, 29, '1503172777', 'Jorge', '2025-11-17', '+5571981503147', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2234, 3, '383672160', 'Elineide Mãe de caique de andressa', '2026-02-05', '+557198919-0684', 'Sem Vencimento', 29, NULL, '2025-10-04 00:00:00', TRUE),
(2198, 29, '2831923612...', 'Andressa(Instagram)', '2025-11-17', '+553299298603', 'Sem Vencimento', 44.9, NULL, '2025-07-21 00:00:00', TRUE),
(2248, 29, '737571856', 'Caique Ribeiro', '2025-11-16', '+5571982368540', 'Sem Vencimento', 30, NULL, '2025-11-03 10:18:48', TRUE),
(2196, 29, '812968717', 'Caroline', '2025-11-12', '+5571982022447', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2195, 29, '6187380767', 'Felipe', '2025-11-29', '+5571988225510', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2193, 29, '140048351', 'Luciano', '2025-12-12', '+557196008238', 'Sem Vencimento', 50, NULL, '2025-07-21 00:00:00', TRUE),
(2192, 29, '36626366988', 'Paulo Cesar', '2025-11-10', '+5524998484210', 'Sem Vencimento', 69.9, NULL, '2025-07-21 00:00:00', TRUE),
(2191, 29, '799006943', 'Alefe', '2025-11-08', '+5571994014374', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2190, 29, '917430623', 'Caíque', '2025-11-16', '+5571982368540', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2249, 3, '768030227', 'Jacqueline Ddd 98', '2025-12-05', '+559899183-3376', 'Sem Vencimento', 29.8, NULL, '2025-11-04 13:28:39', TRUE),
(2187, 29, '73842487274', 'Elias', '2025-12-06', '+557192167786', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2188, 29, '825173032', 'Eduardo', '2025-12-07', '55 21 997458002', 'Sem Vencimento', 69.9, NULL, '2025-07-21 00:00:00', TRUE),
(2185, 29, '78898747892', 'Digão', '2025-12-04', '+5551984101966', 'Sem Vencimento', 50, 'Desconto no plano Familia', '2025-07-21 00:00:00', TRUE),
(2184, 29, '407729998', 'Tarcísio', '2025-11-13', '+5571986679170', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(2182, 29, '887182000000', 'Aline', '2025-10-28', '+5548999034333', 'Sem Vencimento', 35, NULL, '2025-07-21 00:00:00', TRUE),
(2183, 29, '82535214258', 'Andreia Xavier', '2025-12-02', '+5571992876859', 'Sem Vencimento', 62.3, NULL, '2025-07-21 00:00:00', TRUE),
(1527, 3, '700060957', 'sapo 2', '2025-02-16', '+557192980889', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(1526, 3, '639198709', 'Viviane sobrinha de Adriana', '2025-02-21', '+557191800273', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(1524, 3, '87204947', 'Gustavo Lucas Mello', '2025-03-05', '+557191616412', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(1525, 3, '155390195', 'Débora DDD98', '2025-03-04', '+559899088825', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(2181, 29, '606645676', 'Rita', '2025-11-03', '+5571987950384', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(1522, 3, '440165396', 'Kamily ddd41', '2025-03-06', '+554198704825', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(1521, 3, '415738282', 'erick murilo ddd81', '2025-03-15', '+558182255862', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(2179, 29, '898269796', 'Diego', '2025-11-29', '+557191152590', 'Sem Vencimento', 35, NULL, '2025-07-21 00:00:00', TRUE),
(1520, 3, '769893115', 'Lucas Valmar', '2026-06-08', '+557199336-9766', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(2180, 29, '797618178', 'Alex', '2025-11-26', '+5571992068569', 'Sem Vencimento', 44.9, NULL, '2025-07-21 00:00:00', TRUE),
(1518, 3, '774783245', 'magdiel ddd89', '2025-07-01', '+558994719503', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1517, 3, '186327348', 'João Guilherme de wallace', '2026-06-15', '+557191256224', 'Sem Vencimento', 30, 'MAC PRIME IPTV
14:7F:67:5E:83:32
e7:db:f0:9e:ed:c2
64:E4:A5:84:B4:BE', '2025-03-18 00:00:00', TRUE),
(1515, 3, '798074988', 'Josi CoJack barraca praia', '2026-06-10', '+557182863103', 'Sem Vencimento', 44.8, NULL, '2025-03-18 00:00:00', TRUE),
(1516, 3, '805566864', 'Jorgin de alex do esposo de andreia', '2026-06-03', '+557188287272', 'Sem Vencimento', 35, NULL, '2025-03-18 00:00:00', TRUE),
(1514, 3, '648742751', 'Alana Ian', '2025-07-27', '+557181548430', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1513, 3, '524937221', 'ruan barreto de davidson', '2026-08-16', '+557199400544', 'Sem Vencimento', 30, NULL, '2024-04-19 00:00:00', TRUE),
(1512, 3, '84452189', 'Liane sogra de vinicius', '2026-08-08', '+557183164410', 'Sem Vencimento', 30, NULL, '2024-08-14 00:00:00', TRUE),
(1511, 3, '690585021', 'tio xandy', '2026-08-15', '+557192191376', 'Sem Vencimento', 30, 'Renovei
Falou que ia pagar sexta
24/10', '2025-03-18 00:00:00', TRUE),
(1509, 3, '799055846', 'Giovana ddd19', '2026-07-26', '+5519982139809', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1510, 3, '329484918', 'sobreira Vitor', '2026-01-18', '+557193244862', 'Sem Vencimento', 44.9, 'T&E

VITOR - DB:78:61:2A:2B:74
356431

MAE DELE - 6C:39:EA:E1:9E:3E
400079', '2024-10-23 00:00:00', TRUE),
(1508, 3, '326255676', 'Victor Guilherme ddd19', '2026-08-14', '+5519992815805', 'Sem Vencimento', 50, 'Vitoria - 84:54:82:97:66:38
Key - 567632', '2025-03-18 00:00:00', TRUE),
(1507, 3, '49079308', 'Gel sogro de alex LIQ', '2026-07-22', '+557598343-0009', 'Sem Vencimento', 45, 'TV do sogro de Alex

2 celular de alex
56:6B:D5:78:BB:E6
497566', '2024-11-05 00:00:00', TRUE),
(1506, 3, '395093998', 'tia eliane', '2025-04-02', '+557184005191', 'Longe de Vencer', 30, NULL, '2025-03-18 17:05:24', TRUE),
(1505, 3, '573619868', 'Jamile mãe de João', '2026-08-03', '+5571996403780', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1504, 3, '426936675', 'henrique primoo', '2026-07-24', '+557186007294', 'Sem Vencimento', 20, NULL, '2025-03-18 00:00:00', TRUE),
(1503, 3, '933981975', 'JrBlack Matheus de janaina', '2026-08-24', '+5571982572017', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1502, 3, '125459712', 'cleidson cadu', '2025-09-10', '+557184708980', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1501, 3, '813444023', 'Vanessa Altamiro', '2026-08-13', '+557181496477', 'Sem Vencimento', 30, 'T&E

1F:FF:9E:D0:54:50
760582', '2024-09-13 00:00:00', TRUE),
(1500, 3, '366457269', 'Adriana Noelia', '2026-08-23', '+557187363180', 'Sem Vencimento', 45, NULL, '2025-03-18 00:00:00', TRUE),
(1552, 3, '738198226', 'michele jrblack', '2026-06-22', '+5571983269629', 'Sem Vencimento', 30, NULL, '2025-03-20 00:00:00', TRUE),
(1499, 3, '62146236', 'Matheus Janaina', '2026-08-11', '+557181898318', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1498, 3, '331109078', 'vinicius grande poli', '2026-08-11', '+5571983739054', 'Sem Vencimento', 30, NULL, '2024-06-21 00:00:00', TRUE),
(1497, 3, '161027641', 'Heron Deposito', '2026-08-06', '+557181249363', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1495, 3, '523424873', 'alex big do marido de andria prima', '2026-08-23', '+557192069406', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1494, 3, '259311897', 'Daniel Zidane', '2026-07-28', '+557191109506', 'Sem Vencimento', 30, NULL, '2025-03-18 00:00:00', TRUE),
(1493, 3, '745129018', 'Danilo ddd11', '2026-10-08', '+5511989611806', 'Sem Vencimento', 37.5, NULL, '2025-03-18 00:00:00', TRUE),
(2178, 29, '978500101', 'Caiane Agda', '2025-11-23', '+5571982384916', 'Sem Vencimento', 30, NULL, '2025-07-21 00:00:00', TRUE),
(1589, 103, '4545454', 'Lucas Mendes', '2024-08-05', '+5511954321098', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1588, 103, '3434343', 'Ana Costa', '2025-06-15', '+5511665432109', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1587, 103, '2323232', 'Carlos Santos', '2024-01-19', '+5511765432109', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1586, 103, '5414551', 'Maria Oliveira', '2024-11-20', '+5511987654321', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1585, 103, '1515151', 'João Silva', '2024-12-25', '+5511998765432', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1796, 3, '396097771', 'Goia Banda', '2026-08-26', '+5571993219357', 'Sem Vencimento', 30, NULL, '2025-04-14 00:00:00', TRUE),
(1612, 103, '2828282', 'Jéssica Ferreira', '2024-08-06', '+5511710987654', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1613, 103, '2929292', 'Pedro Costa', '2024-07-05', '+5511709876543', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1614, 104, '3131313', 'Julia Martins', '2025-06-30', '+5511698765432', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1615, 104, '3232323', 'Thiago Almeida', '2025-06-25', '+5511687654321', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1616, 103, '3333333', 'Ana Beatriz', '2025-06-20', '+5511676543210', 'Longe de Vencer', 30, NULL, '2025-03-20 16:32:56', TRUE),
(1617, 103, '3535353', 'Natália Ferreira', '2025-03-26', '+5571986164082', 'Sem Vencimento', 30, NULL, '2024-12-03 00:00:00', TRUE),
(1618, 103, '3636363', 'Sérgio Lima', '2025-03-22', '+5511643210987', 'Sem Vencimento', 30, NULL, '2025-03-20 00:00:00', TRUE),
(1619, 103, '3737373', 'Karla Nascimento', '2025-03-22', '+5511632109876', 'Sem Vencimento', 30, NULL, '2025-03-20 00:00:00', TRUE),
(1620, 104, '324325324', 'carlos', '2025-03-22', '+55', 'Sem Vencimento', 50, NULL, '2025-03-20 16:52:13', TRUE),
(1621, 105, '12120021', 'Claudio REVENDEDOR', NULL, '+5571986164082', 'Sem Vencimento', 80, NULL, '2025-03-20 17:23:57', TRUE),
(1622, 3, '261990975', 'Luan ddd38', '2026-03-13', '+553899725065', 'Sem Vencimento', 30, NULL, '2025-03-21 00:00:00', TRUE),
(1807, 3, '408490522', 'Gabriela chapa quente', '2025-11-02', '+5571988385826', 'Sem Vencimento', 30, NULL, '2025-04-26 00:00:00', TRUE),
(2314, 3, '250387259', 'Kleber Do Pirata', '2027-04-23', '+5571987667017', 'Sem Vencimento', 24.17, NULL, '2026-04-23 05:00:50', TRUE),
(2210, 3, '229121352', 'Thais Port Ddd12', '2026-06-23', '+5512996506934', 'Sem Vencimento', 30, NULL, '2025-08-17 00:00:00', TRUE),
(1661, 106, 'hugo', 'hugo', '2026-08-20', '+5571981072091', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(2175, 98, '1', 'London London mensalidade', '2026-08-10', '+5571992019492', 'Sem Vencimento', 230, 'Começou 8 de julho 2025,
Toda a terça e quinta, 14 as 15hrs
4 anos', '2025-07-08 00:00:00', TRUE),
(2108, 3, '839607443', 'Rubival', '2026-08-22', '+557198675-1191', 'Sem Vencimento', 38, NULL, '2025-05-24 00:00:00', TRUE),
(2109, 3, '12494832', 'Valdeci de leo', '2026-08-04', '+5571983340220', 'Sem Vencimento', 30, NULL, '2025-05-25 00:00:00', TRUE),
(2220, 3, '876892666', 'Danilo Santana dadai', '2026-08-24', '+557199179-1164', 'Sem Vencimento', 45, 'dadai

Mac Address: D5:3C:5F:83:A0:6A
Device Key: 877240', '2025-09-13 00:00:00', TRUE),
(1656, 106, 'fabiana', 'fabiana', '2026-08-10', '+5571991776031', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1654, 106, 'buguelo', 'buguelo', '2026-08-06', '+5571985040340', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1653, 106, 'alencar', 'alencar', '2026-08-13', '+5571981945892', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1673, 106, 'merreca', 'merreca', '2026-08-20', '+5571992501179', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1676, 106, 'ramon', 'ramon', '2026-07-31', '+557193067533', 'Sem Vencimento', 60, 'Vai pagar no final de cada Mês!', '2025-03-24 00:00:00', TRUE),
(1677, 106, 'Rannah', 'Rannah', '2026-08-20', '+5575991894287', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1678, 106, 'regina', 'regina', '2026-08-25', '+5571986001655', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1681, 106, 'samara', 'samara', '2026-08-13', '+5571987676189', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(1682, 106, 'sidney', 'sidney', '2026-08-13', '+5571987425795', 'Sem Vencimento', 50, NULL, '2025-03-24 00:00:00', TRUE),
(2231, 98, '3', 'Luna Hapvida', '2026-07-29', '+55', 'Sem Vencimento', 288.55, '1° pagamento 29/08/25 R$313,55
2° pagamento 30/09/25 R$288,55', '2025-08-29 00:00:00', TRUE),
(1689, 3, '897813736', 'Anderson JrBalck', '2025-12-31', '+5571988007284', 'Sem Vencimento', 30, NULL, '2025-03-27 00:00:00', TRUE),
(2230, 98, '2', 'London London livro', '2026-07-20', '+55', 'Sem Vencimento', 240, 'Começou julho
1° pagamento - 05/08/25
4 anos livro troca em 6 em 6 meses', '2025-08-05 00:00:00', TRUE),
(1692, 3, '884464548', 'Alencar Netgool', '2026-03-03', '+5571999263434', 'Sem Vencimento', 20, NULL, '2024-04-08 00:00:00', TRUE),
(1693, 3, '418963169', 'Fernanda ddd27', '2025-06-08', '+5527988882384', 'Sem Vencimento', 44.9, NULL, '2025-04-05 00:00:00', TRUE),
(1694, 3, '927828687', 'Tia Sandra', '2025-06-06', '+5571996014191', 'Sem Vencimento', 30, NULL, '2025-04-05 00:00:00', TRUE),
(1695, 3, '235918394', 'Welber Netgool', '2025-05-05', '+5571991295347', 'Sem Vencimento', 30, NULL, '2025-04-05 18:04:58', TRUE),
(1696, 3, '92843361', 'Débora Cristina ddd98', '2025-05-07', '+5598999088825', 'Sem Vencimento', 45, NULL, '2025-04-06 08:02:24', TRUE),
(1697, 106, 'Nunes', 'Nunes', '2026-08-20', '+5571994027335', 'Sem Vencimento', 50, NULL, '2025-04-06 00:00:00', TRUE),
(2233, 29, '50900551', 'Guilherme(Instagram)', '2025-11-03', '+5547984234452', 'Sem Vencimento', 30, NULL, '2025-10-04 00:00:00', TRUE),
(1704, 114, '555266930', 'Chapinha', '2025-12-12', '71 98629-6878', 'Sem Vencimento', 30, NULL, '2025-04-08 00:00:00', TRUE),
(1705, 114, '507426993', 'Lara Veron', '2026-07-13', '+55 71 98740-93', 'Sem Vencimento', 30, NULL, '2025-04-08 00:00:00', TRUE),
(1706, 114, '93046224', 'Ele Irmao', '2025-12-06', '+5571993046224', 'Sem Vencimento', 30, NULL, '2025-04-08 00:00:00', TRUE),
(1707, 114, '7199293', 'Ivan Tio', '2025-12-20', '+5571992936636', 'Sem Vencimento', 20, NULL, '2025-04-08 00:00:00', TRUE),
(1708, 114, '91389971', 'Jaciara Ivn', '2025-12-05', '+55 71 99194-55', 'Sem Vencimento', 60, NULL, '2025-04-08 00:00:00', TRUE),
(1709, 114, '237178459', 'Sandra', '2025-12-02', '+55 71 98707-72', 'Sem Vencimento', 10, NULL, '2025-07-08 00:00:00', TRUE),
(1710, 114, '695839260', 'Veron', '2025-12-05', '+557198612-8458', 'Sem Vencimento', 30, NULL, '2025-04-08 00:00:00', TRUE),
(1711, 114, '998642472', 'Jaú Feira', '2025-11-25', '+557198612-8458', 'Sem Vencimento', 30, NULL, '2025-10-25 00:00:00', TRUE),
(1712, 114, '423539617', 'Dilsinho Cabra', '2025-12-04', '992631310', 'Sem Vencimento', 30, NULL, '2025-04-08 00:00:00', TRUE),
(2229, 3, '585466568', 'Kelton Vieira Ddd94', '2026-03-24', '+5594 8139-9728', 'Sem Vencimento', 29.8, NULL, '2025-09-29 00:00:00', TRUE),
(2227, 29, '99182872881', 'Antonio(Indicado de Paulo Gustavo)', '2025-11-23', '5511977351725', 'Sem Vencimento', 30, NULL, '2025-09-24 00:00:00', TRUE),
(2225, 3, '700829614', 'Helen prima', '2025-11-19', '+5571 8124-9395', 'Sem Vencimento', 30, NULL, '2025-09-18 00:00:00', TRUE),
(2239, 3, '611939555', 'Rafael Ddd 12', '2026-07-31', '+551298116-5501', 'Sem Vencimento', 44.9, NULL, '2025-10-24 00:00:00', TRUE),
(2224, 106, 'Yasmin', 'Yasmin', '2026-08-04', '+557196766655', 'Sem Vencimento', 50, NULL, '2025-09-16 00:00:00', TRUE),
(2223, 3, '756918448', 'Matheus ddd71', '2026-07-05', '+5571985463420', 'Sem Vencimento', 29.8, NULL, '2025-09-15 00:00:00', TRUE),
(2222, 3, '431729673', 'tio bó, vó irá', '2026-01-05', '+557199271-6496', 'Sem Vencimento', 30, NULL, '2025-09-14 00:00:00', TRUE),
(2221, 3, '381312473', 'Arlindo tio de alef o ragah', '2026-06-26', '+557198690-1307', 'Sem Vencimento', 30, 'a0:d7:f3:07:88:17 
568278
Lazer play', '2025-09-13 00:00:00', TRUE),
(2226, 3, '81192217', 'Paulo de kika', '2026-08-06', '+557198162-7420', 'Sem Vencimento', 30, NULL, '2025-09-24 00:00:00', TRUE),
(2289, 98, '5', 'Tenda caixa', '2026-07-24', '+55', 'Sem Vencimento', 346, '24 de dezembro 2025 - 122,61
19 de janeiro - 389,63
24 de fevereiro - 346,92
24 de março - 435,86
24 de abril - 563,52
25 de maio - 550,99
25 de junho - 568,02
24 de julho - 585,93
', '2026-02-24 00:00:00', TRUE),
(2218, 3, '673480208', 'Duci Ddd33', '2025-10-06', '+5533 9951-2340', 'Sem Vencimento', 29.8, NULL, '2025-09-05 22:53:37', TRUE),
(2216, 3, '637553184', 'Jorge Irmão De Cadu', '2025-09-29', '+5571 9302-2873', 'Sem Vencimento', 30, NULL, '2025-08-29 07:16:17', TRUE),
(2215, 3, '945575892', 'Eliene tia', '2026-08-17', '+5571 8124-9395', 'Sem Vencimento', 30, NULL, '2025-08-28 00:00:00', TRUE),
(2214, 3, '342743502', 'Denise Tia De Ian', '2025-09-28', '+5571 8345-3202', 'Sem Vencimento', 30, NULL, '2025-08-28 07:24:52', TRUE),
(1762, 30, '8916946124', 'Rafael(Instagram)', '2025-11-23', '+558598325144', 'Sem Vencimento', 30, NULL, '2025-04-13 00:00:00', TRUE),
(1761, 30, 'Jucelio1230', 'Jucelio(Wanderson)', '2025-11-10', '+5511985891785', 'Sem Vencimento', 30, NULL, '2025-04-13 00:00:00', TRUE),
(2121, 30, 'monica3340', 'Monica(Rafael)', '2025-11-10', '558597891518', 'Sem Vencimento', 36.9, NULL, '2025-06-22 00:00:00', TRUE),
(1760, 30, 'T309R8778N', 'André', '2025-11-26', '+5571987286864', 'Sem Vencimento', 30, NULL, '2025-04-13 00:00:00', TRUE),
(1758, 30, '863780887', 'Edson(SP)', '2025-11-23', '+5511962580285', 'Sem Vencimento', 30, NULL, '2025-04-13 00:00:00', TRUE),
(1890, 31, '3', 'Wallissom', NULL, '+55 71986164082', 'Sem Vencimento', 80, '7clientes- 80x1= 80', '2025-05-15 00:00:00', TRUE),
(1813, 3, '111597878', 'Montrilho', '2025-06-13', '+5571994173203', 'Sem Vencimento', 30, NULL, '2025-05-12 18:32:27', TRUE),
(2274, 3, '976897837', 'Cida ddd 11', '2026-02-09', '+551194775-2006', 'Sem Vencimento', 29.8, NULL, '2026-01-09 00:00:00', TRUE),
(2232, 98, '4', 'Seguro de vida Itaú', '2026-08-03', '+55', 'Sem Vencimento', 144.6, '500 mil seguro', '2025-10-01 00:00:00', TRUE),
(2236, 106, 'Licia', 'Licia', '2026-08-05', '+557182676640', 'Sem Vencimento', 50, NULL, '2025-10-06 00:00:00', TRUE),
(2237, 3, '63192137', 'Juliana de pi', '2026-03-11', '+5571 8505-7826', 'Sem Vencimento', 29.8, NULL, '2025-10-06 00:00:00', TRUE),
(2240, 3, '568989680', 'Lailson TIO DE LEO DE JEAN', '2026-01-27', '+5571 9337-9746', 'Sem Vencimento', 30, NULL, '2025-10-25 00:00:00', TRUE),
(2241, 3, '975818185', 'Flavio ddd 75', '2026-07-09', '+557598834-7040', 'Sem Vencimento', 30, NULL, '2025-10-26 00:00:00', TRUE),
(2242, 3, '460409288', 'Rosimeire De Caique De Andressa', '2026-04-17', '+557199212-9468', 'Sem Vencimento', 37.8, NULL, '2025-10-29 00:00:00', TRUE),
(2243, 3, '677408491', 'Samuel Ddd34', '2026-08-06', '+553499802-0310', 'Sem Vencimento', 29.8, NULL, '2025-10-29 00:00:00', TRUE),
(2244, 3, '252723401', 'milena de dadai e danilo', '2026-08-05', '+557198639-2627', 'Sem Vencimento', 29.8, NULL, '2025-10-29 00:00:00', TRUE),
(2245, 106, 'Sidclei', 'Sidclei', '2026-08-20', '+557592727852', 'Sem Vencimento', 50, 'Cliente vai pagar todo dia 16 de casa mês.', '2025-10-30 00:00:00', TRUE),
(2247, 30, 'vania1242', 'Vania', '2025-11-13', '+557999978235', 'Sem Vencimento', 36.9, NULL, '2025-11-13 00:00:00', TRUE),
(2250, 3, '465329713', 'Caique Ian', '2026-08-10', '+557198688-3950', 'Sem Vencimento', 29.9, NULL, '2025-11-04 00:00:00', TRUE),
(2286, 3, '410473842', 'Edilaine Ddd 31', '2026-03-23', '+5531 9972-4397', 'Sem Vencimento', 30, NULL, '2026-02-21 03:55:42', TRUE),
(2251, 3, '802730347', 'bárbara De Giovana', '2026-06-29', '+551999286-4946', 'Sem Vencimento', 30, NULL, '2025-11-06 00:00:00', TRUE),
(2293, 3, '324153784', 'Estéfane De Brendo', '2026-08-26', '+5547 9676-3624', 'Sem Vencimento', 45, NULL, '2026-03-08 00:00:00', TRUE),
(2252, 3, '914526444', 'Artemísia Ddd 62', '2025-12-09', '+556299417-3842', 'Sem Vencimento', 30, NULL, '2025-11-08 13:34:31', TRUE),
(2288, 98, '6', 'Tenda parcela', '2026-08-10', '+55', 'Sem Vencimento', 1008.62, NULL, '2026-02-24 00:00:00', TRUE),
(2287, 106, 'Maria Izabel', 'Maria Izabel', '2026-08-20', '+5571 9294-9651', 'Sem Vencimento', 50, NULL, '2026-03-23 00:00:00', TRUE),
(2253, 30, 'feliperet', 'Filipinho', '2025-12-06', '+5571993498204', 'Sem Vencimento', 36.9, NULL, '2025-11-11 00:00:00', TRUE),
(2254, 3, '679279189', 'Vitor De Everaldo Netgool', '2026-08-04', '+557198600-3903', 'Sem Vencimento', 30, NULL, '2025-11-12 00:00:00', TRUE),
(2255, 3, '277680052', 'Priscila Estefany', '2026-02-22', '+557199232-6326', 'Sem Vencimento', 29.9, NULL, '2025-11-16 00:00:00', TRUE),
(2283, 106, 'Larissa', 'Larissa', '2026-08-28', '+55 7191599069', 'Sem Vencimento', 50, NULL, '2026-01-25 00:00:00', TRUE),
(2260, 106, 'Luciana', 'Luciana', '2026-08-17', '71 9683-2474', 'Sem Vencimento', 50, NULL, '2025-12-02 00:00:00', TRUE),
(2258, 3, '511856248', 'Nathan de Ruan de Davidson', '2025-11-26', '+5571 99940-054', 'Sem Vencimento', 30, NULL, '2025-11-28 14:58:32', TRUE),
(2282, 3, '516591919', 'Jean irmão de gome , luiza namorada', '2026-08-26', '+557199134-5612', 'Sem Vencimento', 29.8, NULL, '2026-01-20 00:00:00', TRUE),
(2256, 3, '962701494', 'Renê De Jesus', '2025-12-25', '+557199170-4663', 'Sem Vencimento', 29.8, NULL, '2025-11-24 00:00:00', TRUE),
(2263, 3, '340612865', 'lucas de vinicius poli', '2026-08-17', '+557198674-4370', 'Sem Vencimento', 29.8, NULL, '2025-12-12 00:00:00', TRUE),
(2257, 3, '895224140', 'Evandro Irmão De Anderson', '2025-12-29', '+557199106-5953', 'Sem Vencimento', 30, NULL, '2025-11-27 00:00:00', TRUE),
(2259, 3, '223311683', 'Goma', '2026-06-13', '+557199158-7403', 'Sem Vencimento', 30, NULL, '2025-11-30 00:00:00', TRUE),
(2262, 3, '621703139', 'Paulinho ceguinho', '2026-06-30', '+557199287-1095', 'Sem Vencimento', 30, NULL, '2025-12-07 00:00:00', TRUE),
(2261, 3, '982752762', 'Italo De João', '2026-08-09', '+557199217-6628', 'Sem Vencimento', 30, NULL, '2025-12-03 00:00:00', TRUE),
(2290, 98, '7', 'Aluguel casa', '2026-07-20', '+55', 'Sem Vencimento', 1000, NULL, '2024-01-15 00:00:00', TRUE),
(2264, 3, '78128748', 'Arlene de valdeci de leo', '2026-08-21', '+557198815-2982', 'Sem Vencimento', 30, NULL, '2025-12-16 00:00:00', TRUE),
(2266, 106, 'Erivaldo', 'Erivaldo', '2026-08-20', '+5511 962151123', 'Sem Vencimento', 50, NULL, '2025-12-19 00:00:00', TRUE),
(2267, 3, '981943583', 'Brena Rodrigues  Ddd 16', '2026-08-05', '+553499832-0517', 'Sem Vencimento', 29.8, NULL, '2025-12-20 00:00:00', TRUE),
(2268, 3, '409642188', 'Caio Henrique Rick De Vitor Sobreira', '2026-05-13', '+557198266-5741', 'Sem Vencimento', 30, NULL, '2025-12-21 00:00:00', TRUE),
(2327, 3, '704052878', 'Luiz Laldeci', '2026-07-31', '+557198865-7837', 'Sem Vencimento', 30, NULL, '2026-05-31 00:00:00', TRUE),
(2313, 3, '449696191', 'Celim De Elvis Ddd 34', '2026-08-28', '+5534996936930', 'Sem Vencimento', 30, NULL, '2026-04-22 00:00:00', TRUE),
(2270, 3, '325667211', 'Jones Cunhado De Davidson - SLIM', '2026-07-29', '+557199224-8720', 'Sem Vencimento', 30, 'SLIM
https://iboplayer.com/devices

5c497db930cc
523291', '2025-12-26 00:00:00', TRUE),
(2271, 3, '860356463', 'Larissa De Andressa', '2026-08-19', '+557199664-2028', 'Sem Vencimento', 44.8, NULL, '2025-12-28 00:00:00', TRUE),
(2272, 3, '28458453', 'Lucio Raquel', '2026-05-04', '+557199317-4675', 'Sem Vencimento', 29.8, NULL, '2025-12-31 00:00:00', TRUE),
(2281, 3, '164776827', 'marinho MF MODAS', '2026-08-16', '+557199312-5878', 'Sem Vencimento', 30, NULL, '2026-01-19 00:00:00', TRUE),
(2273, 3, '914855033', 'Alex liq 2', '2026-05-10', '+557198384-8586', 'Sem Vencimento', 30, NULL, '2026-01-06 00:00:00', TRUE),
(2275, 3, '230264615', 'Ricardo Sogro De Vinicius', '2026-08-17', '+557198197-4527', 'Sem Vencimento', 30, NULL, '2026-01-11 00:00:00', TRUE),
(2276, 106, 'Rafael', 'Rafael', '2026-07-20', '+55 719388-1339', 'Sem Vencimento', 50, NULL, '2026-01-12 00:00:00', TRUE),
(2277, 106, 'Raquel Barbosa', 'Raquel Barbosa', '2026-08-20', '+55 71 9664-434', 'Sem Vencimento', 50, NULL, '2026-01-13 00:00:00', TRUE),
(2278, 3, '178372331', 'Paulo De Andreia', '2026-08-20', '+558198599-2480', 'Sem Vencimento', 30, NULL, '2026-01-15 00:00:00', TRUE),
(2279, 3, '396140576', 'Rosivania dias Ddd 88', '2026-08-22', '+558898832-3201', 'Sem Vencimento', 29.8, NULL, '2026-01-15 00:00:00', TRUE),
(2317, 106, 'Verônica', 'Verônica', '2026-07-20', '+55 71 8244-08', 'Sem Vencimento', 50, NULL, '2026-05-01 00:00:00', TRUE),
(2312, 3, '76397221', 'Calebi Almeida Ddd 41', '2026-06-23', '+5541985071576', 'Sem Vencimento', 29.8, NULL, '2026-04-22 00:00:00', TRUE),
(2294, 3, '804710451', 'Rogério De Ilana', '2026-08-12', '+5571 8393-8529', 'Sem Vencimento', 30, NULL, '2026-03-10 00:00:00', TRUE),
(2295, 106, 'Rodrigo', 'Rodrigo', '2026-08-15', '+5571 9170-9603', 'Sem Vencimento', 0, NULL, '2026-03-14 00:00:00', TRUE),
(2310, 3, '896388147', 'Alan Santos Ddd 71', '2026-10-20', '+557199260-3987', 'Sem Vencimento', 25.83, NULL, '2026-04-16 19:25:16', TRUE),
(2296, 3, '844992714', 'Tiago Lacerda Netgool', '2026-08-24', '+557198428-2258', 'Sem Vencimento', 25, 'Vai pagar dia 5', '2026-03-18 00:00:00', TRUE),
(2297, 3, '194280765', 'Lusmar de paulo de andreia', '2026-08-14', '+5571 8249-1235', 'Sem Vencimento', 29.8, NULL, '2026-02-18 00:00:00', TRUE),
(2298, 3, '38985055', 'Thamires Da Casa De Richard', '2026-07-29', '+5571993852509', 'Sem Vencimento', 38, NULL, '2026-03-27 00:00:00', TRUE),
(2299, 3, '206859488', 'Ruth Ddd 92', '2026-05-29', '+5592982793077', 'Sem Vencimento', 29.8, NULL, '2026-03-28 00:00:00', TRUE),
(2300, 3, '679236339', 'Brenda De Ruan De Davidson', '2026-08-02', '+5571986536156', 'Sem Vencimento', 29.8, NULL, '2026-03-29 00:00:00', TRUE),
(2301, 3, '542766596', 'Marcio Lucena Ddd 71', '2026-08-02', '+557199141243', 'Sem Vencimento', 29.8, NULL, '2026-03-31 00:00:00', TRUE),
(2302, 3, '216503307', 'Isac de daniel', '2026-08-14', '+5571984380745', 'Sem Vencimento', 30, NULL, '2026-03-31 00:00:00', TRUE),
(2303, 106, 'Denise', 'Denise', '2026-08-20', '+5571 98621-531', 'Sem Vencimento', 50, NULL, '2026-04-05 00:00:00', TRUE),
(2304, 3, '966754521', 'Barbara Ddd 21', '2026-07-14', '5521973557187', 'Sem Vencimento', 29, NULL, '2026-04-08 00:00:00', TRUE),
(2305, 3, '972233774', 'Sávio Melo Netgool', '2026-06-11', '+5571988762092', 'Sem Vencimento', 20, NULL, '2026-04-10 00:00:00', TRUE),
(2306, 98, '8', 'Cobalt LTZ 1.8 Econo.Flex 4P', '2026-07-27', '+55', 'Sem Vencimento', 589.38, 'Cobalt LTZ 1.8 Econo.Flex 4P 
Placa OUI4F06


37x parcelas

1 Abril 2026
', '2026-04-14 00:00:00', TRUE),
(2307, 98, '9', 'Luna Aux Governo', '2026-08-10', '+55', 'Sem Vencimento', 15, NULL, '2026-04-14 00:00:00', TRUE),
(2308, 3, '368569094', 'Lara De Andressa', '2026-10-18', '+557199350-1021', 'Sem Vencimento', 25.83, NULL, '2026-04-15 06:06:35', TRUE),
(2309, 3, '415090857', 'Cesar Fernanda de Eliene', '2026-08-17', '+557199116-2114', 'Sem Vencimento', 44.8, NULL, '2026-04-15 00:00:00', TRUE),
(2311, 3, '885645880', 'Robson De Bogoia', '2026-06-20', '+5571986573240', 'Sem Vencimento', 29.8, NULL, '2026-04-18 00:00:00', TRUE),
(2316, 3, '622482785', 'Alan Ddd 81', '2026-05-27', '+558197506-7314', 'Sem Vencimento', 30, NULL, '2026-04-28 11:02:29', TRUE),
(2318, 3, '842435523', 'Rusley Ddd 34', '2026-08-06', '+553499285-7079', 'Sem Vencimento', 29.8, NULL, '2026-05-02 00:00:00', TRUE),
(2319, 3, '206958653', 'Pedro Ddd 77', '2026-11-05', '+557799110-1201', 'Sem Vencimento', 25.83, '6 meses', '2026-05-03 18:46:59', TRUE),
(2320, 106, 'Expedito', 'Expedito', '2026-08-20', '+55 71 8209-461', 'Sem Vencimento', 50, NULL, '2026-05-10 00:00:00', TRUE),
(2321, 3, '934614275', 'Adolfo avô de andressa', '2026-08-11', '+557199374-9392', 'Sem Vencimento', 30, NULL, '2026-05-11 00:00:00', TRUE),
(2322, 3, '772451641', 'Rebeca De Dadai', '2026-07-13', '+557198231-3636', 'Sem Vencimento', 37.8, NULL, '2026-05-12 00:00:00', TRUE),
(2323, 3, '732051197', 'Roberta De Dadai', '2026-07-14', '+557199243-6696', 'Sem Vencimento', 29.8, NULL, '2026-05-12 00:00:00', TRUE),
(2324, 3, '687216213', 'Roque Deposito Rock', '2026-08-18', '+557198896-2764', 'Sem Vencimento', 30, NULL, '2026-05-15 00:00:00', TRUE),
(2325, 3, '944578622', 'Tiago Rust Ddd 62', '2026-08-19', '+556298475-8903', 'Sem Vencimento', 29.8, NULL, '2026-05-17 00:00:00', TRUE),
(2331, 3, '799901003', 'VictÃ³ria Motaâœ¨ De Heron DepÃ³sito', '2026-08-23', '+557199739-1507', 'Sem Vencimento', 29.8, NULL, '2026-06-22 00:00:00', TRUE),
(2329, 106, 'Vanessa', 'Vanessa', '2026-08-11', '+55 11 98392-44', 'Sem Vencimento', 50, NULL, '2026-06-06 00:00:00', TRUE),
(2330, 106, 'guaciara', 'Guaciara', '2026-08-20', '+55 7198604-364', 'Sem Vencimento', 50, NULL, '2026-06-10 00:00:00', TRUE),
(2341, 106, 'Beatriz', 'Beatriz', '2026-08-20', '+55 71 8296-701', 'Sem Vencimento', 50, 'Cliente ativado em 19/07
Só que não pagou fiança e taxa de instalação.
Vai pagar no próximo mês seguinte.ate 20/08.', '2026-07-19 13:58:17', TRUE),
(2332, 3, '470244932', 'Michel Irmão Do Namorado De Lorena', '2026-07-25', '+557198740-9822', 'Sem Vencimento', 29.8, NULL, '2026-06-24 07:55:39', TRUE),
(2333, 3, '991834062', 'Dani Bilio De Elvis', '2026-07-27', '+5534988763714', 'Sem Vencimento', 30, NULL, '2026-06-26 15:06:47', TRUE),
(2334, 3, '26121010', 'Maria De Sávio', '2026-07-28', '+5571992782369', 'Sem Vencimento', 30, NULL, '2026-06-26 16:09:32', TRUE),
(2335, 3, '847876365', 'Rone De Elvis', '2026-07-28', '+5534993351292', 'Sem Vencimento', 29.8, NULL, '2026-06-27 04:51:19', TRUE),
(2336, 3, '443154751', 'Anderson ddd 71', '2026-08-28', '+5571992531635', 'Sem Vencimento', 30, NULL, '2026-06-29 00:00:00', TRUE),
(2337, 3, '267851554', 'Adriano Batista Lorena', '2026-08-07', '+557199183-4575', 'Sem Vencimento', 30, NULL, '2026-07-07 13:11:48', TRUE),
(2338, 3, '141113934', 'Iris Netgool', '2026-08-09', '+557199237-7795', 'Sem Vencimento', 40, '2 tv e 1 celular', '2026-07-10 11:23:36', TRUE),
(2339, 106, 'Gabriel Dorea', 'Dorea', '2026-08-20', '+55 71 8105-640', 'Sem Vencimento', 50, 'Cliente vai pagar R$= 75,00 Reais no prÃ³ximo vencimento, pois nÃ£o tinha o dinheiro ðŸ’°, para pagar no ato da instalaÃ§Ã£o.', '2026-07-11 10:06:54', TRUE),
(2340, 106, 'Jamile', 'Jamile', '2026-08-20', '+55 71 98149-73', 'Sem Vencimento', 50, NULL, '2026-07-15 19:26:03', TRUE),
(2342, 3, '533047006', 'Gabriella Matos De Marcio Lucena', '2026-08-21', '+557199326-7066', 'Sem Vencimento', 30, NULL, '2026-07-22 05:53:48', TRUE),
(2343, 3, '495185587', 'Vanessa ramos', '2026-08-22', '+557199103-1683', 'Sem Vencimento', 30, NULL, '2026-07-22 05:57:57', TRUE),
(2344, 3, '824347276', 'Manu de bruno', '2026-08-21', '+557199341-0534', 'Sem Vencimento', 30, NULL, '2026-07-22 05:58:48', TRUE),
(2345, 106, 'Ronaldo', 'Ronaldo', '2026-09-20', '+55 71 9206-748', 'Sem Vencimento', 50, NULL, '2026-07-22 00:00:00', TRUE),
(2346, 3, '867807581', 'Tito De Tiago Netgool', '2026-08-27', '+557198615-7437', 'Sem Vencimento', 30, NULL, '2026-07-28 04:17:28', TRUE);

INSERT INTO tickets (id, user_id, question, status, created_at, response, responded_at) VALUES
(1, 1, 'Olá, estou com uma duvida, como verifico o grafico anual da pasta?', 'answered', '2024-11-12 16:15:04', 'Jaja respondo', '2024-11-12 11:02:15'),
(2, 1, 'Olá, estou com uma duvida, como verifico o grafico anual da pasta?', 'answered', '2024-11-12 16:21:32', 'Olá TarcioCq, ficamos felizes com seu contato!

Para verificar o gráfico anual das pastas basta clicar nos 3 traços horizontais no canto superior esquerdo da sua tela >> Pastas >> Mostrar Gráfico.

Feito isso selecione  o ano que deseja.


Atenciosamente, Suporte AuxPlus', '2024-11-12 08:46:18'),
(3, 12, 'Como posso inserir um produto novo na pasta?', 'pending', '2024-11-12 17:00:15', NULL, NULL),
(4, 1, 'Testando
Teste e teste

Obrigado', 'answered', '2024-11-12 18:47:15', 'Ola, ola
Abraço 


Auxplus', '2024-11-12 11:22:15'),
(5, 1, 'Testando
Teste e teste

Obrigado', 'pending', '2024-11-12 18:48:19', NULL, NULL),
(6, 1, 'Ola quando iniciou a plataforma?

Abraço ', 'answered', '2024-11-13 12:13:09', 'Eai começou em 2024

Segue melhorando
Abraço', '2024-11-13 04:14:30');

INSERT INTO whatsapp_messages (user_id, folder_id, message) VALUES
(1, 3, '{getGreeting}

ðŸ”” Lembrete da T&E ðŸ””

UsuÃ¡rio: {item_id}

{dateText} {due_date}

NÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.

Aproveite seus programas favoritos! ðŸ“ºâœ¨


Para facilitar, aqui estÃ¡ o nosso Pix:

ðŸ”‘ *Pix 7198616-4082*
* *Banco do Brasil*
> *TARCISIO COUTO QUEIROZ*

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(1, 31, 'Lembrem de renovar seus clientes'),
(12, 29, '{getGreeting}

ðŸ”” Lembrete da *"T&E"* ðŸ””
*[MENSAGEM AUTOMÃTICA]*

UsuÃ¡rio: {item_id}

{dateText} {due_date}

NÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.

Aproveite seus programas favoritos! ðŸ“ºâœ¨

:
ðŸ”‘ Chave Pix: eronvitorchaves@gmail.com
ðŸ¦ Banco: Mercado Pago
ðŸ‘¤ Recebedor: Eron Vitor Souza Chaves

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(12, 30, '{getGreeting}

ðŸ”” Lembrete da "T&E" ðŸ””

Lembrete: *AutomÃ¡tico*

UsuÃ¡rio: {item_id}

{dateText} {due_date}

NÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.

Aproveite seus programas favoritos! ðŸ“ºâœ¨

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(15, 103, '{getGreeting}

ðŸ”” Lembrete da "Uniplay" ðŸ””

UsuÃ¡rio: {item_id}

{dateText} {due_date}

NÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.

Aproveite seus programas favoritos! ðŸ“ºâœ¨

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(16, 106, '{getGreeting}

ðŸ”” Lembrete ðŸ””

Sua conexÃ£o {dateText} {due_date}

NÃ£o esqueÃ§a de renovar sua internet para continuar navegando sem interrupÃ§Ãµes. 

A data de vencimento Ã© dia 15 de cada mÃªs, sendo que o prazo final de pagamento Ã© dia 20,
ApÃ³s essa data o sistema fara o bloqueio.
Conto com sua colaboraÃ§Ã£o!
 
 Segue anexo meu PIX 
  
   (71-99199-6305)
    Banco do Brasil 

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(17, 114, '{getGreeting}

ðŸ”” Lembrete ðŸ””

{dateText} {due_date}

NÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.

Aproveite seus programas favoritos! ðŸ“ºâœ¨

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(18, 119, '{getGreeting}

ðŸ”” Lembrete ðŸ””

UsuÃ¡rio: {item_id}

{dateText} {due_date}

NÃ£o esqueÃ§a de renovar para continuar assistindo sem interrupÃ§Ãµes.

Aproveite seus programas favoritos! ðŸ“ºâœ¨

> Obrigado pela sua preferÃªncia! ðŸŒŸ'),
(1, 122, '{getGreeting}

ðŸ”” Lembrete ðŸ””

UsuÃ¡rio: {item_id}
{dateText} {due_date}

Renove sua internet para continuar navegando em alta velocidade e sem interrupÃ§Ãµes! ðŸŒðŸš€

Para facilitar, aqui estÃ¡ o nosso Pix:

ðŸ”‘ *Pix 7198616-4082*
* *Banco do Brasil*
> *TARCISIO COUTO QUEIROZ*

> Obrigado pela sua preferÃªncia! ðŸŒŸ');

SELECT setval(pg_get_serial_sequence('users','id'), GREATEST(18, 1));
-- IDs manuais: criar sequences auxiliares se for inserir novos registros
CREATE SEQUENCE IF NOT EXISTS users_id_seq OWNED BY users.id;
CREATE SEQUENCE IF NOT EXISTS folders_id_seq OWNED BY folders.id;
CREATE SEQUENCE IF NOT EXISTS items_id_seq OWNED BY items.id;
CREATE SEQUENCE IF NOT EXISTS tickets_id_seq OWNED BY tickets.id;
CREATE SEQUENCE IF NOT EXISTS folder_messages_id_seq OWNED BY folder_messages.id;
ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');
ALTER TABLE folders ALTER COLUMN id SET DEFAULT nextval('folders_id_seq');
ALTER TABLE items ALTER COLUMN id SET DEFAULT nextval('items_id_seq');
ALTER TABLE tickets ALTER COLUMN id SET DEFAULT nextval('tickets_id_seq');
ALTER TABLE folder_messages ALTER COLUMN id SET DEFAULT nextval('folder_messages_id_seq');
SELECT setval('users_id_seq', 18);
SELECT setval('folders_id_seq', 122);
SELECT setval('items_id_seq', 2346);
SELECT setval('tickets_id_seq', 6);
SELECT setval('folder_messages_id_seq', 2);

COMMIT;