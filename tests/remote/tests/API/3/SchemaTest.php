<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2019 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://digitalscholar.org
    
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

class SchemaTests extends APITests {
	private static $legacySchemaErrorMessage =
		"Some data in “My Library” was created in a newer version of Zotero and could not be downloaded. "
			. "Upgrade Zotero to continue syncing this library.";
	
	public function test_should_reject_download_from_old_client_for_item_using_newer_schema() {
		$key = API::createItem(
			"book",
			[
				'originalDate' => '2018'
			],
			$this,
			'key'
		);
		
		// Property should show up in 5.0.78
		//
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.78'
			]
		);
		$this->assert200($response);
		$this->assertEquals('2018', API::getJSONFromResponse($response)['data']['originalDate']);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.78'
			]
		);
		$this->assert200($response);
		$this->assertEquals('2018', API::getJSONFromResponse($response)[0]['data']['originalDate']);
		
		// Should be an error in 5.0.77
		//
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert400($response, self::$legacySchemaErrorMessage, 0);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert400($response, self::$legacySchemaErrorMessage, 0);
	}
	
	
	public function test_should_not_reject_download_from_old_client_for_collection_using_legacy_schema() {
		$key = API::createCollection("Foo", [], $this, 'key');
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"collections/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"collections?collectionKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
	
	
	public function test_should_not_reject_download_from_old_client_for_search_using_legacy_schema() {
		$key = API::createSearch(
			"Foo",
			[
				[
					"condition" => "title",
					"operator" => "contains",
					"value" => "test"
				]
			],
			$this,
			'key'
		);
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"searches/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"searches?searchKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
	
	
	public function test_should_not_reject_download_from_old_client_for_item_using_legacy_schema() {
		$key = API::createItem(
			"book",
			[
				'title' => 'Foo',
				'deleted' => true,
				'inPublications' => true
			],
			$this,
			'key'
		);
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		$this->assertEquals(1, $json['data']['deleted']);
		$this->assertTrue($json['data']['inPublications']);
		
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
	
	public function test_should_not_reject_download_from_old_client_for_attachment_using_legacy_schema() {
		$key = API::createAttachmentItem("imported_file", [], false, $this, 'key');
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
	
	public function test_should_not_reject_download_from_old_client_for_linked_file_attachment_using_legacy_schema() {
		$key = API::createAttachmentItem("linked_file", ['path' => '/home/user/foo.pdf'], false, $this, 'key');
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
	
	public function test_should_not_reject_download_from_old_client_for_note_using_legacy_schema() {
		$key = API::createNoteItem("Test", false, $this, 'key');
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
	
	public function test_should_not_reject_download_from_old_client_for_child_note_using_legacy_schema() {
		$parentKey = $key = API::createItem("book", null, $this, 'key');
		$key = API::createNoteItem("Test", $parentKey, $this, 'key');
		
		// Single-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items/$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
		// Multi-object endpoint
		$response = API::userGet(
			self::$config['userID'],
			"items?itemKey=$key",
			[
				'X-Zotero-Version: 5.0.77'
			]
		);
		$this->assert200($response);
	}
}