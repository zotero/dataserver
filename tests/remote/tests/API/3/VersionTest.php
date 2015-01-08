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

namespace APIv3;
use API3 as API;
require_once 'APITests.inc.php';
require_once 'include/api3.inc.php';

class VersionTests extends APITests {
	public static function setUpBeforeClass() {
		parent::setUpBeforeClass();
	}
	
	public static function tearDownAfterClass() {
		parent::tearDownAfterClass();
		API::userClear(self::$config['userID']);
	}
	
	public function setUp() {
		parent::setUp();
		API::userClear(self::$config['userID']);
	}
	
	
	public function testSingleObjectLastModifiedVersion() {
		$this->_testSingleObjectLastModifiedVersion('collection');
		$this->_testSingleObjectLastModifiedVersion('item');
		$this->_testSingleObjectLastModifiedVersion('search');
	}
	
	
	public function testMultiObjectLastModifiedVersion() {
		$this->_testMultiObjectLastModifiedVersion('collection');
		$this->_testMultiObjectLastModifiedVersion('item');
		$this->_testMultiObjectLastModifiedVersion('search');
	}
	
	
	public function testMultiObject304NotModified() {
		$this->_testMultiObject304NotModified('collection');
		$this->_testMultiObject304NotModified('item');
		$this->_testMultiObject304NotModified('search');
		$this->_testMultiObject304NotModified('tag');
	}
	
	
	public function testSinceAndVersionsFormat() {
		$this->_testSinceAndVersionsFormat('collection', 'since');
		$this->_testSinceAndVersionsFormat('item', 'since');
		$this->_testSinceAndVersionsFormat('search', 'since');
		API::userClear(self::$config['userID']);
		$this->_testSinceAndVersionsFormat('collection', 'newer');
		$this->_testSinceAndVersionsFormat('item', 'newer');
		$this->_testSinceAndVersionsFormat('search', 'newer');
	}
	
	
	public function testUploadUnmodified() {
		$this->_testUploadUnmodified('collection');
		$this->_testUploadUnmodified('item');
		$this->_testUploadUnmodified('search');
	}
	
	
	public function testTagsSince() {
		self::_testTagsSince('since');
		API::userClear(self::$config['userID']);
		self::_testTagsSince('newer');
	}
	
	
	private function _testSingleObjectLastModifiedVersion($objectType) {
		$objectTypePlural = API::getPluralObjectType($objectType);
		$keyProp = $objectType . "Key";
		$versionProp = $objectType . "Version";
		
		switch ($objectType) {
		case 'collection':
			$objectKey = API::createCollection("Name", false, $this, 'key');
			break;
		
		case 'item':
			$objectKey = API::createItem("book", array("title" => "Title"), $this, 'key');
			break;
		
		case 'search':
			$objectKey = API::createSearch(
				"Name",
				array(
					array(
						"condition" => "title",
						"operator" => "contains",
						"value" => "test"
					)
				),
				$this,
				'key'
			);
			break;
		}
		
		// JSON: Make sure all three instances of the object version
		// (Last-Modified-Version, 'version', and data.version)
		// match the library version
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural/$objectKey"
		);
		$this->assert200($response);
		$objectVersion = $response->getHeader("Last-Modified-Version");
		$json = API::getJSONFromResponse($response);
		$this->assertEquals($objectVersion, $json['version']);
		$this->assertEquals($objectVersion, $json['data']['version']);
		
		// Atom: Make sure all three instances of the object version
		// (Last-Modified-Version, zapi:version, and the JSON
		// {$objectType}Version property match the library version
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural/$objectKey?content=json"
		);
		$this->assert200($response);
		$objectVersion = $response->getHeader("Last-Modified-Version");
		$xml = API::getXMLFromResponse($response);
		$data = API::parseDataFromAtomEntry($xml);
		$json = json_decode($data['content'], true);
		$this->assertEquals($objectVersion, $json['version']);
		$this->assertEquals($objectVersion, $data['version']);
		
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural?limit=1"
		);
		$this->assert200($response);
		$libraryVersion = $response->getHeader("Last-Modified-Version");
		
		$this->assertEquals($libraryVersion, $objectVersion);
		
		$this->_modifyJSONObject($objectType, $json);
		
		// No If-Unmodified-Since-Version or JSON version property
		unset($json['version']);
		$response = API::userPut(
			self::$config['userID'],
			"$objectTypePlural/$objectKey",
			json_encode($json)
		);
		$this->assert428($response);
		
		// Out of date version
		$response = API::userPut(
			self::$config['userID'],
			"$objectTypePlural/$objectKey",
			json_encode($json),
			array(
				"If-Unmodified-Since-Version: " . ($objectVersion - 1)
			)
		);
		$this->assert412($response);
		
		// Update with version header
		$response = API::userPut(
			self::$config['userID'],
			"$objectTypePlural/$objectKey",
			json_encode($json),
			array(
				"If-Unmodified-Since-Version: " . $objectVersion
			)
		);
		$this->assert204($response);
		$newObjectVersion = $response->getHeader("Last-Modified-Version");
		$this->assertGreaterThan($objectVersion, $newObjectVersion);
		
		// Update object with JSON version property
		$this->_modifyJSONObject($objectType, $json);
		$json['version'] = $newObjectVersion;
		$response = API::userPut(
			self::$config['userID'],
			"$objectTypePlural/$objectKey",
			json_encode($json)
		);
		$this->assert204($response);
		$newObjectVersion2 = $response->getHeader("Last-Modified-Version");
		$this->assertGreaterThan($newObjectVersion, $newObjectVersion2);
		
		// Make sure new library version matches new object version
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural?limit=1"
		);
		$this->assert200($response);
		$newLibraryVersion = $response->getHeader("Last-Modified-Version");
		$this->assertEquals($newObjectVersion2, $newLibraryVersion);
		return;
		
		// Create an item to increase the library version, and make sure
		// original object version stays the same
		API::createItem("book", array("title" => "Title"), $this, 'key');
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural/$objectKey?limit=1"
		);
		$this->assert200($response);
		$newObjectVersion2 = $response->getHeader("Last-Modified-Version");
		$this->assertEquals($newLibraryVersion, $newObjectVersion2);
		
		//
		// Delete object
		//
		
		// No If-Unmodified-Since-Version
		$response = API::userDelete(
			self::$config['userID'],
			"$objectTypePlural/$objectKey"
		);
		$this->assert428($response);
		
		// Outdated If-Unmodified-Since-Version
		$response = API::userDelete(
			self::$config['userID'],
			"$objectTypePlural/$objectKey",
			array(
				"If-Unmodified-Since-Version: " . $objectVersion
			)
		);
		$this->assert412($response);
		
		// Delete object
		$response = API::userDelete(
			self::$config['userID'],
			"$objectTypePlural/$objectKey",
			array(
				"If-Unmodified-Since-Version: " . $newObjectVersion2
			)
		);
		$this->assert204($response);
	}
	
	
	private function _modifyJSONObject($objectType, &$json) {
		// Modifying object should increase its version
		switch ($objectType) {
		case 'collection':
			$json['name'] = "New Name " . uniqid();
			break;
		
		case 'item':
			$json['title'] = "New Title" . uniqid();
			break;
		
		case 'search':
			$json['name'] = "New Name" . uniqid();
			break;
		}
	}
	
	
	private function _testMultiObjectLastModifiedVersion($objectType) {
		$objectTypePlural = API::getPluralObjectType($objectType);
		
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural?limit=1"
		);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version));
		
		switch ($objectType) {
		case 'collection':
			$json = new \stdClass();
			$json->name = "Name";
			break;
		
		case 'item':
			$json = API::getItemTemplate("book");
			break;
		
		case 'search':
			$json = new \stdClass();
			$json->name = "Name";
			$json->conditions = array(
				array(
					"condition" => "title",
					"operator" => "contains",
					"value" => "test"
				)
			);
			break;
		}
		
		// Outdated library version
		$response = API::userPost(
			self::$config['userID'],
			"$objectTypePlural",
			json_encode(array(
				$objectTypePlural => array($json)
			)),
			array(
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: " . ($version - 1)
			)
		);
		$this->assert412($response);
		
		// Make sure version didn't change during failure
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural?limit=1"
		);
		$this->assertEquals($version, $response->getHeader("Last-Modified-Version"));
		
		// Create a new object, using library timestamp
		$response = API::userPost(
			self::$config['userID'],
			"$objectTypePlural",
			json_encode([$json]),
			array(
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: $version"
			)
		);
		$this->assert200($response);
		$version2 = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version2));
		// Version should be incremented on new object
		$this->assertGreaterThan($version, $version2);
		$objectKey = API::getFirstSuccessKeyFromResponse($response);
		
		// Check single-object request
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural/$objectKey"
		);
		$this->assert200($response);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version));
		$this->assertEquals($version, $version2);
		$json = API::getJSONFromResponse($response)['data'];
		
		// Modify object
		$json['key'] = $objectKey;
		switch ($objectType) {
		case 'collection':
			$json['name'] = "New Name";
			break;
		
		case 'item':
			$json['title'] = "New Title";
			break;
		
		case 'search':
			$json['name'] = "New Name";
			break;
		}
		
		// No If-Unmodified-Since-Version or object version property
		unset($json['version']);
		$response = API::userPost(
			self::$config['userID'],
			"$objectTypePlural",
			json_encode([$json]),
			array("Content-Type: application/json")
		);
		$this->assert428ForObject($response);
		
		// Outdated object version property
		$json['version'] = $version - 1;
		$response = API::userPost(
			self::$config['userID'],
			"$objectTypePlural",
			json_encode([$json]),
			array(
				"Content-Type: application/json"
			)
		);
		$this->assert412ForObject($response, ucwords($objectType)
			. " has been modified since specified version "
			. "(expected {$json['version']}, found $version)");
		
		// Modify object, using object version property
		$json['version'] = $version;
		$response = API::userPost(
			self::$config['userID'],
			"$objectTypePlural",
			json_encode([$json]),
			array("Content-Type: application/json")
		);
		$this->assert200($response);
		// Version should be incremented on modified object
		$version3 = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version3));
		$this->assertGreaterThan($version2, $version3);
		
		// Check library version
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural"
		);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version));
		$this->assertEquals($version, $version3);
		
		// Check single-object request
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural/$objectKey"
		);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version));
		$this->assertEquals($version, $version3);
		
		// TODO: Version should be incremented on deleted item
	}
	
	
	private function _testMultiObject304NotModified($objectType) {
		$objectTypePlural = API::getPluralObjectType($objectType);
		
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural"
		);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertTrue(is_numeric($version));
		
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural",
			array(
				"If-Modified-Since-Version: $version"
			)
		);
		$this->assert304($response);
	}
	
	
	private function _testSinceAndVersionsFormat($objectType, $sinceParam) {
		$objectTypePlural = API::getPluralObjectType($objectType);
		
		$dataArray = [];
		
		switch ($objectType) {
		case 'collection':
			$dataArray[] = API::createCollection("Name", false, $this, 'jsonData');
			$dataArray[] = API::createCollection("Name", false, $this, 'jsonData');
			$dataArray[] = API::createCollection("Name", false, $this, 'jsonData');
			break;
		
		case 'item':
			$dataArray[] = API::createItem("book", array("title" => "Title"), $this, 'jsonData');
			$dataArray[] = API::createNoteItem("Foo", $dataArray[0]['key'], $this, 'jsonData');
			$dataArray[] = API::createItem("book", array("title" => "Title"), $this, 'jsonData');
			$dataArray[] = API::createItem("book", array("title" => "Title"), $this, 'jsonData');
			break;
		
		
		case 'search':
			$dataArray[] = API::createSearch(
				"Name",
				array(
					array(
						"condition" => "title",
						"operator" => "contains",
						"value" => "test"
					)
				),
				$this,
				'jsonData'
			);
			$dataArray[] = API::createSearch(
				"Name",
				array(
					array(
						"condition" => "title",
						"operator" => "contains",
						"value" => "test"
					)
				),
				$this,
				'jsonData'
			);
			$dataArray[] = API::createSearch(
				"Name",
				array(
					array(
						"condition" => "title",
						"operator" => "contains",
						"value" => "test"
					)
				),
				$this,
				'jsonData'
			);
		}
		
		$objects = $dataArray;
		
		$firstVersion = $objects[0]['version'];
		
		$response = API::userGet(
			self::$config['userID'],
			"$objectTypePlural?format=versions&$sinceParam=$firstVersion"
		);
		
		$this->assert200($response);
		$json = json_decode($response->getBody(), true);
		$this->assertNotNull($json);
		$this->assertCount(sizeOf($objects) - 1, $json);
		$keys = array_keys($json);
		
		if ($objectType == 'item') {
			$this->assertEquals($objects[3]['key'], array_shift($keys));
			$this->assertEquals($objects[3]['version'], array_shift($json));
		}
		$this->assertEquals($objects[2]['key'], array_shift($keys));
		$this->assertEquals($objects[2]['version'], array_shift($json));
		$this->assertEquals($objects[1]['key'], array_shift($keys));
		$this->assertEquals($objects[1]['version'], array_shift($json));
		$this->assertEmpty($json);
		
		// Test /top for items
		if ($objectType == 'item') {
			$response = API::userGet(
				self::$config['userID'],
				"items/top?format=versions&$sinceParam=$firstVersion"
			);
			
			$this->assert200($response);
			$json = json_decode($response->getBody(), true);
			$this->assertNotNull($json);
			$this->assertCount(sizeOf($objects) - 2, $json); // Exclude first item and child
			$keys = array_keys($json);
			
			$objects = $dataArray;
			
			$this->assertEquals($objects[3]['key'], array_shift($keys));
			$this->assertEquals($objects[3]['version'], array_shift($json));
			$this->assertEquals($objects[2]['key'], array_shift($keys));
			$this->assertEquals($objects[2]['version'], array_shift($json));
			$this->assertEmpty($json);
		}
	}
	
	private function _testUploadUnmodified($objectType) {
		$objectTypePlural = API::getPluralObjectType($objectType);
		
		switch ($objectType) {
		case 'collection':
			$data = API::createCollection("Name", false, $this, 'jsonData');
			break;
		
		case 'item':
			$data = API::createItem("book", array("title" => "Title"), $this, 'jsonData');
			break;
		
		case 'search':
			$data = API::createSearch("Name", 'default', $this, 'jsonData');
			break;
		}
		
		$version = $data['version'];
		$this->assertNotEquals(0, $version);
		
		$response = API::userPut(
			self::$config['userID'],
			"$objectTypePlural/{$data['key']}",
			json_encode($data)
		);
		$this->assert204($response);
		$this->assertEquals($version, $response->getHeader("Last-Modified-Version"));
		
		switch ($objectType) {
		case 'collection':
			$json = API::getCollection($data['key'], $this, 'json');
			break;
		
		case 'item':
			$json = API::getItem($data['key'], $this, 'json');
			break;
		
		case 'search':
			$json = API::getSearch($data['key'], $this, 'json');
			break;
		}
		$this->assertEquals($version, $json['version']);
	}
	
	
	private function _testTagsSince($param) {
		$tags1 = array("a", "aa", "b");
		$tags2 = array("b", "c", "cc");
		
		$data1 = API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag);
			}, $tags1)
		), $this, 'jsonData');
		
		$data2 = API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag);
			}, $tags2)
		), $this, 'jsonData');
		
		// Only newly added tags should be included in 'since',
		// not previously added tags or tags added to items
		$response = API::userGet(
			self::$config['userID'],
			"tags?$param=" . $data1['version']
		);
		$this->assertNumResults(2, $response);
		
		// Deleting an item shouldn't update associated tag versions
		$response = API::userDelete(
			self::$config['userID'],
			"items/{$data1['key']}",
			array(
				"If-Unmodified-Since-Version: " . $data1['version']
			)
		);
		$this->assert204($response);
		
		$response = API::userGet(
			self::$config['userID'],
			"tags?$param=" . $data1['version']
		);
		$this->assertNumResults(2, $response);
		$libraryVersion = $response->getHeader("Last-Modified-Version");
		
		$response = API::userGet(
			self::$config['userID'],
			"tags?$param=" . $libraryVersion
		);
		$this->assertNumResults(0, $response);
	}
}
