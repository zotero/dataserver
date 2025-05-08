<?
function Zotero_DBConnectAuth($db) {
	$charset = '';
	if ($db == 'master') {
		$host = getenv('MYSQL_HOST') ?? 'mysql';
		$port = getenv('MYSQL_PORT') ?? '3306';
		// $replicas = [['host' => '']];  //new
		$db = 'zotero_master';
		$user = getenv('MYSQL_ROOT_USER') ?? 'root';
		$pass = getenv('MYSQL_ROOT_PASSWORD') ?? '';
		// $state = 'up'; // 'up', 'readonly', 'down'
	}
	else if ($db == 'shard') {
		$host = getenv('MYSQL_HOST') ?? 'mysql';
		$port = getenv('MYSQL_PORT') ?? '3306';
		$db = 'zotero_shard_1';
		$user = getenv('MYSQL_ROOT_USER') ?? 'root';
		$pass = getenv('MYSQL_ROOT_PASSWORD') ?? '';
	}
	else if ($db == 'id1') {
		$host = getenv('MYSQL_HOST') ?? 'mysql';
		$port = getenv('MYSQL_PORT') ?? '3306';
		$db = 'zotero_ids';
		$user = getenv('MYSQL_ROOT_USER') ?? 'root';
		$pass = getenv('MYSQL_ROOT_PASSWORD') ?? '';
	}
	else if ($db == 'id2') {
		$host = getenv('MYSQL_HOST') ?? 'mysql';
		$port = getenv('MYSQL_PORT') ?? '3306';
		$db = 'zotero_ids';
		$user = getenv('MYSQL_ROOT_USER') ?? 'root';
		$pass = getenv('MYSQL_ROOT_PASSWORD') ?? '';
	}
	else if ($db == 'www1') {
		$host = getenv('MYSQL_HOST') ?? 'mysql';
		$port = getenv('MYSQL_PORT') ?? '3306';
		$db = 'zotero_www';
		$user = getenv('MYSQL_ROOT_USER') ?? 'root';
		$pass = getenv('MYSQL_ROOT_PASSWORD') ?? '';
	}
	else if ($db == 'www2') {
		$host = getenv('MYSQL_HOST') ?? 'mysql';
		$port = getenv('MYSQL_PORT') ?? '3306';
		$db = 'zotero_www';
		$user = getenv('MYSQL_ROOT_USER') ?? 'root';
		$pass = getenv('MYSQL_ROOT_PASSWORD') ?? '';
	}
	else {
		throw new Exception("Invalid db '$db'");
	}
	return [
		'host' => $host,
		'replicas' => !empty($replicas) ? $replicas : [],
		'port' => $port,
		'db' => $db,
		'user' => $user,
		'pass' => $pass,
		'charset' => $charset,
		'state' => !empty($state) ? $state : 'up'
	];
}
?>
