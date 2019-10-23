<?php
require_once 'include/bootstrap.inc.php';

class SchemaTests extends \PHPUnit\Framework\TestCase {
	public function testResolveLocale() {
		$locale = \Zotero\Schema::resolveLocale("en-US");
		$this->assertEquals("en-US", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("en");
		$this->assertEquals("en-US", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("fr-FR");
		$this->assertEquals("fr-FR", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("fr");
		$this->assertEquals("fr-FR", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("ar");
		$this->assertEquals("ar", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("pt");
		$this->assertEquals("pt-PT", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("zh-CN");
		$this->assertEquals("zh-CN", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("zh-TW");
		$this->assertEquals("zh-TW", $locale);
		
		$locale = \Zotero\Schema::resolveLocale("zh");
		$this->assertEquals("zh-CN", $locale);
	}
}
