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

class SnsController extends Controller
{

	public function init()
	{

	}

	public function register($hash, $size)
	{
		$results = Zotero_Storage::getUploadQueueItemsAndInfo($hash);

		print_r($results);

		foreach ($results as $result) {

			$info = $result['info'];
			$item = $result['item'];

			if ($info->size != $size) {
				error_log("Uploaded file size does not match "
					. "({$info->size} != {$size}) "
					. "for file {$info->hash}/{$info->filename}");
				continue;
			}

			Zotero_DB::profileStart();
			Zotero_DB::readOnly(false);

			Zotero_DB::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
			Zotero_DB::beginTransaction();

			$fileInfo = Zotero_Storage::getLocalFileInfo($info);
			if ($fileInfo) {
				$storageFileID = $fileInfo['storageFileID'];
			} else {
				$storageFileID = Zotero_Storage::addFile($info);
			}

			Zotero_Storage::updateFileItemInfo($item, $storageFileID, $info, true);

			Zotero_Storage::logUpload($info->userID, $item, $info->uploadKey, IPAddress::getIP());

			Zotero_DB::commit();
		}
	}

	public function sns()
	{
		$username = $_SERVER['PHP_AUTH_USER'];
		$password = $_SERVER['PHP_AUTH_PW'];

		if ($username != 'user' || $password != 'password') return;

		$json = json_decode(file_get_contents("php://input"));

		// This should happen only the first time when SNS is configured
		if ($json->Type == "SubscriptionConfirmation") {

			Z_Core::logError("Possible repeated SNS subscription");

			$curl_handle = curl_init();
			curl_setopt($curl_handle, CURLOPT_URL, $json->SubscribeURL);
			curl_setopt($curl_handle, CURLOPT_CONNECTTIMEOUT, 2);
			curl_exec($curl_handle);
			curl_close($curl_handle);
		}

		if ($json->Type == "Notification") {

			Z_Core::debug("SNS notification" . $json->Message);

			$parts = explode(':', $json->TopicArn);
			$topic = $parts[5];

			if ($topic == 's3-object-created-zoterotest1') {

				$json2 = json_decode($json->Message);

				$hash = $json2->Records[0]->s3->object->key;
				$size = $json2->Records[0]->s3->object->size;

				$this->register($hash, $size);
			}
		}

	}
}
