<?
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

class TagTests extends APITests {
	public static function setUpBeforeClass(): void {
		parent::setUpBeforeClass();
		require 'include/config.inc.php';
		API::userClear($config['userID']);
	}
	
	public static function tearDownAfterClass(): void {
		parent::tearDownAfterClass();
		require 'include/config.inc.php';
		API::userClear($config['userID']);
	}
	
	
	
	public function setUp(): void {
		parent::setUp();
		API::userClear(self::$config['userID']);
	}
	
	public function test_empty_tag_should_be_ignored() {
		$json = API::getItemTemplate("book");
		$json->tags[] = [
			"tag" => "A"
		];
		$json->tags[] = [
			"tag" => "",
			"type" => 1
		];
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		$json = API::getJSONFromResponse($response);
		$json = $json['successful'][0]['data'];
		$this->assertSame($json['tags'], [['tag' => 'A']]);
	}
	
	public function test_empty_tag_with_whitespace_should_be_ignored() {
		$json = API::getItemTemplate("book");
		$json->tags[] = [
			"tag" => "A"
		];
		$json->tags[] = [
			"tag" => " ",
			"type" => 1
		];
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		$json = API::getJSONFromResponse($response);
		$json = $json['successful'][0]['data'];
		$this->assertSame($json['tags'], [['tag' => 'A']]);
	}
	
	public function testInvalidTagObject() {
		$json = API::getItemTemplate("book");
		$json->tags[] = array("invalid");
		
		$response = API::postItem($json);
		$this->assert400ForObject($response, "Tag must be an object");
	}
	
	
	public function test_should_add_tag_to_item() {
		$json = API::getItemTemplate("book");
		$json->tags[] = [
			"tag" => "A"
		];
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		$json = API::getJSONFromResponse($response);
		
		$json = $json['successful'][0]['data'];
		$json['tags'][] = [
			"tag" => "C"
		];
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		$json = API::getJSONFromResponse($response);
		
		$json = $json['successful'][0]['data'];
		$json['tags'][] = [
			"tag" => "B"
		];
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		$json = API::getJSONFromResponse($response);
		
		$json = $json['successful'][0]['data'];
		$json['tags'][] = [
			"tag" => "D"
		];
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		$tags = $json['tags'];
		$json = API::getJSONFromResponse($response);
		
		$json = $json['successful'][0]['data'];
		$this->assertSame($tags, $json['tags']);
	}
	
	
	public function test_utf8mb4_tag() {
		$json = API::getItemTemplate("book");
		$json->tags[] = [
			"tag" => "🐻", // 4-byte character
			"type" => 0
		];
		
		$response = API::postItem($json);
		$this->assert200ForObject($response);
		
		$newJSON = API::getJSONFromResponse($response);
		$newJSON = $newJSON['successful'][0]['data'];
		$this->assertCount(1, $newJSON['tags']);
		$this->assertEquals($json->tags[0]['tag'], $newJSON['tags'][0]['tag']);
	}
	
	
	public function testTagTooLong() {
		$tag = \Zotero_Utilities::randomString(300);
		$json = API::getItemTemplate("book");
		$json->tags[] = [
			"tag" => $tag,
			"type" => 1
		];
		
		$response = API::postItem($json);
		$this->assert413ForObject($response);
		$json = API::getJSONFromResponse($response);
		$this->assertEquals($tag, $json['failed'][0]['data']['tag']);
	}
	
	
	public function testItemTagSearch() {
		API::userClear(self::$config['userID']);
		
		// Create items with tags
		$key1 = API::createItem("book", array(
			"tags" => array(
				array("tag" => "a"),
				array("tag" => "b")
			)
		), $this, 'key');
		
		$key2 = API::createItem("book", array(
			"tags" => array(
				array("tag" => "a"),
				array("tag" => "c")
			)
		), $this, 'key');
		
		//
		// Searches
		//
		
		// a (both)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=a"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(2, $keys);
		$this->assertContains($key1, $keys);
		$this->assertContains($key2, $keys);
		
		// a and c (#2)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=a&tag=c"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(1, $keys);
		$this->assertContains($key2, $keys);
		
		// b and c (none)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=b&tag=c"
		);
		$this->assert200($response);
		$this->assertEmpty(trim($response->getBody()));
		
		// b or c (both)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=b%20||%20c"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(2, $keys);
		$this->assertContains($key1, $keys);
		$this->assertContains($key2, $keys);
		
		// a or b or c (both)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=a%20||%20b%20||%20c"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(2, $keys);
		$this->assertContains($key1, $keys);
		$this->assertContains($key2, $keys);
		
		// not a (none)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=-a"
		);
		$this->assert200($response);
		$this->assertEmpty(trim($response->getBody()));
		
		// not b (#2)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=-b"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(1, $keys);
		$this->assertContains($key2, $keys);
		
		// (b or c) and a (both)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=b%20||%20c&tag=a"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(2, $keys);
		$this->assertContains($key1, $keys);
		$this->assertContains($key2, $keys);
		
		// not nonexistent (both)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=-z"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(2, $keys);
		$this->assertContains($key1, $keys);
		$this->assertContains($key2, $keys);
		
		// A (case-insensitive search)
		$response = API::userGet(
			self::$config['userID'],
			"items?format=keys&tag=B"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(1, $keys);
		$this->assertContains($key1, $keys);
	}
	
	
	public function test_should_handle_negation_in_top_requests() {
		API::userClear(self::$config['userID']);
		
		// Create items with tags
		$key1 = API::createItem("book", array(
			"tags" => [
				["tag" => "a"],
				["tag" => "b"]
			]
		), $this, 'key');
		
		$key2 = API::createItem("book", array(
			"tags" => [
				["tag" => "a"],
				["tag" => "c"]
			]
		), $this, 'key');
		API::createAttachmentItem("imported_url", [], $key1, $this, 'jsonData');
		API::createAttachmentItem("imported_url", [], $key2, $this, 'jsonData');
		
		// not b in /top (#2)
		$response = API::userGet(
			self::$config['userID'],
			"items/top?format=keys&tag=-b"
		);
		$this->assert200($response);
		$keys = explode("\n", trim($response->getBody()));
		$this->assertCount(1, $keys);
		$this->assertContains($key2, $keys);
	}
	
	
	public function testKeyedItemWithTags() {
		API::userClear(self::$config['userID']);
		
		// Create items with tags
		require_once '../../model/ID.inc.php';
		$itemKey = \Zotero_ID::getKey();
		$json = API::createItem("book", [
			"key" => $itemKey,
			"version" => 0,
			"tags" => [
				["tag" => "a"],
				["tag" => "b"]
			]
		], $this, 'responseJSON');
		
		$json = API::getItem($itemKey, $this, 'json')['data'];
		$this->assertCount(2, $json['tags']);
		$this->assertContains(['tag' => 'a'], $json['tags']);
		$this->assertContains(['tag' => 'b'], $json['tags']);
	}
	
	
	//
	// /tags subviews
	//
	public function test_tags_within_items() {
		API::userClear(self::$config['userID']);
		
		$collectionKey = API::createCollection("Collection", false, $this, 'key');
		$item1Key = API::createItem(
			"book",
			[
				"title" => "Foo",
				"tags" => [
					["tag" => "a"],
					["tag" => "g"]
				]
			],
			$this,
			'key'
		);
		// Child note
		API::createItem(
			"note",
			[
				"note" => "Test Note 1",
				"parentItem" => $item1Key,
				"tags" => [
					["tag" => "a"],
					["tag" => "e"]
				]
			],
			$this
		);
		// Another item
		API::createItem(
			"book",
			[
				"title" => "Bar",
				"tags" => [
					["tag" => "b"]
				]
			],
			$this
		);
		// Item within collection
		$item4Key = API::createItem(
			"book",
			[
				"title" => "Foo",
				"collections" => [$collectionKey],
				"tags" => [
					["tag" => "a"],
					["tag" => "c"],
					["tag" => "g"]
				]
			],
			$this,
			'key'
		);
		// Child note within collection
		API::createItem(
			"note",
			[
				"note" => "Test Note 2",
				"parentItem" => $item4Key,
				"tags" => [
					["tag" => "a"],
					["tag" => "f"]
				]
			],
			$this
		);
		// Another item within collection
		API::createItem(
			"book",
			[
				"title" => "Bar",
				"collections" => [$collectionKey],
				"tags" => [
					["tag" => "d"]
				]
			],
			$this
		);
		
		// All items, equivalent to /tags
		$response = API::userGet(
			self::$config['userID'],
			"items/tags"
		);
		$this->assert200($response);
		$this->assertNumResults(7, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'b', 'c', 'd', 'e', 'f', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// Top-level items
		$response = API::userGet(
			self::$config['userID'],
			"items/top/tags"
		);
		$this->assert200($response);
		$this->assertNumResults(5, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'b', 'c', 'd', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// All items, filtered by 'tag', equivalent to /tags
		$response = API::userGet(
			self::$config['userID'],
			"items/tags?tag=a"
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEquals(
			['a'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// All items, filtered by 'itemQ'
		$response = API::userGet(
			self::$config['userID'],
			"items/tags?itemQ=foo"
		);
		$this->assert200($response);
		$this->assertNumResults(3, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'c', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		$response = API::userGet(
			self::$config['userID'],
			"items/tags?itemQ=bar"
		);
		$this->assert200($response);
		$this->assertNumResults(2, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['b', 'd'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		$response = API::userGet(
			self::$config['userID'],
			"items/tags?itemQ=Test%20Note"
		);
		$this->assert200($response);
		$this->assertNumResults(3, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'e', 'f'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// All items with the given tags
		$response = API::userGet(
			self::$config['userID'],
			"items/tags?itemTag=a&itemTag=g"
		);
		$this->assert200($response);
		$this->assertNumResults(3, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'c', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// Disjoint tags
		$response = API::userGet(
			self::$config['userID'],
			"items/tags?itemTag=a&itemTag=d"
		);
		$this->assert200($response);
		$this->assertNumResults(0, $response);
		
		// Items within a collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/tags"
		);
		$this->assert200($response);
		$this->assertNumResults(5, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'c', 'd', 'f', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// Top-level items within a collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/top/tags"
		);
		$this->assert200($response);
		$this->assertNumResults(4, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'c', 'd', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// Search within a collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/tags?itemQ=Test%20Note"
		);
		$this->assert200($response);
		$this->assertNumResults(2, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'f'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
		
		// Items with the given tags within a collection
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/tags?itemTag=a&itemTag=g"
		);
		$this->assert200($response);
		$this->assertNumResults(3, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEqualsCanonicalizing(
			['a', 'c', 'g'],
			array_map(function ($tag) { return $tag['tag']; }, $json)
		);
	}
	
	
	public function test_tags_within_items_within_empty_collection() {
		API::userClear(self::$config['userID']);
		
		$collectionKey = API::createCollection("Empty collection", false, $this, 'key');
		$itemKey = API::createItem(
			"book",
			[
				"title" => "Foo",
				"tags" => [
					["tag" => "a"],
					["tag" => "b"]
				]
			],
			$this,
			'key'
		);
		
		$response = API::userGet(
			self::$config['userID'],
			"collections/$collectionKey/items/top/tags"
		);
		$this->assert200($response);
		$this->assertNumResults(0, $response);
	}
	
	
	public function testTagSearch() {
		$tags1 = array("a", "aa", "b");
		$tags2 = array("b", "c", "cc");
		
		$itemKey1 = API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag);
			}, $tags1)
		), $this, 'key');
		
		$itemKey2 = API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag);
			}, $tags2)
		), $this, 'key');
		
		$response = API::userGet(
			self::$config['userID'],
			"tags?tag=" . implode("%20||%20", $tags1)
		);
		$this->assert200($response);
		$this->assertNumResults(sizeOf($tags1), $response);
	}
	
	
	public function testTagQuery() {
		$tags = ["a", "abc", "bab"];
		
		$itemKey = API::createItem("book", [
			"tags" => array_map(function ($tag) {
				return ["tag" => $tag];
			}, $tags)
		], $this, 'key');
		
		$response = API::userGet(
			self::$config['userID'],
			"tags?q=ab"
		);
		$this->assert200($response);
		$this->assertNumResults(2, $response);
		
		$response = API::userGet(
			self::$config['userID'],
			"tags?q=ab&qmode=startswith"
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
	}
	
	
	public function testOrphanedTag() {
		$json = API::createItem("book", array(
			"tags" => [["tag" => "a"]]
		), $this, 'jsonData');
		$libraryVersion1 = $json['version'];
		$itemKey1 = $json['key'];
		
		$json = API::createItem("book", array(
			"tags" => [["tag" => "b"]]
		), $this, 'jsonData');
		$itemKey2 = $json['key'];
		
		$json = API::createItem("book", array(
			"tags" => [["tag" => "b"]]
		), $this, 'jsonData');
		$itemKey3 = $json['key'];
		
		$response = API::userDelete(
			self::$config['userID'],
			"items/$itemKey1",
			array("If-Unmodified-Since-Version: $libraryVersion1")
		);
		$this->assert204($response);
		
		$response = API::userGet(
			self::$config['userID'],
			"tags"
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
		$json = API::getJSONFromResponse($response)[0];
		$this->assertEquals("b", $json['tag']);
	}
	
	
	public function testTagNewer() {
		API::userClear(self::$config['userID']);
		
		// Create items with tags
		API::createItem("book", array(
			"tags" => array(
				array("tag" => "a"),
				array("tag" => "b")
			)
		), $this);
		
		$version = API::getLibraryVersion();
		
		// 'newer' shouldn't return any results
		$response = API::userGet(
			self::$config['userID'],
			"tags?newer=$version"
		);
		$this->assert200($response);
		$this->assertNumResults(0, $response);
		
		// Create another item with tags
		API::createItem("book", array(
			"tags" => array(
				array("tag" => "a"),
				array("tag" => "c")
			)
		), $this);
		
		// 'newer' should return new tag (Atom)
		$response = API::userGet(
			self::$config['userID'],
			"tags?content=json&newer=$version"
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
		$this->assertGreaterThan($version, $response->getHeader('Last-Modified-Version'));
		$xml = API::getXMLFromResponse($response);
		$data = API::parseDataFromAtomEntry($xml);
		$data = json_decode($data['content'], true);
		$this->assertEquals("c", $data['tag']);
		$this->assertEquals(0, $data['type']);
		
		// 'newer' should return new tag (JSON)
		$response = API::userGet(
			self::$config['userID'],
			"tags?newer=$version"
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
		$this->assertGreaterThan($version, $response->getHeader('Last-Modified-Version'));
		$json = API::getJSONFromResponse($response)[0];
		$this->assertEquals("c", $json['tag']);
		$this->assertEquals(0, $json['meta']['type']);
	}
	
	
	public function testMultiTagDelete() {
		$tags1 = array("a", "aa", "b");
		$tags2 = array("b", "c", "cc");
		$tags3 = array("Foo");
		
		API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag);
			}, $tags1)
		), $this, 'key');
		
		API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag, "type" => 1);
			}, $tags2)
		), $this, 'key');
		
		API::createItem("book", array(
			"tags" => array_map(function ($tag) {
				return array("tag" => $tag);
			}, $tags3)
		), $this, 'key');
		
		$libraryVersion = API::getLibraryVersion();
		
		// Missing version header
		$response = API::userDelete(
			self::$config['userID'],
			"tags?tag=" . implode("%20||%20", array_merge($tags1, $tags2))
		);
		$this->assert428($response);
		
		// Outdated version header
		$response = API::userDelete(
			self::$config['userID'],
			"tags?tag=" . implode("%20||%20", array_merge($tags1, $tags2)),
			array("If-Unmodified-Since-Version: " . ($libraryVersion - 1))
		);
		$this->assert412($response);
		
		// Delete
		$response = API::userDelete(
			self::$config['userID'],
			"tags?tag=" . implode("%20||%20", array_merge($tags1, $tags2)),
			array("If-Unmodified-Since-Version: $libraryVersion")
		);
		$this->assert204($response);
		
		// Make sure they're gone
		$response = API::userGet(
			self::$config['userID'],
			"tags?tag=" . implode("%20||%20", array_merge($tags1, $tags2, $tags3))
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
	}
	
	
	public function test_deleting_a_tag_should_update_a_linked_item() {
		$tags = ["a", "aa", "b"];
		
		$itemKey = API::createItem("book", [
			"tags" => array_map(function ($tag) {
				return ["tag" => $tag];
			}, $tags)
		], $this, 'key');
		
		$libraryVersion = API::getLibraryVersion();
		
		// Make sure they're on the item
		$json = API::getItem($itemKey, $this, 'json');
		$this->assertEquals($tags, array_map(function ($tag) { return $tag['tag']; }, $json['data']['tags']));
		
		// Delete
		$response = API::userDelete(
			self::$config['userID'],
			"tags?tag={$tags[0]}",
			["If-Unmodified-Since-Version: $libraryVersion"]
		);
		$this->assert204($response);
		
		// Make sure they're gone from the item
		$response = API::userGet(
			self::$config['userID'],
			"items?since=$libraryVersion"
		);
		$this->assert200($response);
		$this->assertNumResults(1, $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEquals(
			array_map(function ($tag) { return $tag['tag']; }, $json[0]['data']['tags']),
			array_slice($tags, 1)
		);
	}
	
	
	/**
	 * When modifying a tag on an item, only the item itself should have its
	 * version updated, not other items that had (and still have) the same tag
	 */
	public function testTagAddItemVersionChange() {
		$data1 = API::createItem("book", array(
			"tags" => array(
				array("tag" => "a"),
				array("tag" => "b")
			)
		), $this, 'jsonData');
		$version1 = $data1['version'];
		
		$data2 = API::createItem("book", array(
			"tags" => array(
				array("tag" => "a"),
				array("tag" => "c")
			)
		), $this, 'jsonData');
		$version2 = $data2['version'];
		
		// Remove tag 'a' from item 1
		$json1['tags'] = array(
			array("tag" => "d"),
			array("tag" => "c")
		);
		
		$response = API::postItem($data1);
		$this->assert200($response);
		
		// Item 1 version should be one greater than last update
		$json1 = API::getItem($data1['key'], $this, 'json');
		$this->assertEquals($version2 + 1, $json1['version']);
		
		// Item 2 version shouldn't have changed
		$json2 = API::getItem($data2['key'], $this, 'json');
		$this->assertEquals($version2, $json2['version']);
	}
	
	
	public function test_should_change_case_of_existing_tag() {
		$data1 = API::createItem("book", [
			"tags" => [
				["tag" => "a"],
			]
		], $this, 'jsonData');
		$data2 = API::createItem("book", [
			"tags" => [
				["tag" => "a"]
			]
		], $this, 'jsonData');
		$version = $data1['version'];
		
		// Change tag case on one item
		$data1['tags'] = [
			["tag" => "A"],
		];
		
		$response = API::postItem($data1);
		$this->assert200($response);
		$this->assert200ForObject($response);
		
		// Item version should be one greater than last update
		$data1 = API::getItem($data1['key'], $this, 'json')['data'];
		$data2 = API::getItem($data2['key'], $this, 'json')['data'];
		$this->assertEquals($version + 1, $data2['version']);
		$this->assertCount(1, $data1['tags']);
		$this->assertContains(["tag" => "A"], $data1['tags']);
		$this->assertContains(["tag" => "a"], $data2['tags']);
	}
	
	
	public function testTagDiacritics() {
		$data = API::createItem("book", [
			"tags" => [
				["tag" => "ëtest"],
			]
		], $this, 'jsonData');
		$version = $data['version'];
		
		// Add 'etest', without accent
		$data['tags'] = [
			["tag" => "ëtest"],
			["tag" => "etest"],
		];
		
		$response = API::postItem($data);
		$this->assert200($response);
		$this->assert200ForObject($response);
		
		// Item version should be one greater than last update
		$data = API::getItem($data['key'], $this, 'json')['data'];
		$this->assertEquals($version + 1, $data['version']);
		$this->assertCount(2, $data['tags']);
		$this->assertContains(["tag" => "ëtest"], $data['tags']);
		$this->assertContains(["tag" => "etest"], $data['tags']);
	}
	
	
	public function test_should_create_a_0_tag() {
		$data = API::createItem("book", [
			"tags" => [
				["tag" => "0"],
			]
		], $this, 'jsonData');
		
		$this->assertCount(1, $data['tags']);
		$this->assertEquals("0", $data['tags'][0]['tag']);
	}
}
