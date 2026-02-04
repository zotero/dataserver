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

class MappingsTests extends APITests {
	public function testNewItem() {
		$response = API::get("items/new?itemType=invalidItemType");
		$this->assert400($response);
		
		$response = API::get("items/new?itemType=book");
		$this->assert200($response);
		$this->assertContentType('application/json', $response);
		$json = json_decode($response->getBody());
		$this->assertEquals('book', $json->itemType);
	}
	
	public function test_should_return_a_note_template() {
		$response = API::get("items/new?itemType=note");
		$this->assert200($response);
		$this->assertContentType('application/json', $response);
		$json = API::getJSONFromResponse($response);
		$this->assertEquals('note', $json['itemType']);
		$this->assertArrayHasKey('note', $json);
	}
	
	public function test_should_return_attachment_fields() {
		$response = API::get("items/new?itemType=attachment&linkMode=linked_url");
		$json = json_decode($response->getBody());
		$this->assertSame('', $json->url);
		$this->assertObjectNotHasAttribute('filename', $json);
		$this->assertObjectNotHasAttribute('path', $json);
		
		$response = API::get("items/new?itemType=attachment&linkMode=linked_file");
		$json = json_decode($response->getBody());
		$this->assertSame('', $json->path);
		$this->assertObjectNotHasAttribute('filename', $json);
		$this->assertObjectNotHasAttribute('url', $json);
		
		$response = API::get("items/new?itemType=attachment&linkMode=imported_url");
		$json = json_decode($response->getBody());
		$this->assertSame('', $json->filename);
		$this->assertSame('', $json->url);
		$this->assertObjectNotHasAttribute('path', $json);
		
		$response = API::get("items/new?itemType=attachment&linkMode=imported_file");
		$json = json_decode($response->getBody());
		$this->assertSame('', $json->filename);
		$this->assertObjectNotHasAttribute('path', $json);
		$this->assertObjectNotHasAttribute('url', $json);
		
		$response = API::get("items/new?itemType=attachment&linkMode=embedded_image");
		$json = json_decode($response->getBody());
		$this->assertObjectNotHasAttribute('title', $json);
		$this->assertObjectNotHasAttribute('url', $json);
		$this->assertObjectNotHasAttribute('accessDate', $json);
		$this->assertObjectNotHasAttribute('tags', $json);
		$this->assertObjectNotHasAttribute('collections', $json);
		$this->assertObjectNotHasAttribute('relations', $json);
		$this->assertObjectNotHasAttribute('note', $json);
		$this->assertObjectNotHasAttribute('charset', $json);
		$this->assertObjectNotHasAttribute('path', $json);
	}
	
	//
	// Annotations
	//
	public function test_should_reject_missing_annotation_type() {
		$response = API::get("items/new?itemType=annotation");
		$this->assert400($response);
	}
	
	public function test_should_reject_unknown_annotation_type() {
		$response = API::get("items/new?itemType=annotation&annotationType=foo");
		$this->assert400($response);
	}
	
	public function test_should_return_fields_for_all_annotation_types() {
		foreach (['highlight', 'note', 'image'] as $type) {
			$response = API::get("items/new?itemType=annotation&annotationType=$type");
			$json = API::getJSONFromResponse($response);
			
			$this->assertArrayHasKey('annotationComment', $json);
			$this->assertEquals('', $json['annotationComment']);
			$this->assertEquals('', $json['annotationColor']);
			$this->assertEquals('', $json['annotationPageLabel']);
			$this->assertEquals('00000|000000|00000', $json['annotationSortIndex']);
			$this->assertArrayHasKey('annotationPosition', $json);
			$this->assertEquals(0, $json['annotationPosition']['pageIndex']);
			$this->assertIsArray($json['annotationPosition']['rects']);
			$this->assertArrayNotHasKey('collections', $json);
			$this->assertArrayNotHasKey('relations', $json);
		}
	}
	
	public function test_should_return_fields_for_highlight_annotations() {
		$response = API::get("items/new?itemType=annotation&annotationType=highlight");
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey('annotationText', $json);
		$this->assertEquals('', $json['annotationText']);
	}
	
	public function test_should_return_fields_for_note_annotations() {
		$response = API::get("items/new?itemType=annotation&annotationType=highlight");
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey('annotationText', $json);
		$this->assertEquals('', $json['annotationText']);
	}
	
	public function test_should_return_fields_for_image_annotations() {
		$response = API::get("items/new?itemType=annotation&annotationType=image");
		$json = API::getJSONFromResponse($response);
		$this->assertEquals(0, $json['annotationPosition']['width']);
		$this->assertEquals(0, $json['annotationPosition']['height']);
	}
	
	public function testComputerProgramVersion() {
		$response = API::get("items/new?itemType=computerProgram");
		$this->assert200($response);
		$json = json_decode($response->getBody());
		$this->assertObjectHasAttribute('versionNumber', $json);
		$this->assertObjectNotHasAttribute('version', $json);
		
		$response = API::get("itemTypeFields?itemType=computerProgram");
		$this->assert200($response);
		$json = json_decode($response->getBody());
		$fields = array_map(function ($val) {
			return $val->field;
		}, $json);
		$this->assertContains('versionNumber', $fields);
		$this->assertNotContains('version', $fields);
	}
	
	public function testLocale() {
		$response = API::get("itemTypes?locale=fr-FR");
		$this->assert200($response);
		$json = json_decode($response->getBody());
		foreach ($json as $o) {
			if ($o->itemType == 'book') {
				break;
			}
		}
		$this->assertEquals('Livre', $o->localized);
	}
}