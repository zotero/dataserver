<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2010 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

require_once('Zend/Db/Profiler.php');
require_once('Zend/Db/Adapter/Mysqli.php');
require_once('Zend/Db/Statement/Mysqli.php');
require_once('Zend/Db/Statement/Mysqli/Exception.php');

/**
*
* Singleton class for DB access
*
**/
class Zotero_DB {
	public static $queryStats;
	
	protected static $instances;
	
	protected $links = array();
	private $profilerEnabled = false;
	
	private $transactionLevel = 0;
	private $transactionTimestamp;
	private $transactionTimestampMS;
	private $transactionTimestampUnix;
	private $transactionShards = array();
	private $transactionRollback = false;
	
	private $preparedStatements = array();
	private $callbacks = array(
		'begin' => array(),
		'commit' => array(),
		'rollback' => array()
	);
	
	protected $db = 'master';
	
	protected function __construct() {
		// Set up main link
		$auth = Zotero_DBConnectAuth($this->db);
		$this->links[0] = new Zend_Db_Adapter_Mysqli(array(
			'host'     => $auth['host'],
			'port'     => $auth['port'],
			'username' => $auth['user'],
			'password' => $auth['pass'],
			'dbname'   => $auth['db'],
			'charset'  => !empty($auth['charset']) ? $auth['charset'] : 'utf8',
			'driver_options' => array(
				"MYSQLI_OPT_CONNECT_TIMEOUT" => 5
			)
		));
	}
	
	
	protected function getShardLink($shardID, $forWriting=false) {
		// TEMP
		if (get_called_class() == 'Zotero_FullText_DB') {
			$linkID = "FT" . $shardID;
		}
		else {
			$linkID = $shardID;
		}
		
		if (isset($this->links[$linkID])) {
			return $this->links[$linkID];
		}
		
		$shardInfo = Zotero_Shards::getShardInfo($shardID);
		
		if (!$shardInfo) {
			throw new Exception("Invalid shard $shardID");
		}
		
		if ($shardInfo['state'] == 'down') {
			throw new Exception("Shard $shardID is down", Z_ERROR_SHARD_UNAVAILABLE);
		}
		else if ($shardInfo['state'] == 'readonly') {
			if ($forWriting) {
				throw new Exception("Cannot write to read-only shard $shardID", Z_ERROR_SHARD_READ_ONLY);
			}
		}
		
		$auth = Zotero_DBConnectAuth('shard');
		$config = array(
			'host'     => $shardInfo['address'],
			'port'     => $shardInfo['port'],
			'username' => $auth['user'],
			'password' => $auth['pass'],
			'dbname'   => $shardInfo['db'],
			'charset'  => isset($auth['charset']) ? $auth['charset'] : 'utf8',
			'driver_options' => array(
				"MYSQLI_OPT_CONNECT_TIMEOUT" => 5
			)
		);
		
		// TEMP: For now, use separate host
		if (get_called_class() == 'Zotero_FullText_DB') {
			$auth = Zotero_DBConnectAuth('fulltext');
			$config['host'] = $auth['host'];
			$config['port'] = $auth['port'];
		}
		// For admin, use user/pass from master
		else if (get_called_class() == 'Zotero_Admin_DB') {
			$auth = Zotero_DBConnectAuth($this->db);
			$config['username'] = $auth['user'];
			$config['password'] = $auth['pass'];
		}
		
		$this->links[$linkID] = new Zend_Db_Adapter_Mysqli($config);
		
		$conn = $this->links[$linkID]->getConnection();
		$conn->options(MYSQLI_OPT_CONNECT_TIMEOUT, 5);
		
		// If profile was previously enabled, enable it for this link
		if ($this->profilerEnabled) {
			$this->links[$linkID]->getProfiler()->setEnabled(true);
		}
		
		return $this->links[$linkID];
	}
	
	
	/**
	 * Get an instance of the appropriate class
	 */
	protected static function getInstance() {
		$class = get_called_class();
		
		if (empty(self::$instances[$class])) {
			self::$instances[$class] = new $class;
		}
		
		return self::$instances[$class];
	}
	
	
	/**
	 * Start a virtual MySQL transaction or increase the transaction nesting level
	 *
	 * If a transaction is already in progress, the nesting level will be incremented by one
	 *
	 * Note that this doesn't actually start a transaction. Transactions are started
	 * lazily on each shard that gets a query while a virtual transaction is open,
	 * with commits on all affected shards at the end.
	 *
	 * This only works with InnoDB tables.
	 */
	public static function beginTransaction() {
		$instance = self::getInstance();
		
		$instance->transactionLevel++;
		if ($instance->transactionLevel > 1) {
			Z_Core::debug("Transaction in progress -- nesting level increased to $instance->transactionLevel");
			return -1;
		}
		
		$instance->transactionTimestamp = null;
		$instance->transactionTimestampUnix = null;
		
		Z_Core::debug("Starting transaction");
		
		foreach ($instance->callbacks['begin'] as $callback) {
			call_user_func($callback);
		}
	}
	
	
	/**
	 * Commit a MySQL transaction or decrease the transaction nesting level
	 *
	 * If a transaction is already in progress, the nesting level will be decremented by one
	 * rather than committing.
	 *
	 * This only works with InnoDB tables
	 */
	public static function commit() {
		$instance = self::getInstance();
		
		if ($instance->transactionLevel == 0) {
			throw new Exception("Transaction not open");
		}
		
		$instance->transactionLevel--;
		if ($instance->transactionLevel) {
			Z_Core::debug("Transaction in progress -- nesting level decreased to $instance->transactionLevel");
			return -1;
		}
		
		if ($instance->transactionRollback) {
			Z_Core::debug("Rolling back previously flagged transaction");
			self::rollback();
			return;
		}
		
		$shardIDs = array_keys($instance->transactionShards);
		// Sort in reverse order to make sure we're not relying on race conditions
		// to get data replicated to the shards
		rsort($shardIDs);
		foreach ($shardIDs as $shardID) {
			$instance->commitReal($shardID);
		}
		
		foreach ($instance->callbacks['commit'] as $callback) {
			call_user_func($callback);
		}
	}
	
	
	/**
	 * Rollback MySQL transactions on all shards
	 *
	 * This only works with InnoDB tables
	 */
	public static function rollback($all=false) {
		$instance = self::getInstance();
		
		if ($instance->transactionLevel == 0) {
			Z_Core::debug('Transaction not open in Zotero_DB::rollback()');
			return;
		}
		
		if ($all) {
			$instance->transactionLevel = 1;
			self::rollback();
			return;
		}
		
		if ($instance->transactionLevel > 1) {
			Z_Core::debug("Flagging nested transaction for rollback");
			$instance->transactionRollback = true;
			$instance->transactionLevel--;
			return;
		}
		
		$shardIDs = array_keys($instance->transactionShards);
		rsort($shardIDs);
		foreach ($shardIDs as $shardID) {
			$instance->rollBackReal($shardID);
		}
		
		$instance->transactionLevel--;
		$instance->transactionRollback = false;
		
		foreach ($instance->callbacks['rollback'] as $callback) {
			call_user_func($callback);
		}
	}
	
	
	public static function addCallback($action, $cb) {
		$instance = self::getInstance();
		$instance->callbacks[$action][] = $cb;
	}
	
	
	public static function transactionInProgress() {
		$instance = self::getInstance();
		return $instance->transactionLevel > 0;
	}
	
	
	public static function getTransactionTimestamp() {
		$instance = self::getInstance();
		
		if ($instance->transactionLevel == 0) {
			throw new Exception("Transaction not open");
		}
		
		if (empty($instance->transactionTimestamp)) {
			$instance->transactionTimestamp = Zotero_DB::valueQuery("SELECT NOW()");
		}
		
		return $instance->transactionTimestamp;
	}
	
	
	public static function getTransactionTimestampUnix() {
		$instance = self::getInstance();
		
		if ($instance->transactionLevel == 0) {
			throw new Exception("Transaction not open");
		}
		
		if (empty($instance->transactionTimestampUnix)) {
			$ts = self::getTransactionTimestamp();
			$instance->transactionTimestampUnix = strtotime($ts);
		}
		
		return $instance->transactionTimestampUnix;
	}
	
	
	public static function registerTransactionTimestamp($unixTimestamp) {
		$instance = self::getInstance();
		
		if (!empty($instance->transactionTimestamp)) {
			throw new Exception("Transaction timestamp already set");
		}
		
		$instance->transactionTimestamp = date("Y-m-d H:i:s", $unixTimestamp);
		$instance->transactionTimestampUnix = $unixTimestamp;
	}
	
	
	/*
	 * @return	Zotero_DBStatement
	 */
	public static function getStatement($sql, $cache=false, $shardID=0) {
		$instance = self::getInstance();
		$isWriteQuery = self::isWriteQuery($sql);
		$link = $instance->getShardLink($shardID, $isWriteQuery);
		
		if ($cache) {
			if (is_bool($cache)) {
				$key = md5($sql);
			}
			// Supplied key
			else if (is_string($cache)) {
				$key = $cache;
			}
			else {
				throw new Exception("Invalid cache type '$cache'");
			}
		}
		
		// See if statement is already cached for this shard
		if ($cache && isset($instance->preparedStatements[$shardID][$key])) {
			return $instance->preparedStatements[$shardID][$key];
		}
		
		$stmt = new Zotero_DB_Statement($link, $sql, $shardID);
		
		// Cache for future use
		if ($cache) {
			if (!isset($instance->preparedStatements[$shardID])) {
				$instance->preparedStatements[$shardID] = array();
			}
			$instance->preparedStatements[$shardID][$key] = $stmt;
		}
		
		return $stmt;
	}
	
	
	public static function query($sql, $params=false, $shardID=0) {
		self::logQuery($sql, $params, $shardID);
		
		$instance = self::getInstance();
		
		$isWriteQuery = self::isWriteQuery($sql);
		$link = $instance->getShardLink($shardID, $isWriteQuery);
		
		$instance->checkShardTransaction($shardID);
		
		if ($params !== false && (is_scalar($params) || is_null($params))) {
			$params = array($params);
		}
		
		try {
			if (is_array($params)) {
				// Replace null parameter placeholders with 'NULL'
				for ($i=0, $len=sizeOf($params); $i<$len; $i++) {
					if (is_null($params[$i])) {
						preg_match_all('/\s*=?\s*\?/', $sql, $matches, PREG_OFFSET_CAPTURE);
						if (strpos($matches[0][$i][0], '=') === false) {
							preg_match_all('/\?/', $sql, $matches, PREG_OFFSET_CAPTURE);
							$repl = 'NULL';
							$sublen = 1;
						}
						else if (!$isWriteQuery) {
							$repl = ' IS NULL';
							$sublen = strlen($matches[0][$i][0]);
						}
						else {
							$repl = '=NULL';
							$sublen = strlen($matches[0][$i][0]);
						}
						
						$subpos = $matches[0][$i][1];
						$sql = substr_replace($sql, $repl, $subpos, $sublen);
						
						array_splice($params, $i, 1);
						$i--;
						$len--;
						continue;
					}
				}
				
				$stmt = new Zotero_DB_Statement($link, $sql, $shardID);
				$stmt->execute($params);
			}
			else {
				$stmt = new Zotero_DB_Statement($link, $sql, $shardID);
				$stmt->execute();
			}
		}
		catch (Exception $e) {
			self::error($e, $sql, $params, $shardID);
		}
		
		return self::queryFromStatement($stmt);
	}
	
	
	public static function queryFromStatement(Zotero_DB_Statement $stmt, $params=false) {
		try {
			// Execute statement if not coming from self::query()
			if ($params) {
				self::logQuery($stmt->sql, $params, $stmt->shardID);
				
				// If this is a write query, make sure shard is writeable
				if ($stmt->isWriteQuery && $stmt->shardID && !Zotero_Shards::shardIsWriteable($stmt->shardID)) {
					throw new Exception("Cannot write to read-only shard $stmt->shardID", Z_ERROR_SHARD_READ_ONLY);
				}
				
				$instance = self::getInstance();
				$instance->checkShardTransaction($stmt->shardID);
				
				if (is_scalar($params)) {
					$params = array($params);
				}
				$stmt->execute($params);
			}
			
			$stmt->setFetchMode(Zend_Db::FETCH_ASSOC);
			
			$mystmt = $stmt->getDriverStatement();
			
			// Not a read statement
			if (!$mystmt->field_count) {
				// Determine the type of query using first word
				preg_match('/^[^\s\(]*/', $stmt->sql, $matches);
				$queryMethod = strtolower($matches[0]);
				
				if ($queryMethod == "update" || $queryMethod == "delete") {
					return $stmt->rowCount();
				}
				else if ($queryMethod == "insert") {
					$insertID = (int) $stmt->link->lastInsertID();
					if ($insertID) {
						return $insertID;
					}
					$affectedRows = $stmt->rowCount();
					if (!$affectedRows) {
						return false;
					}
					return $affectedRows;
				}
				return true;
			}
			
			// Cast integers
			$intFieldNames = self::getIntegerColumns($mystmt);
			$results = array();
			while ($row = $stmt->fetch()) {
				if ($intFieldNames) {
					foreach ($intFieldNames as $name) {
						if (is_null($row[$name])) {
							$row[$name] = null;
						}
						// 32-bit hack: cast only numbers shorter than 10 characters as ints
						else if (strlen($row[$name]) < 10) {
							$row[$name] = (int) $row[$name];
						}
					}
				}
				$results[] = $row;
			}
		}
		catch (Exception $e) {
			self::error($e, $stmt->sql, $params, $stmt->shardID);
		}
			
		return $results;
	}
	
	
	public static function columnQuery($sql, $params=false, $shardID=0) {
		self::logQuery($sql, $params, $shardID);
		
		$instance = self::getInstance();
		$isWriteQuery = self::isWriteQuery($sql);
		$link = $instance->getShardLink($shardID, $isWriteQuery);
		$instance->checkShardTransaction($shardID);
		
		// TODO: Use instance->link->fetchCol once it supports type casting
		
		if ($params && is_scalar($params)) {
			$params = array($params);
		}
		
		try {
			$stmt = new Zotero_DB_Statement($link, $sql, $shardID);
			if ($params) {
				$stmt->execute($params);
			}
			else {
				$stmt->execute();
			}
			
			return self::columnQueryFromStatement($stmt);
		}
		catch (Exception $e) {
			self::error($e, $sql, $params, $shardID);
		}
	}
	
	
	public static function columnQueryFromStatement(Zotero_DB_Statement $stmt, $params=false) {
		try {
			// Execute statement if not coming from self::query()
			if ($params) {
				self::logQuery($stmt->sql, $params, $stmt->shardID);
				
				$instance = self::getInstance();
				$instance->checkShardTransaction($stmt->shardID);
				
				if (is_scalar($params)) {
					$params = array($params);
				}
				$stmt->execute($params);
			}
			
			$stmt->setFetchMode(Zend_Db::FETCH_NUM);
			
			$vals = array();
			while ($val = $stmt->fetchColumn()) {
				$vals[] = $val;
			}
			if (!$vals) {
				return false;
			}
			
			// Cast integers
			$mystmt = $stmt->getDriverStatement();
			if (self::getIntegerColumns($mystmt)) {
				$cast = function ($val) {
					if (is_null($val)) {
						return null;
					}
					// 32-bit hack: cast only numbers shorter than 10 characters as ints
					return (strlen($val) < 10) ? (int) $val : $val;
				};
				return array_map($cast, $vals);
			}
			
			return $vals;
		}
		catch (Exception $e) {
			self::error($e, $stmt->sql, $params, $stmt->shardID);
		}
	}
	
	
	public static function rowQuery($sql, $params=false, $shardID=0) {
		self::logQuery($sql, $params, $shardID);
		
		$instance = self::getInstance();
		$isWriteQuery = self::isWriteQuery($sql);
		$link = $instance->getShardLink($shardID, $isWriteQuery);
		$instance->checkShardTransaction($shardID);
		
		if ($params !== false && (is_scalar($params) || is_null($params))) {
			$params = array($params);
		}
		
		try {
			$stmt = new Zotero_DB_Statement($link, $sql, $shardID);
			if ($params) {
				$stmt->execute($params);
			}
			else {
				$stmt->execute();
			}
			
			return self::rowQueryFromStatement($stmt);
		}
		catch (Exception $e) {
			self::error($e, $sql, $params, $shardID);
		}
	}
	
	
	public static function rowQueryFromStatement(Zotero_DB_Statement $stmt, $params=false) {
		try {
			// Execute statement if not coming from self::query()
			if ($params) {
				self::logQuery($stmt->sql, $params, $stmt->shardID);
				
				$instance = self::getInstance();
				$instance->checkShardTransaction($stmt->shardID);
				
				if (is_scalar($params)) {
					$params = array($params);
				}
				$stmt->execute($params);
			}
			
			$stmt->setFetchMode(Zend_Db::FETCH_ASSOC);
			$row = $stmt->fetch();
			if (!$row) {
				return false;
			}
			
			// Cast integers
			$mystmt = $stmt->getDriverStatement();
			$intFieldNames = self::getIntegerColumns($mystmt);
			if ($intFieldNames) {
				foreach ($intFieldNames as $name) {
					if (is_null($row[$name])) {
						$row[$name] = null;
					}
					// 32-bit hack: cast only numbers shorter than 10 characters as ints
					else if (strlen($row[$name]) < 10) {
						$row[$name] = (int) $row[$name];
					}
				}
			}
			return $row;
		}
		catch (Exception $e) {
			self::error($e, $stmt->sql, $params, $stmt->shardID);
		}
	}
	
	
	public static function valueQuery($sql, $params=false, $shardID=0) {
		self::logQuery($sql, $params, $shardID);
		
		$instance = self::getInstance();
		$isWriteQuery = self::isWriteQuery($sql);
		$link = $instance->getShardLink($shardID, $isWriteQuery);
		$instance->checkShardTransaction($shardID);
		
		if ($params !== false && (is_scalar($params) || is_null($params))) {
			$params = array($params);
		}
		
		$stmt = new Zotero_DB_Statement($link, $sql, $shardID);
		
		try {
			if ($params) {
				$stmt->execute($params);
			}
			else {
				$stmt->execute();
			}
			
			return self::valueQueryFromStatement($stmt);
		}
		catch (Exception $e) {
			self::error($e, $sql, $params, $shardID);
		}
	}
	
	
	public static function valueQueryFromStatement(Zotero_DB_Statement $stmt, $params=false) {
		try {
			// Execute statement if not coming from self::valueQuery()
			if ($params) {
				self::logQuery($stmt->sql, $params, $stmt->shardID);
				
				$instance = self::getInstance();
				$instance->checkShardTransaction($stmt->shardID);
				
				if (is_scalar($params)) {
					$params = array($params);
				}
				$stmt->execute($params);
			}
			
			$stmt->setFetchMode(Zend_Db::FETCH_NUM);
			$row = $stmt->fetch();
			if (!$row) {
				return false;
			}
			
			$mystmt = $stmt->getDriverStatement();
			
			return (self::getIntegerColumns($mystmt) && strlen($row[0]) < 10) ? (is_null($row[0]) ? null : (int) $row[0]) : $row[0];
		}
		catch (Exception $e) {
			self::error($e, $stmt->sql, $params, $stmt->shardID);
		}
	}
	
	
	public static function bulkInsert($sql, $sets, $maxInsertGroups, $firstVal=false, $shardID=0) {
		$origInsertSQL = $sql;
		$insertSQL = $origInsertSQL;
		$insertParams = array();
		$insertCounter = 0;
		
		if (!$sets) {
			return;
		}
		
		$paramsPerGroup = sizeOf($sets[0]);
		if ($firstVal) {
			$paramsPerGroup++;
		}
		$placeholderStr = "(" . implode(",", array_fill(0, $paramsPerGroup, "?")) . "),";
		
		foreach ($sets as $set) {
			if (is_scalar($set)) {
				$set = array($set);
			}
			
			if ($insertCounter < $maxInsertGroups) {
				$insertSQL .= $placeholderStr;
				$insertParams = array_merge(
					$insertParams,
					$firstVal === false ? $set : array_merge(array($firstVal), $set)
				);
			}
			
			if ($insertCounter == $maxInsertGroups - 1) {
				$insertSQL = substr($insertSQL, 0, -1);
				$stmt = self::getStatement($insertSQL, true, $shardID);
				self::queryFromStatement($stmt, $insertParams);
				$insertSQL = $origInsertSQL;
				$insertParams = array();
				$insertCounter = -1;
			}
			
			$insertCounter++;
		}
		
		if ($insertCounter > 0 && $insertCounter < $maxInsertGroups) {
			$insertSQL = substr($insertSQL, 0, -1);
			$stmt = self::getStatement($insertSQL, true, $shardID);
			self::queryFromStatement($stmt, $insertParams);
		}
	}
	
	
/*	// Checks the existence of a table in DB
	public static function table_exists($table) {
		$instance = self::getInstance();
		return $instance->link->tableExists($table);
	}
	
	
	// List fields in table
	public static function list_fields($table, $exclude=array()) {
		$instance = self::getInstance();
		
		if (is_string($exclude)) { // allow for single excludes to be passed as strings
			$exclude = array($exclude);
		}
		
		$result = $instance->direct_query('SHOW COLUMNS FROM ' . $table);
		while ($row = mysqli_fetch_row($result)) {
			$field = $row[0];
			
			// Check for excluded columns
			if ($exclude) { 
				if (!in_array($field, $exclude)) {
					$fields[] = $field;
				}
			}
			else {
				$fields[] = $field;
			}
		}
		return $fields;
	}
	
	
	public static function has_field($table,$field) {
		$instance = self::getInstance();
		
		if (isset($GLOBALS['fieldcheck'][$table][$field])) {
			return $GLOBALS['fieldcheck'][$table][$field];
		}
		$fields = $instance->list_fields($table);
		if (is_array($fields) && in_array($field,$fields)) {
			return true;
		}
		return false;
	}
*/	
	
	/**
	* Get the possible enum values for a column
	*
	* @param		string	$table		DB table
	* @param		string	$field		Enum column
	* @return	array				Array of possible values
	**/
/*	public static function enum_values($table, $field) {
		$instance = self::getInstance();
		
		$result = $instance->direct_query("SHOW COLUMNS FROM `$table` LIKE '$field'");
		if (mysqli_num_rows($result)>0) {
			$row = mysqli_fetch_row($result);
			$options = explode("','", preg_replace("/(enum|set)\('(.+?)'\)/","\\2", $row[1]));
		}
		else {
			$options=array();
		}
		return $options;
	}
*/	
	
	protected function checkShardTransaction($shardID) {
		if ($this->transactionLevel && empty($this->transactionShards[$shardID])) {
			$this->beginTransactionReal($shardID);
		}
	}
	
	
	private function beginTransactionReal($shardID=0) {
		$link = $this->getShardLink($shardID);
		Z_Core::debug("Beginning transaction on shard $shardID");
		$link->beginTransaction();
		$this->transactionShards[$shardID] = true;
	}
	
	
	private function commitReal($shardID=0) {
		$link = $this->getShardLink($shardID);
		Z_Core::debug("Committing transaction on shard $shardID");
		$link->commit();
		unset($this->transactionShards[$shardID]);
	}
	
	private function rollbackReal($shardID=0) {
		$link = $this->getShardLink($shardID);
		Z_Core::debug("Rolling back transaction on shard $shardID");
		$link->rollBack();
		unset($this->transactionShards[$shardID]);
	}
	
	
	/**
	 * Determine the type of query using first word
	 */
	public static function isWriteQuery($sql) {
		preg_match('/^[^\s\(]*/', $sql, $matches);
		$command = strtoupper($matches[0]);
		switch ($command) {
			case 'SELECT':
			case 'SHOW':
				return false;
		}
		return true;
	}
	
	
	protected static function getIntegerColumns(mysqli_stmt $stmt) {
		if (!$stmt->field_count) {
			return false;
		}
		$result = $stmt->result_metadata();
		$fieldInfo = mysqli_fetch_fields($result);
		$intFieldNames = array();
		for ($i=0, $len=sizeOf($fieldInfo); $i<$len; $i++) {
			switch ($fieldInfo[$i]->type) {
				// From http://us2.php.net/manual/en/mysqli-result.fetch-field-direct.php
				case 1:
				case 2:
				case 3:
				case 8:
				case 9:
					$intFieldNames[] = $fieldInfo[$i]->name;
					break;
			}
		}
		return $intFieldNames;
	}
	
	
	/**
	 * Return the SQL command used in the query
	 */
	protected static function getQueryCommand($sql) {
		preg_match('/^[^\s\(]*/', $sql, $matches);
		return $matches[0];
	}
	
	
	protected static function logQuery($sql, $params, $shardID) {
		Z_Core::debug($sql . ($params ? " (" . (is_scalar($params) ? $params : implode(",", $params)) . ") ($shardID)" : ""));
	}
	
	
	public static function profileStart() {
		$instance = self::getInstance();
		$instance->profilerEnabled = true;
		foreach ($instance->links as $link) {
			$profiler = $link->getProfiler();
			$profiler->setEnabled(true);
		}
	}
	
	public static function profileEnd($id="", $appendRandomID=true) {
		$instance = self::getInstance();
		$instance->profilerEnabled = false;
		
		$str = "";
		$first = true;
		foreach ($instance->links as $shardID => $link) {
			$profiler = $link->getProfiler();
			
			$totalTime    = $profiler->getTotalElapsedSecs();
			$queryCount   = $profiler->getTotalNumQueries();
			$longestTime  = 0;
			$longestQuery = null;
			
			if (!$queryCount) {
				$profiler->setEnabled(false);
				continue;
			}
			
			ob_start();
			
			if ($first) {
				echo "======================================================================\n\n";
				$first = false;
			}
			else {
				echo "----------------------------------------------------------------------\n\n";
			}
			echo "Shard: $shardID\n\n";
			
			$queries = [];
			
			$profiles = $profiler->getQueryProfiles();
			if ($profiles) {
				foreach ($profiles as $query) {
					$sql = str_replace("\t", "", str_replace("\n", " ", $query->getQuery()));
					$hash = md5($sql);
					if (isset($queries[$hash])) {
						$queries[$hash]['count']++;
						$queries[$hash]['time'] += $query->getElapsedSecs();
					}
					else {
						$queries[$hash]['sql'] = $sql;
						$queries[$hash]['count'] = 1;
						$queries[$hash]['time'] = $query->getElapsedSecs();
					}
					if ($query->getElapsedSecs() > $longestTime) {
						$longestTime  = $query->getElapsedSecs();
						$longestQuery = $query->getQuery();
					}
				}
			}
			
			foreach($queries as &$query) {
				//$query['avg'] = $query['time'] / $query['count'];
			}
			
			usort($queries, function ($a, $b) {
				if ($a['time'] == $b['time']) {
					return 0;
				}
				return ($a['time'] < $b['time']) ? -1 : 1;
			});
			
			var_dump($queries);
			
			echo 'Executed ' . $queryCount . ' queries in ' . $totalTime . ' seconds' . "\n";
			echo 'Average query length: ' . ($queryCount ? ($totalTime / $queryCount) : "N/A") . ' seconds' . "\n";
			echo 'Queries per second: ' . ($totalTime ? ($queryCount / $totalTime) : "N/A") . "\n";
			echo 'Longest query length: ' . $longestTime . "\n";
			echo "Longest query: " . $longestQuery . "\n\n";
			
			$str .= ob_get_clean();
			
			$profiler->setEnabled(false);
		}
		
		if ($str) {
			if ($appendRandomID) {
				if ($id) $id .= "_";
				$id .= substr(md5(uniqid(rand(), true)), 0, 10);
			}
			file_put_contents("/tmp/profile" . ($id ? "_" . $id : ""), $str);
		}
	}
	
	
	public static function error(Exception $e, $sql, $params=array(), $shardID=0) {
		$paramsArray = Z_Array::array2string($params);
		
		$error = $e->getMessage();
		$errno = $e->getCode();
		
		$str = "$error\n\n"
				. "Shard: $shardID\n\n"
				. "Query:\n$sql\n\n"
				. "Params:\n$paramsArray\n\n";
		
		if (function_exists('xdebug_get_function_stack')) {
			$str .= Z_Array::array2string(xdebug_get_function_stack());
		}
		
		if (strpos($error, "Can't connect to MySQL server") !== false) {
			throw new Exception($str, Z_ERROR_SHARD_UNAVAILABLE);
		}
		
		throw new Exception($str, $errno);
	}
	
	
	public static function close($shardID=0) {
		$instance = self::getInstance();
		$link = $instance->getShardLink($shardID);
		$link->closeConnection();
	}
}


class Zotero_FullText_DB extends Zotero_DB {
	protected $db = 'fulltext';
	
	protected function __construct() {
		parent::__construct();
	}
}


//
// TODO: Handle failover here instead of in calling code
//
class Zotero_ID_DB_1 extends Zotero_DB {
	protected $db = 'id1';
	
	protected function __construct() {
		parent::__construct();
	}
}


class Zotero_ID_DB_2 extends Zotero_DB {
	protected $db = 'id2';
	
	protected function __construct() {
		parent::__construct();
	}
}


class Zotero_WWW_DB_1 extends Zotero_DB {
	protected $db = 'www1';
	
	protected function __construct() {
		parent::__construct();
	}
}


class Zotero_WWW_DB_2 extends Zotero_DB {
	protected $db = 'www2';
	
	protected function __construct() {
		parent::__construct();
	}
}


class Zotero_Cache_DB extends Zotero_DB {
	protected $db = 'cache';
	
	protected function __construct() {
		parent::__construct();
	}
}


class Zotero_Admin_DB extends Zotero_DB {
	protected $db = 'admin';
	
	protected function __construct() {
		parent::__construct();
	}
}


class Zotero_DB_Statement extends Zend_Db_Statement_Mysqli {
	private $link;
	private $sql;
	private $shardID;
	private $isWriteQuery;
	
	public function __construct($db, $sql, $shardID=0) {
		try {
			parent::__construct($db, $sql);
		}
		catch (Exception $e) {
			Zotero_DB::error($e, $sql, array(), $shardID);
		}
		$this->link = $db;
		$this->sql = $sql;
		$this->shardID = $shardID;
		
		$this->isWriteQuery = Zotero_DB::isWriteQuery($sql);
	}
	
	public function __get($name) {
		switch ($name) {
			case 'link':
			case 'sql':
			case 'shardID':
			case 'isWriteQuery':
				return $this->$name;
		}
		trigger_error("Undefined property '$name' in __get()", E_USER_NOTICE);
		return null;
	}
}
?>
