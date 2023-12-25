<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2013 Center for History and New Media
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

class Zotero_ItemFeederObserver {
	// SQS has maximum message size of 262144 bytes
	const MAX_JSON_SIZE = 250 * 1024;
	
	public static function init() {
		Zotero_Notifier::registerObserver(
			__CLASS__,
			["item"],
			"ItemFeederObserver"
		);
	}
	
	public static function notify($event, $type, $ids, $extraData) {
		if ($type != "item") return;
		$batch = [];
		foreach ($ids as $id) {
			$data = $extraData[$id];
			if ($event == 'add') {
				list($libraryID, $key) = explode("/", $id);
				$item = Zotero_Items::getByLibraryAndKey($libraryID, $key);
				$arr = [
					'action' => 'add',
					'id' => $id,
					'version' => $item->version,
					'item' => $item->toJSON(true)
				];
			}
			else if ($event == 'modify') {
				list($libraryID, $key) = explode("/", $id);
				$item = Zotero_Items::getByLibraryAndKey($libraryID, $key);
				$arr = [
					'action' => 'modify',
					'id' => $id,
					'version' => $item->version,
					'item' => $item->toJSON(true)
				];
			}
			else if ($event == 'delete') {
				$arr = [
					'action' => 'delete',
					'id' => $id,
					'version' => $data['version']
				];
			}
			
			$json = self::formatLimitedSizeJSON($arr);
			if ($json) {
				$batch[] = $json;
			}
			else {
				Z_Core::logError("Failed to limit JSON size for $id");
			}
			
			// SQS accepts up to 10 messages per batch
			if (count($batch) == 10) {
				self::send($batch);
				$batch = [];
			}
		}
		
		if (count($batch)) {
			self::send($batch);
		}
	}
	
	private static function send($batch) {
		$result = Z_SQS::sendBatch(Z_CONFIG::$ITEM_FEEDER_QUEUE, $batch);
		$failedMessages = $result['Failed'];
		if ($failedMessages) {
			foreach ($failedMessages as $failedMessage) {
				Z_Core::logError('Failed to send message to SQS: '
					. $failedMessage['Message']);
			}
		}
	}
	
	/**
	 * Format JSON and limit its size by emptying its biggest string values
	 * @param $arr
	 * @return null|string
	 */
	private static function formatLimitedSizeJSON($arr) {
		$json = json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		
		$retries_left = 10;
		while (strlen($json) > self::MAX_JSON_SIZE) {
			if (!$retries_left) return null;
			$retries_left--;
			$biggest =& self::getBiggestString($arr);
			if (!$biggest) return null;
			$biggest = 'VALUE TOO BIG!';
			$json = json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		}
		return $json;
	}
	
	/**
	 * Get a reference to the biggest string value
	 *
	 * @param $arr
	 * @return null|&string
	 */
	private static function &getBiggestString(&$arr) {
		$biggest = null;
		foreach ($arr as $key => &$value) {
			if (is_array($value)) {
				$biggest_child =& self::getBiggestString($value);
				if ($biggest_child) {
					if (!$biggest || strlen($biggest_child) > strlen($biggest)) {
						$biggest = &$biggest_child;
					}
				}
			}
			else if (is_string($value)) {
				if (!$biggest || strlen($value) > strlen($biggest)) {
					$biggest = &$value;
				}
			}
		}
		return $biggest;
	}
}
