<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2012 Center for History and New Media
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

require_once __DIR__ . '/http.inc.php';

use \API2 as API;

class API2 {
	private static $config;
	private static $nsZAPI;
	private static $apiVersion = false;
	
	public static function loadConfig() {
		require 'include/config.inc.php';
		foreach ($config as $k => $v) {
			self::$config[$k] = $v;
		}
		self::$nsZAPI = 'http://zotero.org/ns/api';
	}
	
	
	public static function useAPIVersion($apiVersion) {
		self::$apiVersion = $apiVersion;
	}
	
	
	//
	// Item modification methods
	//
	public static function getItemTemplate($itemType) {
		$response = self::get("items/new?itemType=$itemType");
		return json_decode($response->getBody());
	}
	
	
	public static function createItem($itemType, $data=array(), $context=null, $responseFormat='atom') {
		$json = self::getItemTemplate($itemType);
		
		if ($data) {
			foreach ($data as $field => $val) {
				$json->$field = $val;
			}
		}
		
		$response = self::userPost(
			self::$config['userID'],
			"items?key=" . self::$config['apiKey'],
			json_encode(array(
				"items" => array($json)
			)),
			array("Content-Type: application/json")
		);
		
		return self::handleCreateResponse('item', $response, $responseFormat, $context);
	}
	
	
	/**
	 * POST a JSON item object to the main test user's account
	 * and return the response
	 */
	public static function postItem($json) {
		return self::postItems(array($json));
	}
	
	
	/**
	 * POST a JSON items object to the main test user's account
	 * and return the response
	 */
	public static function postItems($json) {
		return self::userPost(
			self::$config['userID'],
			"items?key=" . self::$config['apiKey'],
			json_encode(array(
				"items" => $json
			)),
			array("Content-Type: application/json")
		);
	}
	
	
	public static function groupCreateItem($groupID, $itemType, $context=null, $responseFormat='atom') {
		$response = self::get("items/new?itemType=$itemType");
		$json = json_decode($response->getBody());
		
		$response = self::groupPost(
			$groupID,
			"items?key=" . self::$config['apiKey'],
			json_encode(array(
				"items" => array($json)
			)),
			array("Content-Type: application/json")
		);
		if ($context) {
			$context->assert200($response);
		}
		
		$json = self::getJSONFromResponse($response);
		
		if ($responseFormat != 'json' && sizeOf($json['success']) != 1) {
			var_dump($json);
			throw new Exception("Item creation failed");
		}
		
		switch ($responseFormat) {
		case 'json':
			return $json;
		
		case 'key':
			return array_shift($json['success']);
		
		case 'atom':
			$itemKey = array_shift($json['success']);
			return self::groupGetItemXML($groupID, $itemKey, $context);
		
		default:
			throw new Exception("Invalid response format '$responseFormat'");
		}
	}
	
	
	public static function createAttachmentItem($linkMode, $data=[], $parentKey=false, $context=false, $responseFormat='atom') {
		$response = self::get("items/new?itemType=attachment&linkMode=$linkMode");
		$json = json_decode($response->getBody());
		foreach ($data as $key => $val) {
			$json->{$key} = $val;
		}
		if ($parentKey) {
			$json->parentItem = $parentKey;
		}
		
		$response = self::userPost(
			self::$config['userID'],
			"items?key=" . self::$config['apiKey'],
			json_encode(array(
				"items" => array($json)
			)),
			array("Content-Type: application/json")
		);
		if ($context) {
			$context->assert200($response);
		}
		
		$json = self::getJSONFromResponse($response);
		
		if ($responseFormat != 'json' && sizeOf($json['success']) != 1) {
			var_dump($json);
			throw new Exception("Item creation failed");
		}
		
		switch ($responseFormat) {
		case 'json':
			return $json;
		
		case 'key':
			return array_shift($json['success']);
		
		case 'atom':
			$itemKey = array_shift($json['success']);
			$xml = self::getItemXML($itemKey, $context);
			if ($context) {
				$data = self::parseDataFromAtomEntry($xml);
				$json = json_decode($data['content']);
				$context->assertEquals($linkMode, $json->linkMode);
			}
			return $xml;
			
			return self::getXMLFromResponse($response);
		
		default:
			throw new Exception("Invalid response format '$responseFormat'");
		}
	}
	
	
	public static function groupCreateAttachmentItem($groupID, $linkMode, $data=[], $parentKey=false, $context=false, $responseFormat='atom') {
		$response = self::get("items/new?itemType=attachment&linkMode=$linkMode");
		$json = json_decode($response->getBody());
		foreach ($data as $key => $val) {
			$json->{$key} = $val;
		}
		if ($parentKey) {
			$json->parentItem = $parentKey;
		}
		
		$response = self::groupPost(
			$groupID,
			"items?key=" . self::$config['apiKey'],
			json_encode(array(
				"items" => array($json)
			)),
			array("Content-Type: application/json")
		);
		if ($context) {
			$context->assert200($response);
		}
		
		$json = self::getJSONFromResponse($response);
		
		if ($responseFormat != 'json' && sizeOf($json['success']) != 1) {
			var_dump($json);
			throw new Exception("Item creation failed");
		}
		
		switch ($responseFormat) {
		case 'json':
			return $json;
		
		case 'key':
			return array_shift($json['success']);
		
		case 'atom':
			$itemKey = array_shift($json['success']);
			$xml = self::groupGetItemXML($groupID, $itemKey, $context);
			if ($context) {
				$data = self::parseDataFromAtomEntry($xml);
				$json = json_decode($data['content']);
				$context->assertEquals($linkMode, $json->linkMode);
			}
			return $xml;
		
		default:
			throw new Exception("Invalid response format '$responseFormat'");
		}
	}
	
	
	public static function createNoteItem($text="", $parentKey=false, $context=false, $responseFormat='atom') {
		$response = self::get("items/new?itemType=note");
		$json = json_decode($response->getBody());
		$json->note = $text;
		if ($parentKey) {
			$json->parentItem = $parentKey;
		}
		
		$response = self::userPost(
			self::$config['userID'],
			"items?key=" . self::$config['apiKey'],
			json_encode(array(
				"items" => array($json)
			)),
			array("Content-Type: application/json")
		);
		if ($context) {
			$context->assert200($response);
		}
		
		$json = self::getJSONFromResponse($response);
		
		if ($responseFormat != 'json' && sizeOf($json['success']) != 1) {
			var_dump($json);
			throw new Exception("Item creation failed");
		}
		
		switch ($responseFormat) {
		case 'json':
			return $json;
		
		case 'key':
			return array_shift($json['success']);
		
		case 'atom':
			$itemKey = array_shift($json['success']);
			$xml = self::getItemXML($itemKey, $context);
			if ($context) {
				$data = self::parseDataFromAtomEntry($xml);
				$json = json_decode($data['content']);
				$context->assertEquals($text, $json->note);
			}
			return $xml;
		
		default:
			throw new Exception("Invalid response format '$responseFormat'");
		}
	}
	
	
	public static function createCollection($name, $data=array(), $context=null, $responseFormat='atom') {
		if (is_array($data)) {
			$parent = isset($data['parentCollection']) ? $data['parentCollection'] : false;
			$relations = isset($data['relations']) ? $data['relations'] : new stdClass;
		}
		else {
			$parent = $data ? $data : false;
			$relations = new stdClass;
		}
		
		$json = array(
			"collections" => array(
				array(
					'name' => $name,
					'parentCollection' => $parent,
					'relations' => $relations
				)
			)
		);
		
		$response = self::userPost(
			self::$config['userID'],
			"collections?key=" . self::$config['apiKey'],
			json_encode($json),
			array("Content-Type: application/json")
		);
		
		return self::handleCreateResponse('collection', $response, $responseFormat, $context);
	}
	
	
	public static function createSearch($name, $conditions=array(), $context=null, $responseFormat='atom') {
		if ($conditions == 'default') {
			$conditions = array(
				array(
					'condition' => 'title',
					'operator' => 'contains',
					'value' => 'test'
				)
			);
		}
		
		$json = array(
			"searches" => array(
				array(
					'name' => $name,
					'conditions' => $conditions
				)
			)
		);
		
		$response = self::userPost(
			self::$config['userID'],
			"searches?key=" . self::$config['apiKey'],
			json_encode($json),
			array("Content-Type: application/json")
		);
		
		return self::handleCreateResponse('search', $response, $responseFormat, $context);
	}
	
	
	public static function getLibraryVersion() {
		$response = self::userGet(
			self::$config['userID'],
			"items?key=" . self::$config['apiKey'] . "&format=keys&limit=1"
		);
		return $response->getHeader("Last-Modified-Version");
	}
	
	
	public static function getGroupLibraryVersion($groupID) {
		$response = self::groupGet(
			$groupID,
			"items?key=" . self::$config['apiKey'] . "&format=keys&limit=1"
		);
		return $response->getHeader("Last-Modified-Version");
	}
	
	
	public static function getItemXML($keys, $context=null) {
		return self::getObjectXML('item', $keys, $context);
	}
	
	
	public static function groupGetItemXML($groupID, $keys, $context=null) {
		if (is_scalar($keys)) {
			$keys = array($keys);
		}
		
		$response = self::groupGet(
			$groupID,
			"items?key=" . self::$config['apiKey']
				. "&itemKey=" . implode(',', $keys) . "&order=itemKeyList"
				. "&content=json"
		);
		if ($context) {
			$context->assert200($response);
		}
		return self::getXMLFromResponse($response);
	}
	
	
	public static function getXMLFromFirstSuccessItem($response) {
		$key = self::getFirstSuccessKeyFromResponse($response);
		self::getItemXML($key);
	}
	
	
	public static function getCollectionXML($keys, $context=null) {
		return self::getObjectXML('collection', $keys, $context);
	}
	
	
	public static function getSearchXML($keys, $context=null) {
		return self::getObjectXML('search', $keys, $context);
	}
	
	
	//
	// HTTP methods
	//
	public static function get($url, $headers=array(), $auth=false) {
		$url = self::$config['apiURLPrefix'] . $url;
		if (self::$apiVersion) {
			$headers[] = "Zotero-API-Version: " . self::$apiVersion;
		}
		$response = HTTP::get($url, $headers, $auth);
		if (self::$config['verbose'] >= 2) {
			echo "\n\n" . $response->getBody() . "\n";
		}
		return $response;
	}
	
	public static function userGet($userID, $suffix, $headers=array(), $auth=false) {
		return self::get("users/$userID/$suffix", $headers, $auth);
	}
	
	public static function groupGet($groupID, $suffix, $headers=array(), $auth=false) {
		return self::get("groups/$groupID/$suffix", $headers, $auth);
	}
	
	public static function post($url, $data, $headers=array(), $auth=false) {
		$url = self::$config['apiURLPrefix'] . $url;
		if (self::$apiVersion) {
			$headers[] = "Zotero-API-Version: " . self::$apiVersion;
		}
		$response = HTTP::post($url, $data, $headers, $auth);
		return $response;
	}
	
	public static function userPost($userID, $suffix, $data, $headers=array(), $auth=false) {
		return self::post("users/$userID/$suffix", $data, $headers, $auth);
	}
	
	public static function groupPost($groupID, $suffix, $data, $headers=array(), $auth=false) {
		return self::post("groups/$groupID/$suffix", $data, $headers, $auth);
	}
	
	public static function put($url, $data, $headers=array(), $auth=false) {
		$url = self::$config['apiURLPrefix'] . $url;
		if (self::$apiVersion) {
			$headers[] = "Zotero-API-Version: " . self::$apiVersion;
		}
		$response = HTTP::put($url, $data, $headers, $auth);
		return $response;
	}
	
	public static function userPut($userID, $suffix, $data, $headers=array(), $auth=false) {
		return self::put("users/$userID/$suffix", $data, $headers, $auth);
	}
	
	public static function groupPut($groupID, $suffix, $data, $headers=array(), $auth=false) {
		return self::put("groups/$groupID/$suffix", $data, $headers, $auth);
	}
	
	public static function patch($url, $data, $headers=array(), $auth=false) {
		$url = self::$config['apiURLPrefix'] . $url;
		if (self::$apiVersion) {
			$headers[] = "Zotero-API-Version: " . self::$apiVersion;
		}
		$response = HTTP::patch($url, $data, $headers, $auth);
		return $response;
	}
	
	public static function userPatch($userID, $suffix, $data, $headers=array()) {
		return self::patch("users/$userID/$suffix", $data, $headers);
	}
	
	public static function head($url, $headers=array(), $auth=false) {
		$url = self::$config['apiURLPrefix'] . $url;
		if (self::$apiVersion) {
			$headers[] = "Zotero-API-Version: " . self::$apiVersion;
		}
		$response = HTTP::head($url, $headers, $auth);
		return $response;
	}
	
	public static function userHead($userID, $suffix, $headers=array(), $auth=false) {
		return self::head("users/$userID/$suffix", $headers, $auth);
	}
	
	public static function delete($url, $headers=array(), $auth=false) {
		$url = self::$config['apiURLPrefix'] . $url;
		if (self::$apiVersion) {
			$headers[] = "Zotero-API-Version: " . self::$apiVersion;
		}
		$response = HTTP::delete($url, $headers, $auth);
		return $response;
	}
	
	public static function userDelete($userID, $suffix, $headers=array(), $auth=false) {
		return self::delete("users/$userID/$suffix", $headers, $auth);
	}
	
	public static function groupDelete($groupID, $suffix, $headers=array(), $auth=false) {
		return self::delete("groups/$groupID/$suffix", $headers, $auth);
	}
	
	
	public static function userClear($userID) {
		$response = self::userPost(
			$userID,
			"clear",
			"",
			array(),
			array(
				"username" => self::$config['rootUsername'],
				"password" => self::$config['rootPassword']
			)
		);
		if ($response->getStatus() != 204) {
			var_dump($response->getBody());
			throw new Exception("Error clearing user $userID");
		}
	}
	
	public static function groupClear($groupID) {
		$response = self::groupPost(
			$groupID,
			"clear",
			"",
			array(),
			array(
				"username" => self::$config['rootUsername'],
				"password" => self::$config['rootPassword']
			)
		);
		if ($response->getStatus() != 204) {
			var_dump($response->getBody());
			throw new Exception("Error clearing group $groupID");
		}
	}
	
	
	//
	// Response parsing
	//
	public static function getXMLFromResponse($response) {
		try {
			$xml = new SimpleXMLElement($response->getBody());
		}
		catch (Exception $e) {
			var_dump($response->getBody());
			throw $e;
		}
		$xml->registerXPathNamespace('atom', 'http://www.w3.org/2005/Atom');
		$xml->registerXPathNamespace('zapi', 'http://zotero.org/ns/api');
		return $xml;
	}
	
	
	public static function getJSONFromResponse($response) {
		$json = json_decode($response->getBody(), true);
		if (is_null($json)) {
			var_dump($response->getBody());
			throw new Exception("JSON response could not be parsed");
		}
		return $json;
	}
	
	
	public static function getFirstSuccessKeyFromResponse($response) {
		$json = self::getJSONFromResponse($response);
		if (empty($json['success'])) {
			var_dump($response->getBody());
			throw new Exception("No success keys found in response");
		}
		return array_shift($json['success']);
	}
	
	
	public static function parseDataFromAtomEntry($entryXML) {
		$key = (string) array_get_first($entryXML->xpath('//atom:entry/zapi:key'));
		$version = (string) array_get_first($entryXML->xpath('//atom:entry/zapi:version'));
		$content = array_get_first($entryXML->xpath('//atom:entry/atom:content'));
		if (is_null($content)) {
			throw new Exception("Atom response does not contain <content>");
		}
		
		// If 'content' contains XML, serialize all subnodes
		if ($content->count()) {
			$content = $content->asXML();
		}
		// Otherwise just get string content
		else {
			$content = (string) $content;
		}
		
		return array(
			"key" => $key,
			"version" => $version,
			"content" => $content
		);
	}
	
	
	public static function getContentFromResponse($response) {
		$xml = self::getXMLFromResponse($response);
		$data = self::parseDataFromAtomEntry($xml);
		return $data['content'];
	}
	
	
	public static function setKeyOption($userID, $key, $option, $val) {
		$response = self::get(
			"users/$userID/keys/$key",
			array(),
			array(
				"username" => self::$config['rootUsername'],
				"password" => self::$config['rootPassword']
			)
		);
		if ($response->getStatus() != 200) {
			var_dump($response->getBody());
			throw new Exception("GET returned " . $response->getStatus());
		}
		
		try {
			$xml = new SimpleXMLElement($response->getBody());
		}
		catch (Exception $e) {
			var_dump($response->getBody());
			throw $e;
		}
		foreach ($xml->access as $access) {
			switch ($option) {
			case 'libraryNotes':
				if (!isset($access['library'])) {
					break;
				}
				$current = (int) $access['notes'];
				if ($current != $val) {
					$access['notes'] = (int) $val;
					$response = self::put(
						"users/" . self::$config['userID'] . "/keys/" . self::$config['apiKey'],
						$xml->asXML(),
						array(),
						array(
							"username" => self::$config['rootUsername'],
							"password" => self::$config['rootPassword']
						)
					);
					if ($response->getStatus() != 200) {
						var_dump($response->getBody());
						throw new Exception("PUT returned " . $response->getStatus());
					}
				}
				break;
			
			case 'libraryWrite':
				if (!isset($access['library'])) {
					continue;
				}
				$current = (int) $access['write'];
				if ($current != $val) {
					$access['write'] = (int) $val;
					$response = self::put(
						"users/" . self::$config['userID'] . "/keys/" . self::$config['apiKey'],
						$xml->asXML(),
						array(),
						array(
							"username" => self::$config['rootUsername'],
							"password" => self::$config['rootPassword']
						)
					);
					if ($response->getStatus() != 200) {
						var_dump($response->getBody());
						throw new Exception("PUT returned " . $response->getStatus());
					}
				}
				break;
			}
		}
	}
	
	
	public static function getPluralObjectType($objectType) {
		if ($objectType == 'search') {
			return $objectType . "es";
		}
		return $objectType . "s";
	}
	
	
	private static function getObjectXML($objectType, $keys, $context=null) {
		$objectTypePlural = self::getPluralObjectType($objectType);
		
		if (is_scalar($keys)) {
			$keys = array($keys);
		}
		
		$response = self::userGet(
			self::$config['userID'],
			"$objectTypePlural?key=" . self::$config['apiKey']
				. "&{$objectType}Key=" . implode(',', $keys) . "&order={$objectType}KeyList"
				. "&content=json"
		);
		if ($context) {
			$context->assert200($response);
		}
		return self::getXMLFromResponse($response);
	}
	
	
	private static function handleCreateResponse($objectType, $response, $responseFormat, $context=null) {
		$uctype = ucwords($objectType);
		
		if ($context) {
			$context->assert200($response);
		}
		
		if ($responseFormat == 'response') {
			return $response;
		}
		
		$json = self::getJSONFromResponse($response);
		
		if ($responseFormat != 'responsejson' && sizeOf($json['success']) != 1) {
			var_dump($json);
			throw new Exception("$uctype creation failed");
		}
		
		if ($responseFormat == 'responsejson') {
			return $json;
		}
		
		$key = array_shift($json['success']);
		
		if ($responseFormat == 'key') {
			return $key;
		}
		
		$func = 'get' . $uctype . 'XML';
		$xml = self::$func($key, $context);
		
		if ($responseFormat == 'atom') {
			return $xml;
		}
		
		$data = self::parseDataFromAtomEntry($xml);
		
		if ($responseFormat == 'data') {
			return $data;
		}
		if ($responseFormat == 'content') {
			return $data['content'];
		}
		if ($responseFormat == 'json') {
			return json_decode($data['content'], true);
		}
		
		throw new Exception("Invalid response format '$responseFormat'");
	}
}

API2::loadConfig();
