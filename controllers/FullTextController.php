<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2013 Center for History and New Media
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

require('ApiController.php');

class FullTextController extends ApiController {
	public function __construct($controllerName, $action, $params) {
		parent::__construct($controllerName, $action, $params);
	}
	
	
	public function fulltext() {
		$this->allowMethods(['GET', 'POST']);
		
		// Check for general library access
		if (!$this->permissions->canAccess($this->objectLibraryID)) {
			$this->e403();
		}
		
		// Multi-item write
		if ($this->isWriteMethod()) {
			if ($this->apiVersion < 3) {
				$this->e405();
			}
			
			// Check for library write access
			if (!$this->permissions->canWrite($this->objectLibraryID)) {
				$this->e403("Write access denied");
			}
			
			$this->requireContentType("application/json");
			
			// Make sure library hasn't been modified
			$this->checkLibraryIfUnmodifiedSinceVersion(true);
			
			Zotero_Libraries::updateVersionAndTimestamp($this->objectLibraryID);
			$this->libraryVersion = Zotero_Libraries::getUpdatedVersion($this->objectLibraryID);
			
			$this->queryParams['format'] = 'writereport';
			$obj = $this->jsonDecode($this->body);
			
			$results = Zotero_FullText::updateMultipleFromJSON(
				$obj,
				$this->queryParams,
				$this->objectLibraryID,
				$this->userID,
				$this->permissions
			);
			
			Zotero_API::multiResponse([
				'action' => $this->action,
				'uri' => $this->uri,
				'results' => $results,
				'requestParams' => $this->queryParams,
				'permissions' => $this->permissions
			]);
		}
		// Default to ?format=versions for GET
		else {
			$newer = Zotero_FullText::getNewerInLibrary(
				$this->objectLibraryID,
				!empty($this->queryParams['since']) ? $this->queryParams['since'] : 0
			);
			
			$this->libraryVersion = Zotero_Libraries::getVersion($this->objectLibraryID);
			
			echo Zotero_Utilities::formatJSON($newer);
		}
		
		$this->end();
	}
	
	
	public function itemContent() {
		$this->allowMethods(array('GET', 'PUT'));
		
		// Check for general library access
		if (!$this->permissions->canAccess($this->objectLibraryID)) {
			$this->e403();
		}
		
		if (!$this->singleObject) {
			$this->e404();
		}
		
		if ($this->isWriteMethod()) {
			Zotero_DB::beginTransaction();
			
			// Check for library write access
			if (!$this->permissions->canWrite($this->objectLibraryID)) {
				$this->e403("Write access denied");
			}
			
			Zotero_Libraries::updateVersionAndTimestamp($this->objectLibraryID);
		}
		
		$item = Zotero_Items::getByLibraryAndKey($this->objectLibraryID, $this->objectKey);
		if (!$item) {
			$this->e404();
		}
		
		if (!$item->isAttachment() || $item->attachmentLinkMode == 'linked_url') {
			$this->e404();
		}
		
		if ($this->isWriteMethod()) {
			$this->libraryVersion = Zotero_Libraries::getUpdatedVersion($this->objectLibraryID);
			
			if ($this->method == 'PUT') {
				$this->requireContentType("application/json");
				
				Zotero_FullText::indexItem($item, $this->jsonDecode($this->body));
				Zotero_DB::commit();
				$this->e204();
			}
			
			$this->e405();
		}
		
		$data = Zotero_FullText::getItemData($item->libraryID, $item->key);
		if (!$data) {
			$this->e404();
		}
		$this->libraryVersion = $data['version'];
		$json = [
			"content" => $data['content']
		];
		foreach (Zotero_FullText::$metadata as $prop) {
			if (!empty($data[$prop])) {
				$json[$prop] = $data[$prop];
			}
		}
		echo Zotero_Utilities::formatJSON($json);
		
		$this->end();
	}

	public function reindex() {
		$this->allowMethods(['POST']);
		
		$redis = Z_Redis::get('request-limiter');

		// Only allow requests to this endpoint to come in once every $REINDEX_WAIT_MINUTES minutes
		if ($redis->get("reindex_$this->objectLibraryID")) {
			$this->e429("The request to reindex this library has already been submitted.");
		}
		else {
			$redis->setex("reindex_$this->objectLibraryID", Z_CONFIG::$REINDEX_WAIT_MINUTES * 60, 1);
		}

		// Check for general library access
		if (!$this->permissions->canAccess($this->objectLibraryID)) {
			$this->e403();
		}

		// Check how many records we have in Elasticsearch and how many attachments we have.
		$esCount = Zotero_FullText::countInLibrary($this->objectLibraryID);
		$expectedCount = Zotero_Libraries::countAttachments($this->objectLibraryID);
		// If they're equal, everything is indexed.
		if ($esCount == $expectedCount) {
			$this->e400("The library has been indexed.");
		}

		// If there exists _reindex_status file, reindexing is already in progress - do nothing
		$s3Client = Z_Core::$AWS->createS3();
		try {
			$result = $s3Client->headObject([
				'Bucket' => Z_CONFIG::$S3_BUCKET_FULLTEXT,
				'Key' => $this->objectLibraryID . "/" . "_reindex_status"
			]);
			$this->e400("The library is being indexed.");
		}
		catch (\Aws\S3\Exception\S3Exception $e) { }

		// Request reindexing
		$lambdaClient = Z_Core::$AWS->createLambda();
		$result = $lambdaClient->invoke([
			'FunctionName' => Z_CONFIG::$REINDEX_LAMBDA_FUNCTION_NAME, 
			'InvocationType' => 'Event',
			'Payload' => json_encode(['libraryID' => $this->objectLibraryID]),
		]);
		$this->end();
	}

}
