<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2017 Center for History and New Media
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

class Zotero_GlobalItems {
	const endpointTimeout = 3;
	
	public static function getGlobalItems($params) {
		
		$requestURL = Z_CONFIG::$GLOBAL_ITEMS_ENDPOINT;
		if ($requestURL[strlen($requestURL) - 1] != "/") {
			$requestURL .= "/";
		}
		$requestURL .= 'global/items';
		
		if (!empty($params['q'])) {
			$q = $params['q'];
			$requestURL .= '?q=' . rawurlencode($q);
		}
		else if (!empty($params['doi'])) {
			$doi = $params['doi'];
			$requestURL .= '?doi=' . rawurlencode($doi);
		}
		else if (!empty($params['isbn'])) {
			$isbn = $params['isbn'];
			$requestURL .= '?isbn=' . rawurlencode($isbn);
		}
		else if (!empty($params['url'])) {
			$url = $params['url'];
			$requestURL .= '?url=' . rawurlencode($url);
		}
		else {
			return false;
		}
		
		if (!empty($params['start'])) {
			$requestURL .= '&start=' . $params['start'];
		}
		
		if (!empty($params['limit'])) {
			$requestURL .= '&limit=' . $params['limit'];
		}
		
		$start = microtime(true);
		
		$ch = curl_init($requestURL);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::endpointTimeout);
		curl_setopt($ch, CURLOPT_HEADER, 0); // do not return HTTP headers
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		// Allow an invalid ssl certificate (Todo: remove)
		curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
		$response = curl_exec($ch);
		
		$time = microtime(true) - $start;
		StatsD::timing("api.globalitems", $time * 1000);
		
		$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		
		if ($code != 200) {
			$response = null;
			Z_Core::logError("HTTP $code from Global Items API $requestURL");
			Z_Core::logError($response);
			return false;
		}
		
		return $response;
	}
	
	public static function getGlobalItemLibraryItems($id) {
		$params = [];
		
		if (strpos($id, 'doi') === 0) {
			$params['doi'] = $id;
		}
		else if (strpos($id, 'isbn') === 0) {
			$params['isbn'] = $id;
		}
		else {
			return [];
		}
		
		$json = self::getGlobalItems($params);
		$json = json_decode($json);
		$libraryItems = $json[0]->libraryItems;
		$groupedLibraryItems = [];
		for ($i = 0, $len = sizeOf($libraryItems); $i < $len; $i++) {
			$url = $libraryItems[$i];
			$parts = explode('/', $url);
			
			$libraryID = null;
			if ($parts[3] == 'users') {
				$libraryID = Zotero_Users::getLibraryIDFromUserID($parts[4]);
			}
			else if ($parts[3] == 'groups') {
				$libraryID = Zotero_Groups::getLibraryIDFromGroupID($parts[4]);
			}
			
			$groupedLibraryItems[$libraryID][] = $parts[6];
		}
		return $groupedLibraryItems;
	}
}
