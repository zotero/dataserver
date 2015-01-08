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

namespace APIv3;
use API3 as API;
require_once 'APITests.inc.php';
require_once 'include/api3.inc.php';

class PermissionsTest extends APITests {
	public function tearDown() {
		API::setKeyOption(
			self::$config['userID'], self::$config['apiKey'], 'libraryWrite', 1
		);
	}
	
	
	public function testUserGroupsAnonymousJSON() {
		API::useAPIKey(false);
		$response = API::get("users/" . self::$config['userID'] . "/groups");
		$this->assert200($response);
		
		// There should be only one public group
		$this->assertTotalResults(1, $response);
		
		// Make sure it's the right group
		$json = API::getJSONFromResponse($response);
		$this->assertEquals(self::$config['ownedPublicGroupID'], $json[0]['id']);
	}
	
	
	public function testUserGroupsAnonymousAtom() {
		API::useAPIKey(false);
		$response = API::get("users/" . self::$config['userID'] . "/groups?content=json");
		$this->assert200($response);
		
		// There should be only one public group
		$this->assertTotalResults(1, $response);
		
		// Make sure it's the right group
		$xml = API::getXMLFromResponse($response);
		$groupID = (int) array_shift($xml->xpath('//atom:entry/zapi:groupID'));
		$this->assertEquals(self::$config['ownedPublicGroupID'], $groupID);
	}
	
	
	public function testUserGroupsOwned() {
		$response = API::get(
			"users/" . self::$config['userID'] . "/groups?content=json"
			. "&key=" . self::$config['apiKey']
		);
		$this->assert200($response);
		
		$this->assertNumResults(2, $response);
		$this->assertTotalResults(2, $response);
	}
	
	
	/**
	 * A key without note access shouldn't be able to create a note
	 */
	/*public function testKeyNoteAccessWriteError() {
		API::setKeyOption(
			self::$config['userID'], self::$config['apiKey'], 'libraryNotes', 0
		);
		
		$response = API::get("items/new?itemType=note");
		$json = json_decode($response->getBody());
		$json->note = "Test";
		
		$response = API::userPost(
			self::$config['userID'],
			"items",
			json_encode(array(
				"items" => array($json)
			)),
			array("Content-Type: application/json")
		);
		$this->assert403($response);
	}*/
	
	
	public function testKeyNoteAccess() {
		API::userClear(self::$config['userID']);
		
		API::setKeyOption(
			self::$config['userID'], self::$config['apiKey'], 'libraryNotes', 1
		);
		
		$keys = array();
		$topLevelKeys = array();
		$bookKeys = array();
		
		$key = API::createItem('book', array("title" => "A"), $this, 'key');
		$keys[] = $key;
		$topKeys[] = $key;
		$bookKeys[] = $key;
		
		$key = API::createNoteItem("B", false, $this, 'key');
		$keys[] = $key;
		$topKeys[] = $key;
		
		$key = API::createNoteItem("C", false, $this, 'key');
		$keys[] = $key;
		$topKeys[] = $key;
		
		$key = API::createNoteItem("D", false, $this, 'key');
		$keys[] = $key;
		$topKeys[] = $key;
		
		$key = API::createNoteItem("E", false, $this, 'key');
		$keys[] = $key;
		$topKeys[] = $key;
		
		$key = API::createItem('book', array("title" => "F"), $this, 'key');
		$keys[] = $key;
		$topKeys[] = $key;
		$bookKeys[] = $key;
		
		$key = API::createNoteItem("G", $key, $this, 'key');
		$keys[] = $key;
		
		// Create collection and add items to it
		$response = API::userPost(
			self::$config['userID'],
			"collections",
			json_encode([
				[
					"name" => "Test",
					"parentCollection" => false
				]
			]),
			array("Content-Type: application/json")
		);
		$this->assert200ForObject($response);
		$collectionKey = API::getFirstSuccessKeyFromResponse($response);
		
		$response = API::userPost(
			self::$config['userID'],
			"collections/$collectionKey/items",
			implode(" ", $topKeys)
		);
		$this->assert204($response);
		
		//
		// format=atom
		//
		// Root
		$response = API::userGet(
			self::$config['userID'], "items"
		);
		$this->assertNumResults(sizeOf($keys), $response);
		$this->assertTotalResults(sizeOf($keys), $response);
		
		// Top
		$response = API::userGet(
			self::$config['userID'], "items/top"
		);
		$this->assertNumResults(sizeOf($topKeys), $response);
		$this->assertTotalResults(sizeOf($topKeys), $response);
		
		// Collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/top"
		);
		$this->assertNumResults(sizeOf($topKeys), $response);
		$this->assertTotalResults(sizeOf($topKeys), $response);
		
		//
		// format=keys
		//
		// Root
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys"
		);
		$this->assert200($response);
		$this->assertCount(sizeOf($keys), explode("\n", trim($response->getBody())));
		
		// Top
		$response = API::userGet(
			self::$config['userID'],
			"items/top?format=keys"
		);
		$this->assert200($response);
		$this->assertCount(sizeOf($topKeys), explode("\n", trim($response->getBody())));
		
		// Collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/top?format=keys"
		);
		$this->assert200($response);
		$this->assertCount(sizeOf($topKeys), explode("\n", trim($response->getBody())));
		
		// Remove notes privilege from key
		API::setKeyOption(
			self::$config['userID'], self::$config['apiKey'], 'libraryNotes', 0
		);
		
		//
		// format=json
		//
		// totalResults with limit
		$response = API::userGet(
			self::$config['userID'],
			"items?limit=1"
		);
		$this->assertNumResults(1, $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		// And without limit
		$response = API::userGet(
			self::$config['userID'],
			"items"
		);
		$this->assertNumResults(sizeOf($bookKeys), $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		// Top
		$response = API::userGet(
			self::$config['userID'],
			"items/top"
		);
		$this->assertNumResults(sizeOf($bookKeys), $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		// Collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items"
		);
		$this->assertNumResults(sizeOf($bookKeys), $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		//
		// format=atom
		//
		// totalResults with limit
		$response = API::userGet(
			self::$config['userID'],
			"items?format=atom&limit=1"
		);
		$this->assertNumResults(1, $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		// And without limit
		$response = API::userGet(
			self::$config['userID'],
			"items?format=atom"
		);
		$this->assertNumResults(sizeOf($bookKeys), $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		// Top
		$response = API::userGet(
			self::$config['userID'],
			"items/top?format=atom"
		);
		$this->assertNumResults(sizeOf($bookKeys), $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		// Collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items?format=atom"
		);
		$this->assertNumResults(sizeOf($bookKeys), $response);
		$this->assertTotalResults(sizeOf($bookKeys), $response);
		
		//
		// format=keys
		//
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys"
		);
		$keys = explode("\n", trim($response->getBody()));
		sort($keys);
		$this->assertEmpty(
			array_merge(
				array_diff($bookKeys, $keys), array_diff($keys, $bookKeys)
			)
		);
	}
	
	
	public function testTagDeletePermissions() {
		API::userClear(self::$config['userID']);
		
		API::createItem('book', array(
			"tags" => array(
				array(
					"tag" => "A"
				)
			)
		), $this);
		
		$libraryVersion = API::getLibraryVersion();
		
		API::setKeyOption(
			self::$config['userID'], self::$config['apiKey'], 'libraryWrite', 0
		);
		
		$response = API::userDelete(
			self::$config['userID'],
			"tags?tag=A&key=" . self::$config['apiKey']
		);
		$this->assert403($response);
		
		API::setKeyOption(
			self::$config['userID'], self::$config['apiKey'], 'libraryWrite', 1
		);
		
		$response = API::userDelete(
			self::$config['userID'],
			"tags?tag=A&key=" . self::$config['apiKey'],
			array("If-Unmodified-Since-Version: $libraryVersion")
		);
		$this->assert204($response);
	}
}
