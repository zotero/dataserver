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

class BibTests extends APITests {
	private static $items;
	private static $multiResponses = [];
	private static $styles = array("default", "apa");
	
	public static function setUpBeforeClass() {
		parent::setUpBeforeClass();
		API::userClear(self::$config['userID']);
		
		// Create test data
		$key = API::createItem("book", array(
			"title" => "Title",
			"date" => "January 1, 2014",
			"creators" => array(
				array(
					"creatorType" => "author",
					"firstName" => "First",
					"lastName" => "Last"
				)
			)
		), null, 'key');
		self::$items[$key] = [
			'json' => [
				"citation" => array(
					"default" => '<span>Last, <i>Title</i>.</span>',
					"apa" => '<span>(Last, 2014)</span>'
				),
				"bib" => array(
					"default" => '<div class="csl-bib-body" style="line-height: 1.35; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, First. <i>Title</i>, 2014.</div></div>',
					"apa" => '<div class="csl-bib-body" style="line-height: 2; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, F. (2014). <i>Title</i>.</div></div>'
				)
			],
			'atom' => [
				"citation" => array(
					"default" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Last, <i>Title</i>.</span></content>',
					"apa" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Last, 2014)</span></content>'
				),
				"bib" => array(
					"default" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, First. <i>Title</i>, 2014.</div></div></content>',
					"apa" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, F. (2014). <i>Title</i>.</div></div></content>'
				)
			]
		];
		
		$key = API::createItem("book", array(
			"title" => "Title 2",
			"date" => "June 24, 2014",
			"creators" => array(
				array(
					"creatorType" => "author",
					"firstName" => "First",
					"lastName" => "Last"
				),
				array(
					"creatorType" => "editor",
					"firstName" => "Ed",
					"lastName" => "McEditor"
				)
			)
		), null, 'key');
		self::$items[$key] = [
			'json' => [
				"citation" => array(
					"default" => '<span>Last, <i>Title 2</i>.</span>',
					"apa" => '<span>(Last, 2014)</span>'
				),
				"bib" => array(
					"default" => '<div class="csl-bib-body" style="line-height: 1.35; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, First. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div>',
					"apa" => '<div class="csl-bib-body" style="line-height: 2; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, F. (2014). <i>Title 2</i>. (E. McEditor, Ed.).</div></div>'
				)
			],
			'atom' => [
				"citation" => array(
					"default" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Last, <i>Title 2</i>.</span></content>',
					"apa" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Last, 2014)</span></content>'
				),
				"bib" => array(
					"default" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, First. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div></content>',
					"apa" => '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, F. (2014). <i>Title 2</i>. (E. McEditor, Ed.).</div></div></content>'
				)
			]
		];
		
		self::$multiResponses = [
			"default" => '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, First. <i>Title</i>, 2014.</div><div class="csl-entry">&#x2014;&#x2014;&#x2014;. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div>',
			"apa" => '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 2; padding-left: 2em; text-indent:-2em;"><div class="csl-entry">Last, F. (2014a). <i>Title</i>.</div><div class="csl-entry">Last, F. (2014b). <i>Title 2</i>. (E. McEditor, Ed.).</div></div>'
		];
	}
	
	public static function tearDownAfterClass() {
		parent::tearDownAfterClass();
		API::userClear(self::$config['userID']);
	}
	
	
	// JSON
	public function testIncludeCitationSingle() {
		foreach (self::$styles as $style) {
			foreach (self::$items as $key => $expected) {
				$response = API::userGet(
					self::$config['userID'],
					"items/$key?include=citation" . ($style == "default" ? "" : "&style=$style")
				);
				$this->assert200($response);
				$json = API::getJSONFromResponse($response);
				$this->assertEquals($expected['json']['citation'][$style], $json['citation']);
			}
		}
	}
	
	
	// Atom
	public function testContentCitationSingle() {
		foreach (self::$styles as $style) {
			foreach (self::$items as $key => $expected) {
				$response = API::userGet(
					self::$config['userID'],
					"items/$key?content=citation" . ($style == "default" ? "" : "&style=$style")
				);
				$this->assert200($response);
				$content = API::getContentFromResponse($response);
				// Add zapi namespace
				$content = str_replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ', $content);
				$this->assertXmlStringEqualsXmlString($expected['atom']['citation'][$style], $content);
			}
		}
	}
	
	
	// JSON
	public function testIncludeCitationMulti() {
		$keys = array_keys(self::$items);
		$keyStr = implode(',', $keys);
		
		foreach (self::$styles as $style) {
			$response = API::userGet(
				self::$config['userID'],
				"items?itemKey=$keyStr&include=citation"
					. ($style == "default" ? "" : "&style=$style")
			);
			$this->assert200($response);
			$this->assertTotalResults(sizeOf($keys), $response);
			$json = API::getJSONFromResponse($response);
			
			foreach ($json as $item) {
				$key = $item['key'];
				$content = $item['citation'];
				
				$this->assertEquals(self::$items[$key]['json']['citation'][$style], $content);
			}
		}
	}
	
	
	// Atom
	public function testContentCitationMulti() {
		$keys = array_keys(self::$items);
		$keyStr = implode(',', $keys);
		
		foreach (self::$styles as $style) {
			$response = API::userGet(
				self::$config['userID'],
				"items?itemKey=$keyStr&content=citation"
					. ($style == "default" ? "" : "&style=$style")
			);
			$this->assert200($response);
			$this->assertTotalResults(sizeOf($keys), $response);
			$xml = API::getXMLFromResponse($response);
			
			$entries = $xml->xpath('//atom:entry');
			foreach ($entries as $entry) {
				$key = (string) $entry->children("http://zotero.org/ns/api")->key;
				$content = $entry->content->asXML();
				
				// Add zapi namespace
				$content = str_replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ', $content);
				$this->assertXmlStringEqualsXmlString(self::$items[$key]['atom']['citation'][$style], $content);
			}
		}
	}
	
	
	// JSON
	public function testIncludeBibSingle() {
		foreach (self::$styles as $style) {
			foreach (self::$items as $key => $expected) {
				$response = API::userGet(
					self::$config['userID'],
					"items/$key?include=bib" . ($style == "default" ? "" : "&style=$style")
				);
				$this->assert200($response);
				$json = API::getJSONFromResponse($response);
				$this->assertXmlStringEqualsXmlString($expected['json']['bib'][$style], $json['bib']);
			}
		}
	}
	
	
	// Atom
	public function testContentBibSingle() {
		foreach (self::$styles as $style) {
			foreach (self::$items as $key => $expected) {
				$response = API::userGet(
					self::$config['userID'],
					"items/$key?content=bib" . ($style == "default" ? "" : "&style=$style")
				);
				$this->assert200($response);
				$content = API::getContentFromResponse($response);
				// Add zapi namespace
				$content = str_replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ', $content);
				$this->assertXmlStringEqualsXmlString($expected['atom']['bib'][$style], $content);
			}
		}
	}
	
	
	// JSON
	public function testIncludeBibMulti() {
		$keys = array_keys(self::$items);
		$keyStr = implode(',', $keys);
		
		foreach (self::$styles as $style) {
			$response = API::userGet(
				self::$config['userID'],
				"items?itemKey=$keyStr&include=bib" . ($style == "default" ? "" : "&style=$style")
			);
			$this->assert200($response);
			$this->assertTotalResults(sizeOf($keys), $response);
			$json = API::getJSONFromResponse($response);
			
			foreach ($json as $item) {
				$key = $item['key'];
				$this->assertXmlStringEqualsXmlString(self::$items[$key]['json']['bib'][$style], $item['bib']);
			}
		}
	}
	
	
	// Atom
	public function testContentBibMulti() {
		$keys = array_keys(self::$items);
		$keyStr = implode(',', $keys);
		
		foreach (self::$styles as $style) {
			$response = API::userGet(
				self::$config['userID'],
				"items?itemKey=$keyStr&content=bib" . ($style == "default" ? "" : "&style=$style")
			);
			$this->assert200($response);
			$xml = API::getXMLFromResponse($response);
			$this->assertTotalResults(sizeOf($keys), $response);
			
			$entries = $xml->xpath('//atom:entry');
			foreach ($entries as $entry) {
				$key = (string) $entry->children("http://zotero.org/ns/api")->key;
				$content = $entry->content->asXML();
				
				// Add zapi namespace
				$content = str_replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ', $content);
				$this->assertXmlStringEqualsXmlString(self::$items[$key]['atom']['bib'][$style], $content);
			}
		}
	}
	
	
	public function testFormatBibMultiple() {
		foreach (self::$styles as $style) {
			$response = API::userGet(
				self::$config['userID'],
				"items?format=bib" . ($style == "default" ? "" : "&style=$style")
			);
			$this->assert200($response);
			$this->assertXmlStringEqualsXmlString(self::$multiResponses[$style], $response->getBody());
		}
	}
}
