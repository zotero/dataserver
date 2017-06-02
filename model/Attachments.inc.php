<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2011 Center for History and New Media
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

class Zotero_Attachments {
	private static $urlTTL = 60; // seconds how long the URL is alive
	
	private static $linkModes = array(
		0 => "imported_file",
		1 => "imported_url",
		2 => "linked_file",
		3 => "linked_url"
	);
	
	public static function linkModeNumberToName($number) {
		if (!isset(self::$linkModes[$number])) {
			throw new Exception("Invalid link mode '" . $number . "'");
		}
		return self::$linkModes[$number];
	}
	
	public static function linkModeNameToNumber($name, $caseInsensitive=false) {
		if ($caseInsensitive) {
			$name = strtolower($name);
		}
		$number = array_search($name, self::$linkModes);
		if ($number === false) {
			throw new Exception("Invalid link mode name '" . $name . "'");
		}
		return $number;
	}
	
	public static function getTemporaryURL(Zotero_Item $item) {
		$info = Zotero_Storage::getLocalFileItemInfo($item);
		$storageFileID = $info['storageFileID'];
		$mtime = $info['mtime'];
		
		$cacheKey = "attachmentProxyURL_" . $storageFileID . "_" . $mtime;
		if ($url = Z_Core::$MC->get($cacheKey)) {
			Z_Core::debug("Got attachment {$storageFileID} proxy URL {$url} from memcached");
			return $url;
		}
		
		$hash = $info['hash'];
		$zip = $info['zip'];
		
		if (strlen($item->attachmentPath) < 9 ||
			substr($item->attachmentPath, 0, 8) != 'storage:') {
			throw new Exception("Invalid attachment path '{$item->attachmentPath}'");
		}
		$filename = substr($item->attachmentPath, 8);
		$filename = self::decodeRelativeDescriptorString($filename);
		
		$payload = [
			'expires' => time() + self::$urlTTL,
			'hash' => $hash,
			'contentType' => $item->attachmentContentType,
			'charset' => $item->attachmentCharset
		];
		
		if ($zip) {
			$payload['zip'] = 1;
		}
		else {
			$payload['filename'] = $filename;
		}
		
		$url = self::generateSignedURL($payload, $filename);
		Z_Core::$MC->set($cacheKey, $url, self::$urlTTL);
		return $url;
	}
	
	public static function generateSignedURL($payload, $filename) {
		$extURLPrefix = Z_CONFIG::$ATTACHMENT_PROXY_URL;
		if ($extURLPrefix[strlen($extURLPrefix) - 1] != "/") {
			$extURLPrefix .= "/";
		}
		
		$payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
		$payload = base64_encode($payload);
		$signature = hash_hmac('sha256', $payload, Z_CONFIG::$ATTACHMENT_PROXY_SECRET);
		return $extURLPrefix . rawurlencode($payload) . '/' . $signature . '/' . rawurlencode($filename);
	}
	
	// Filenames are in Mozilla's getRelativeDescriptor() format
	public static function decodeRelativeDescriptorString($str) {
		try {
			$converted = Z_Unicode::convertCharStr2CP($str, false, true, 'hex');
			$converted = Z_Unicode::convertUTF82Char($converted);
		}
		catch (Exception $e) {
			Z_Core::logError("Warning: " . $e->getMessage());
			return $str;
		}
		return $converted;
	}
	
	public static function encodeRelativeDescriptorString($str) {
		$str = Z_Unicode::convertCharStr2UTF8($str);
		// convertNumbers2Char($str, 'hex')
		$str = preg_replace_callback(
			"/([A-Fa-f0-9]{2})/",
			function($matches) {
				return Z_Unicode::hex2char($matches[0]);
			},
			str_replace(" ", "", $str)
		);
		
		return $str;
	}
}
