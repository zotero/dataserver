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

class SnsController extends Controller {
	// index.php is calling this function. Maybe we should add this to Controller class.
	public function init() {
		
	}
	
	public function sns() {
		if (!Z_CONFIG::$SNS_USERNAME || !Z_CONFIG::$SNS_PASSWORD) {
			Z_Core::logError("SNS_USERNAME or SNS_PASSWORD not set in Z_CONFIG");
			// We don't use $this->e500() because we don't extend ApiController
			http_response_code(500);
			exit;
		}
		
		if (!isset($_SERVER['PHP_AUTH_USER'], $_SERVER['PHP_AUTH_PW'])) {
			header('WWW-Authenticate: Basic');
			http_response_code(401);
			exit;
		}
		
		if ($_SERVER['PHP_AUTH_USER'] != Z_CONFIG::$SNS_USERNAME ||
			$_SERVER['PHP_AUTH_PW'] != Z_CONFIG::$SNS_PASSWORD
		) {
			Z_Core::logError("Wrong username or password in SNS request");
			http_response_code(403);
			exit;
		}
		
		$json = json_decode(file_get_contents("php://input"));
		if (!$json) {
			Z_Core::logError("SNS sent invalid JSON: " . $json);
			http_response_code(400);
			exit;
		}
		
		// TODO: add JSON schema validation
		if ($json->Type == "Notification") {
			Z_Core::debug("SNS notification: " . $json->Message);
			$parts = explode(':', $json->TopicArn);
			$topic = $parts[5];
			
			if ($topic == 's3-object-created-' . Z_CONFIG::$S3_BUCKET) {
				$json2 = json_decode($json->Message);
				$ip = $json2->Records[0]->requestParameters->sourceIPAddress;
				$hash = $json2->Records[0]->s3->object->key;
				$this->register($hash);
			}
		}
		// This should happen only the first time when SNS is configured
		else if ($json->Type == "SubscriptionConfirmation") {
			Z_Core::logError("Possible repeated SNS subscription");
			$curl_handle = curl_init();
			curl_setopt($curl_handle, CURLOPT_URL, $json->SubscribeURL);
			curl_setopt($curl_handle, CURLOPT_CONNECTTIMEOUT, 2);
			curl_exec($curl_handle);
			curl_close($curl_handle);
		}
		else {
			Z_Core::logError("Unknown SNS type: " . $json->Type);
		}
	}
	
	protected function register($hash) {
		// We don't need to check the file size, because it's
		// included in the file upload signature. We get the file we expected,
		// or we don't get it at all.
		// Everything is in one transaction to prevent racing conditions with queueUpload
		Zotero_DB::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
		Zotero_DB::beginTransaction();
		$uploads = Zotero_Storage::getRecentUploads($hash);
		
		foreach ($uploads as $info) {
			$item = Zotero_Items::getByLibraryAndKey($info->libraryID, $info->itemKey);
			$fileInfo = Zotero_Storage::getLocalFileInfo($info);
			
			if ($fileInfo) {
				$storageFileID = $fileInfo['storageFileID'];
			}
			else {
				$storageFileID = Zotero_Storage::addFile($info);
			}
			
			Zotero_Storage::updateFileItemInfo($item, $storageFileID, $info, true);
			StatsD::increment("storage.upload.registrator.s3", 1);
		}
		
		Zotero_Storage::removeUploadsByHash($hash);
		Zotero_DB::commit();
	}
}
