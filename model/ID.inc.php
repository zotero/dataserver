<?
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

class Zotero_ID {
	/*
	* Gets an unused primary key id for a DB table
	*/             
	public static function get($table) {
		switch ($table) {
			case 'collections':
			case 'creators':
			case 'items':
			case 'relations':
			case 'savedSearches':
			case 'tags':
				return self::getNext($table);
			
			case 'creatorTypes':
			case 'fields':
			case 'itemTypes':
				return self::getMaxPlus1($table);
			
			default:
				trigger_error("Unsupported table '$table'", E_USER_ERROR);
		}
	}
	
	
	public static function getKey() {
		return Zotero_Utilities::randomString(8, 'key', true);
	}
	
	
	public static function isValidKey($key) {
		return preg_match('/^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/', $key);
	}
	
	
	public static function getBigInt() {
		return rand(1, 2147483647);
	}
	
	
	private static function getTableColumn($table) {
		switch ($table) {
		default:
			return substr($table, 0, strlen($table) - 1) . 'ID';
		}
	}
	
	
	// ID server that failed during this request, which is skipped for the rest of it
	private static $failedServer;
	
	/*              
	* Get MAX(id) + 1 from ids databases
	*/                     
	private static function getNext($table) {
		$sql = "REPLACE INTO $table (stub) VALUES ('a')";
		if (self::$failedServer) {
			$servers = [self::$failedServer == 1 ? 2 : 1];
		}
		else {
			$servers = Z_Core::probability(2) ? [1, 2] : [2, 1];
		}
		
		foreach ($servers as $i => $server) {
			$class = "Zotero_ID_DB_$server";
			try {
				$class::query($sql);
				$id = $class::valueQuery("SELECT LAST_INSERT_ID()");
				break;
			}
			catch (Exception $e) {
				Z_Core::logError(
					"Error accessing ID server $server: " . strtok($e->getMessage(), "\n")
				);
				// Rethrow if there's no other server to try
				if ($i == sizeOf($servers) - 1) {
					throw $e;
				}
				self::$failedServer = $server;
			}
		}
		
		if (!$id || !is_int($id)) {
			throw new Exception("Invalid id $id");
		}
		
		return $id;
	}
	
	private static $lastMax = [];
	
	/**
	 * Get MAX(id) + 1 from table
	 *
	 * @return {Promise<Integer>}
	 */
	private static function getMaxPlus1($table) {
		if (isset(self::$lastMax[$table])) {
			return ++self::$lastMax[$table];
		}
		
		$col = self::getTableColumn($table);
		$sql = "SELECT COALESCE(MAX($col) + 1, 1) FROM $table "
			// TEMP
			. "WHERE $col < 10000";
		return self::$lastMax[$table] = Zotero_DB::valueQuery($sql);
	}
}
