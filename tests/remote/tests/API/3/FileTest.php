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
use API3 as API, HTTP, SimpleXMLElement, Z_Tests;
require_once 'APITests.inc.php';
require_once 'include/bootstrap.inc.php';

/**
 * @group s3
 */
class FileTests extends APITests {
	private static $toDelete = array();
	
	public static function setUpBeforeClass(): void {
		parent::setUpBeforeClass();
		API::userClear(self::$config['userID']);
	}
	
	public function setUp(): void {
		parent::setUp();
		
		// Delete work files
		$delete = array("file", "old", "new", "patch");
		foreach ($delete as $file) {
			if (file_exists("work/$file")) {
				unlink("work/$file");
			}
		}
		clearstatcache();
	}
	
	public static function tearDownAfterClass(): void {
		parent::tearDownAfterClass();
		
		$s3Client = Z_Tests::$AWS->createS3();
		
		foreach (self::$toDelete as $file) {
			try {
				$s3Client->deleteObject([
					'Bucket' => self::$config['s3Bucket'],
					'Key' => $file
				]);
			}
			catch (\Aws\S3\Exception\S3Exception $e) {
				if ($e->getAwsErrorCode() == 'NoSuchKey') {
					echo "\n$file not found on S3 to delete\n";
				}
				else {
					throw $e;
				}
			}
		}
	}
	
	
	public function testNewEmptyImportedFileAttachmentItem() {
		return API::createAttachmentItem("imported_file", [], false, $this, 'key');
	}
	
	
	/**
	 * Test errors getting file upload authorization via form data
	 *
	 * @depends testNewEmptyImportedFileAttachmentItem
	 */
	public function testAddFileFormDataAuthorizationErrors($parentKey) {
		$fileContents = self::getRandomUnicodeString();
		$hash = md5($fileContents);
		$mtime = time() * 1000;
		$size = strlen($fileContents);
		$filename = "test_" . $fileContents;
		
		$fileParams = array(
			"md5" => $hash,
			"filename" => $filename,
			"filesize" => $size,
			"mtime" => $mtime,
			"contentType" => "text/plain",
			"charset" => "utf-8"
		);
		
		// Check required params
		foreach (array("md5", "filename", "filesize", "mtime") as $exclude) {
			$response = API::userPost(
				self::$config['userID'],
				"items/$parentKey/file",
				$this->implodeParams($fileParams, array($exclude)),
				array(
					"Content-Type: application/x-www-form-urlencoded",
					"If-None-Match: *"
				)
			);
			$this->assert400($response);
		}
		
		// Seconds-based mtime
		$fileParams2 = $fileParams;
		$fileParams2['mtime'] = round($mtime / 1000);
		$response = API::userPost(
			self::$config['userID'],
			"items/$parentKey/file",
			$this->implodeParams($fileParams2),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		// TODO: Enable this test when the dataserver enforces it
		//$this->assert400($response);
		//$this->assertEquals('mtime must be specified in milliseconds', $response->getBody());
		
		$fileParams = $this->implodeParams($fileParams);
		
		// Invalid If-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/$parentKey/file",
			$fileParams,
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: " . md5("invalidETag")
			)
		);
		$this->assert412($response);
		
		// Missing If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/$parentKey/file",
			$fileParams,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			)
		);
		$this->assert428($response);
		
		// Invalid If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/$parentKey/file",
			$fileParams,
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: invalidETag"
			)
		);
		$this->assert400($response);
	}
	
	
	public function testAddFileFormDataFull() {
		$parentKey = API::createItem("book", false, $this, 'key');
		
		$json = API::createAttachmentItem("imported_file", [], $parentKey, $this, 'json');
		$attachmentKey = $json['key'];
		$originalVersion = $json['version'];
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		$contentType = "text/plain";
		$charset = "utf-8";
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime,
				"contentType" => $contentType,
				"charset" => $charset
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert200($response);
		$this->assertContentType("application/json", $response);
		$json = json_decode($response->getBody());
		$this->assertNotNull($json);
		
		self::$toDelete[] = "$hash";
		
		// Upload wrong contents to S3
		$response = HTTP::post(
			$json->url,
			$json->prefix . strrev($fileContents) . $json->suffix,
			[
				"Content-Type: " . $json->contentType
			]
		);
		$this->assert400($response);
		$this->assertStringContainsString(
			"The Content-MD5 you specified did not match what we received.", $response->getBody()
		);
		
		// Upload to S3
		$response = HTTP::post(
			$json->url,
			$json->prefix . $fileContents . $json->suffix,
			[
				"Content-Type: " . $json->contentType
			]
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		
		// No If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			"upload=" . $json->uploadKey,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			)
		);
		$this->assert428($response);
		
		// Invalid upload key
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			"upload=invalidUploadKey",
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert400($response);
		
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			"upload=" . $json->uploadKey,
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert204($response);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$attachmentKey"
		);
		$json = API::getJSONFromResponse($response)['data'];
		
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertEquals($charset, $json['charset']);
		
		return array(
			"key" => $attachmentKey,
			"json" => $json,
			"size" => $size
		);
	}
	
	public function testAddFileFormDataFullParams() {
		$json = API::createAttachmentItem("imported_file", [], false, $this, 'jsonData');
		$attachmentKey = $json['key'];
		
		// Get serverDateModified
		$serverDateModified = $json['dateAdded'];
		sleep(1);
		
		$originalVersion = $json['version'];
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		$contentType = "text/plain";
		$charset = "utf-8";
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime,
				"contentType" => $contentType,
				"charset" => $charset,
				"params" => 1
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert200($response);
		$this->assertContentType("application/json", $response);
		$json = json_decode($response->getBody());
		$this->assertNotNull($json);
		
		self::$toDelete[] = "$hash";
		
		// Generate form-data -- taken from S3::getUploadPostData()
		$boundary = "---------------------------" . md5(uniqid());
		$prefix = "";
		foreach ($json->params as $key => $val) {
			$prefix .= "--$boundary\r\n"
				. "Content-Disposition: form-data; name=\"$key\"\r\n\r\n"
				. $val . "\r\n";
		}
		$prefix .= "--$boundary\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\n";
		$suffix = "\r\n--$boundary--";
		
		// Upload to S3
		$response = HTTP::post(
			$json->url,
			$prefix . $fileContents . $suffix,
			array(
				"Content-Type: multipart/form-data; boundary=$boundary"
			)
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			"upload=" . $json->uploadKey,
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert204($response);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$attachmentKey"
		);
		$json = API::getJSONFromResponse($response)['data'];
		
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertEquals($charset, $json['charset']);
		
		// Make sure version has changed
		$this->assertNotEquals($originalVersion, $json['version']);
	}
	
	
	/**
	 * @depends testAddFileFormDataFull
	 */
	public function testAddFileExisting($addFileData) {
		$key = $addFileData['key'];
		$json = $addFileData['json'];
		$md5 = $json['md5'];
		$size = $addFileData['size'];
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams(array(
				"md5" => $json['md5'],
				"filename" => $json['filename'],
				"filesize" => $size,
				"mtime" => $json['mtime'],
				"contentType" => $json['contentType'],
				"charset" => $json['charset']
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: " . $json['md5']
			)
		);
		$this->assert200($response);
		$postJSON = json_decode($response->getBody());
		$this->assertNotNull($postJSON);
		$this->assertEquals(1, $postJSON->exists);
		
		// Get upload authorization for existing file with different filename
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams(array(
				"md5" => $json['md5'],
				"filename" => $json['filename'] . '等', // Unicode 1.1 character, to test signature generation
				"filesize" => $size,
				"mtime" => $json['mtime'],
				"contentType" => $json['contentType'],
				"charset" => $json['charset']
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: " . $json['md5']
			)
		);
		$this->assert200($response);
		$postJSON = json_decode($response->getBody());
		$this->assertNotNull($postJSON);
		$this->assertEquals(1, $postJSON->exists);
		
		return array(
			"key" => $key,
			"md5" => $md5,
			"filename" => $json['filename'] . '等'
		);
	}
	
	
	/**
	 * @depends testAddFileExisting
	 * @group attachments
	 */
	public function testGetFile($addFileData) {
		$key = $addFileData['key'];
		$md5 = $addFileData['md5'];
		$filename = $addFileData['filename'];
		
		// Get in view mode
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file/view"
		);
		$this->assert302($response);
		$location = $response->getHeader("Location");
		$this->assertRegExp('#^https://[^/]+/[a-zA-Z0-9%]+/[a-f0-9]{64}/test_#', $location);
		$filenameEncoded = rawurlencode($filename);
		$this->assertEquals($filenameEncoded, substr($location, -1 * strlen($filenameEncoded)));
		
		// Get from view mode
		$response = HTTP::get($location);
		$this->assert200($response);
		$this->assertEquals($md5, md5($response->getBody()));
		
		// Get in download mode
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file"
		);
		$this->assert302($response);
		$location = $response->getHeader("Location");
		
		// Get from S3
		$response = HTTP::get($location);
		$this->assert200($response);
		$this->assertEquals($md5, md5($response->getBody()));
		
		return array(
			"key" => $key, 
			"response" => $response
		);
	}
	
	
	/**
	 * @depends testGetFile
	 */
	public function testAddFilePartial($getFileData) {
		// Get serverDateModified
		$response = API::userGet(
			self::$config['userID'],
			"items/{$getFileData['key']}"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$serverDateModified = $json['dateModified'];
		sleep(1);
		
		$originalVersion = $json['version'];
		
		$oldFilename = "work/old";
		$fileContents = $getFileData['response']->getBody();
		file_put_contents($oldFilename, $fileContents);
		
		$newFilename = "work/new";
		$patchFilename = "work/patch";
		
		$algorithms = array(
			"bsdiff" => "bsdiff "
				. escapeshellarg($oldFilename) . " "
				. escapeshellarg($newFilename) . " "
				. escapeshellarg($patchFilename),
			"xdelta" => "xdelta3 -f -e -9 -S djw -s "
				. escapeshellarg($oldFilename) . " "
				. escapeshellarg($newFilename) . " "
				. escapeshellarg($patchFilename),
			"vcdiff" => "vcdiff encode "
				. "-dictionary " . escapeshellarg($oldFilename) . " "
				. " -target " . escapeshellarg($newFilename) . " "
				. " -delta " . escapeshellarg($patchFilename)
		);
		
		foreach ($algorithms as $algo => $cmd) {
			clearstatcache();
			
			// Create random contents
			file_put_contents($newFilename, uniqid(self::getRandomUnicodeString(), true));
			$newHash = md5_file($newFilename);
			
			// Get upload authorization
			$fileParams = array(
				"md5" => $newHash,
				"filename" => "test_" . $fileContents,
				"filesize" => filesize($newFilename),
				"mtime" => filemtime($newFilename) * 1000,
				"contentType" => "text/plain",
				"charset" => "utf-8"
			);
			$response = API::userPost(
				self::$config['userID'],
				"items/{$getFileData['key']}/file",
				$this->implodeParams($fileParams),
				array(
					"Content-Type: application/x-www-form-urlencoded",
					"If-Match: " . md5_file($oldFilename)
				)
			);
			$this->assert200($response);
			$json = json_decode($response->getBody());
			$this->assertNotNull($json);
			
			exec($cmd, $output, $ret);
			if ($ret != 0) {
				echo "Warning: Error running $algo -- skipping file upload test\n";
				continue;
			}
			
			$patch = file_get_contents($patchFilename);
			$this->assertNotEquals("", $patch);
			
			self::$toDelete[] = "$newHash";
			
			// Upload patch file
			$response = API::userPatch(
				self::$config['userID'],
				"items/{$getFileData['key']}/file?algorithm=$algo&upload=" . $json->uploadKey,
				$patch,
				array(
					"If-Match: " . md5_file($oldFilename)
				)
			);
			$this->assert204($response);
			
			unlink($patchFilename);
			rename($newFilename, $oldFilename);
			
			// Verify attachment item metadata
			$response = API::userGet(
				self::$config['userID'],
				"items/{$getFileData['key']}"
			);
			$json = API::getJSONFromResponse($response)['data'];
			$this->assertEquals($fileParams['md5'], $json['md5']);
			$this->assertEquals($fileParams['mtime'], $json['mtime']);
			$this->assertEquals($fileParams['contentType'], $json['contentType']);
			$this->assertEquals($fileParams['charset'], $json['charset']);
			
			// Make sure version has changed
			$this->assertNotEquals($originalVersion, $json['version']);
			
			// Verify file on S3
			$response = API::userGet(
				self::$config['userID'],
				"items/{$getFileData['key']}/file"
			);
			$this->assert302($response);
			$location = $response->getHeader("Location");
			
			$response = HTTP::get($location);
			$this->assert200($response);
			$this->assertEquals($fileParams['md5'], md5($response->getBody()));
			$t = $fileParams['contentType'];
			$this->assertEquals(
				$t . (($t && $fileParams['charset']) ? "; charset={$fileParams['charset']}" : ""),
				$response->getHeader("Content-Type")
			);
		}
	}
	
	
	public function testExistingFileWithOldStyleFilename() {
		$fileContents = self::getRandomUnicodeString();
		$hash = md5($fileContents);
		$filename = 'test.txt';
		$size = strlen($fileContents);
		
		$parentKey = API::createItem("book", false, $this, 'key');
		$json = API::createAttachmentItem("imported_file", [], $parentKey, $this, 'jsonData');
		$key = $json['key'];
		$originalVersion = $json['version'];
		$mtime = time() * 1000;
		$contentType = 'text/plain';
		$charset = 'utf-8';
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime,
				"contentType" => $contentType,
				"charset" => $charset
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert200($response);
		$this->assertContentType("application/json", $response);
		$json = json_decode($response->getBody());
		$this->assertNotNull($json);
		
		// Upload to old-style location
		self::$toDelete[] = "$hash/$filename";
		self::$toDelete[] = "$hash";
		$s3Client = Z_Tests::$AWS->createS3();
		$s3Client->putObject([
			'Bucket' => self::$config['s3Bucket'],
			'Key' => $hash . '/' . $filename,
			'Body' => $fileContents
		]);
		
		// Register upload
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json->uploadKey,
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert204($response);
		
		// The file should be accessible on the item at the old-style location
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file"
		);
		$this->assert302($response);
		$location = $response->getHeader("Location");
		
		$this->assertEquals(1, preg_match('"^https://'
			// bucket.s3.amazonaws.com or s3.amazonaws.com/bucket
			. '(?:[^/]+|.+' . self::$config['s3Bucket'] . ')'
			. '/([a-f0-9]{32})/' . $filename . '\?"', $location, $matches));
		$this->assertEquals($hash, $matches[1]);
		
		// Get upload authorization for the same file and filename on another item, which should
		// result in 'exists', even though we uploaded to the old-style location
		$parentKey = API::createItem("book", false, $this, 'key');
		$json = API::createAttachmentItem("imported_file", [], $parentKey, $this, 'jsonData');
		$key = $json['key'];
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime,
				"contentType" => $contentType,
				"charset" => $charset
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert200($response);
		$postJSON = json_decode($response->getBody());
		$this->assertNotNull($postJSON);
		$this->assertEquals(1, $postJSON->exists);
		
		// Get in download mode
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file"
		);
		$this->assert302($response);
		$location = $response->getHeader("Location");
		$this->assertEquals(1, preg_match('"^https://'
			// bucket.s3.amazonaws.com or s3.amazonaws.com/bucket
			. '(?:[^/]+|.+' . self::$config['s3Bucket'] . ')'
			. '/([a-f0-9]{32})/' . $filename . '\?"', $location, $matches));
		$this->assertEquals($hash, $matches[1]);
		
		// Get from S3
		$response = HTTP::get($location);
		$this->assert200($response);
		$this->assertEquals($fileContents, $response->getBody());
		$this->assertEquals($contentType . '; charset=' . $charset, $response->getHeader('Content-Type'));
		
		// Get upload authorization for the same file and different filename on another item,
		// which should result in 'exists' and a copy of the file to the hash-only location
		$parentKey = API::createItem("book", false, $this, 'key');
		$json = API::createAttachmentItem("imported_file", [], $parentKey, $this, 'jsonData');
		$key = $json['key'];
		// Also use a different content type
		$contentType = 'application/x-custom';
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => "test2.txt",
				"filesize" => $size,
				"mtime" => $mtime,
				"contentType" => $contentType
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert200($response);
		$postJSON = json_decode($response->getBody());
		$this->assertNotNull($postJSON);
		$this->assertEquals(1, $postJSON->exists);
		
		// Get in download mode
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file"
		);
		$this->assert302($response);
		$location = $response->getHeader("Location");
		$this->assertEquals(1, preg_match('"^https://'
			// bucket.s3.amazonaws.com or s3.amazonaws.com/bucket
			. '(?:[^/]+|.+' . self::$config['s3Bucket'] . ')'
			. '/([a-f0-9]{32})\?"', $location, $matches));
		$this->assertEquals($hash, $matches[1]);
		
		// Get from S3
		$response = HTTP::get($location);
		$this->assert200($response);
		$this->assertEquals($fileContents, $response->getBody());
		$this->assertEquals($contentType, $response->getHeader('Content-Type'));
	}
	
	public function testAddFileClientV4() {
		API::userClear(self::$config['userID']);
		
		$fileContentType = "text/html";
		$fileCharset = "utf-8";
		
		$auth = array(
			'username' => self::$config['username'],
			'password' => self::$config['password']
		);
		
		// Get last storage sync
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync?auth=1",
			array(),
			$auth
		);
		$this->assert404($response);
		
		$json = API::createAttachmentItem("imported_file", [], false, $this, 'jsonData');
		$originalVersion = $json['version'];
		$json['contentType'] = $fileContentType;
		$json['charset'] = $fileCharset;
		
		$response = API::userPut(
			self::$config['userID'],
			"items/{$json['key']}",
			json_encode($json),
			array("Content-Type: application/json")
		);
		$this->assert204($response);
		$originalVersion = $response->getHeader("Last-Modified-Version");
		
		// Get file info
		$response = API::userGet(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1&info=1",
			array(),
			$auth
		);
		$this->assert404($response);
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert200($response);
		$this->assertContentType("application/xml", $response);
		$xml = new SimpleXMLElement($response->getBody());
		
		self::$toDelete[] = "$hash";
		
		$boundary = "---------------------------" . rand();
		$postData = "";
		foreach ($xml->params->children() as $key => $val) {
			$postData .= "--" . $boundary . "\r\nContent-Disposition: form-data; "
				. "name=\"$key\"\r\n\r\n$val\r\n";
		}
		$postData .= "--" . $boundary . "\r\nContent-Disposition: form-data; "
				. "name=\"file\"\r\n\r\n" . $fileContents . "\r\n";
		$postData .= "--" . $boundary . "--";
		
		// Upload to S3
		$response = HTTP::post(
			(string) $xml->url,
			$postData,
			array(
				"Content-Type: multipart/form-data; boundary=" . $boundary
			)
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		
		// Invalid upload key
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			"update=invalidUploadKey&mtime=" . $mtime,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert400($response);
		
		// No mtime
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			"update=" . $xml->key,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert500($response);
		
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			"update=" . $xml->key . "&mtime=" . $mtime,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert204($response);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/{$json['key']}"
		);
		$json = API::getJSONFromResponse($response)['data'];
		// Make sure attachment item version hasn't changed (or else the client
		// will get a conflict when it tries to update the metadata)
		$this->assertEquals($originalVersion, $json['version']);
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($mtime, $json['mtime']);
		
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync?auth=1",
			array(),
			array(
				'username' => self::$config['username'],
				'password' => self::$config['password']
			)
		);
		$this->assert200($response);
		$mtime = $response->getBody();
		$this->assertRegExp('/^[0-9]{10}$/', $mtime);
		
		// File exists
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime + 1000
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert200($response);
		$this->assertContentType("application/xml", $response);
		$this->assertEquals("<exists/>", $response->getBody());
		
		// File exists with different filename
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename . '等', // Unicode 1.1 character, to test signature generation
				"filesize" => $size,
				"mtime" => $mtime + 1000
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert200($response);
		$this->assertContentType("application/xml", $response);
		$this->assertEquals("<exists/>", $response->getBody());
		
		// Make sure attachment version still hasn't changed
		$response = API::userGet(
			self::$config['userID'],
			"items/{$json['key']}"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($originalVersion, $json['version']);
	}
	
	public function testAddFileClientV4Zip() {
		API::userClear(self::$config['userID']);
		
		$auth = array(
			'username' => self::$config['username'],
			'password' => self::$config['password']
		);
		
		// Get last storage sync
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync?auth=1",
			array(),
			$auth
		);
		$this->assert404($response);
		
		$json = API::createItem("book", false, $this, 'jsonData');
		$key = $json['key'];
		
		$fileContentType = "text/html";
		$fileCharset = "UTF-8";
		$fileFilename = "file.html";
		$fileModtime = time();
		
		$json = API::createAttachmentItem("imported_url", [], $key, $this, 'jsonData');
		$key = $json['key'];
		$version = $json['version'];
		$json['contentType'] = $fileContentType;
		$json['charset'] = $fileCharset;
		$json['filename'] = $fileFilename;
		
		$response = API::userPut(
			self::$config['userID'],
			"items/$key",
			json_encode($json),
			array(
				"Content-Type: application/json"
			)
		);
		$this->assert204($response);
		$originalVersion = $response->getHeader("Last-Modified-Version");
		
		// Get file info
		$response = API::userGet(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1&info=1",
			array(),
			$auth
		);
		$this->assert404($response);
		
		$zip = new \ZipArchive();
		$file = "work/$key.zip";
		
		if ($zip->open($file, \ZIPARCHIVE::CREATE) !== TRUE) {
			throw new Exception("Cannot open ZIP file");
		}
		
		$zip->addFromString($fileFilename, self::getRandomUnicodeString());
		$zip->addFromString("file.css", self::getRandomUnicodeString());
		$zip->close();
		
		$hash = md5_file($file);
		$filename = $key . ".zip";
		$size = filesize($file);
		$fileContents = file_get_contents($file);
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $fileModtime,
				"zip" => 1
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert200($response);
		$this->assertContentType("application/xml", $response);
		$xml = new SimpleXMLElement($response->getBody());
		
		self::$toDelete[] = "$hash";
		
		$boundary = "---------------------------" . rand();
		$postData = "";
		foreach ($xml->params->children() as $key => $val) {
			$postData .= "--" . $boundary . "\r\nContent-Disposition: form-data; "
				. "name=\"$key\"\r\n\r\n$val\r\n";
		}
		$postData .= "--" . $boundary . "\r\nContent-Disposition: form-data; "
				. "name=\"file\"\r\n\r\n" . $fileContents . "\r\n";
		$postData .= "--" . $boundary . "--";
		
		// Upload to S3
		$response = HTTP::post(
			(string) $xml->url,
			$postData,
			array(
				"Content-Type: multipart/form-data; boundary=" . $boundary
			)
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			"update=" . $xml->key . "&mtime=" . $fileModtime,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert204($response);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/{$json['key']}"
		);
		$json = API::getJSONFromResponse($response)['data'];
		// Make sure attachment item version hasn't changed (or else the client
		// will get a conflict when it tries to update the metadata)
		$this->assertEquals($originalVersion, $json['version']);
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($fileFilename, $json['filename']);
		$this->assertEquals($fileModtime, $json['mtime']);
		
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync?auth=1",
			array(),
			array(
				'username' => self::$config['username'],
				'password' => self::$config['password']
			)
		);
		$this->assert200($response);
		$mtime = $response->getBody();
		$this->assertRegExp('/^[0-9]{10}$/', $mtime);
		
		// File exists
		$response = API::userPost(
			self::$config['userID'],
			"items/{$json['key']}/file?auth=1&iskey=1&version=1",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $fileModtime + 1000,
				"zip" => 1
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded"
			),
			$auth
		);
		$this->assert200($response);
		$this->assertContentType("application/xml", $response);
		$this->assertEquals("<exists/>", $response->getBody());
		
		// Make sure attachment version still hasn't changed
		$response = API::userGet(
			self::$config['userID'],
			"items/{$json['key']}"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($originalVersion, $json['version']);
	}
	
	public function testAddFileClientV5() {
		API::userClear(self::$config['userID']);
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/html";
		$charset = "utf-8";
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		
		// Get last storage sync
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync"
		);
		$this->assert404($response);
		
		$json = API::createAttachmentItem("imported_file", [
			'contentType' => $contentType,
			'charset' => $charset
		], false, $this, 'jsonData');
		$key = $json['key'];
		$originalVersion = $json['version'];
		
		// File shouldn't exist
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file"
		);
		$this->assert404($response);
		
		//
		// Get upload authorization
		//
		
		// Require If-Match/If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded"
			]
		);
		$this->assert428($response, "If-Match/If-None-Match header not provided");
		
		// Get authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$hash";
		
		//
		// Upload to S3
		//
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		
		// Require If-Match/If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded"
			]
		);
		$this->assert428($response, "If-Match/If-None-Match header not provided");
		
		// Invalid upload key
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=invalidUploadKey",
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert400($response);
		
		// If-Match shouldn't match unregistered file
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert412($response);
		$this->assertNull($response->getHeader("Last-Modified-Version"));
		
		// Successful registration
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		$newVersion = $response->getHeader('Last-Modified-Version');
		$this->assertGreaterThan($originalVersion, $newVersion);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$key"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertEquals($charset, $json['charset']);
		
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync"
		);
		$this->assert200($response);
		$this->assertRegExp('/^[0-9]{10}$/', $response->getBody());
		
		//
		// Update file
		//
		
		// Conflict for If-None-Match when file exists
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime + 1000,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert412($response, "If-None-Match: * set but file exists");
		$this->assertNotNull($response->getHeader("Last-Modified-Version"));
		
		// Conflict for If-Match when existing file differs
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime + 1000,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: " . md5("invalid")
			]
		);
		$this->assert412($response, "ETag does not match current version of file");
		$this->assertNotNull($response->getHeader("Last-Modified-Version"));
		
		// Error if wrong file size given for existing file
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime + 1000,
				"filename" => $filename,
				"filesize" => $size - 1
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert400($response, "Specified file size incorrect for known file");
		
		// File exists
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime + 1000,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey("exists", $json);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertGreaterThan($newVersion, $version);
		$newVersion = $version;
		
		// File exists with different filename
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime + 1000,
				"filename" => $filename . '等', // Unicode 1.1 character, to test signature generation
				"filesize" => $size,
				"contentType" => $contentType,
				"charset" => $charset
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey("exists", $json);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertGreaterThan($newVersion, $version);
	}
	
	public function testAddFileClientV5Zip() {
		API::userClear(self::$config['userID']);
		
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/html";
		$charset = "utf-8";
		$filename = "file.html";
		$mtime = time();
		$hash = md5($fileContents);
		
		// Get last storage sync
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync"
		);
		$this->assert404($response);
		
		$json = API::createItem("book", false, $this, 'jsonData');
		$key = $json['key'];
		
		$json = API::createAttachmentItem("imported_url", [
			'contentType' => $contentType,
			'charset' => $charset
		], $key, $this, 'jsonData');
		$key = $json['key'];
		$originalVersion = $json['version'];
		
		// Create ZIP file
		$zip = new \ZipArchive();
		$file = "work/$key.zip";
		if ($zip->open($file, \ZIPARCHIVE::CREATE) !== TRUE) {
			throw new Exception("Cannot open ZIP file");
		}
		$zip->addFromString($filename, $fileContents);
		$zip->addFromString("file.css", self::getRandomUnicodeString());
		$zip->close();
		$zipHash = md5_file($file);
		$zipFilename = $key . ".zip";
		$zipSize = filesize($file);
		$zipFileContents = file_get_contents($file);
		
		//
		// Get upload authorization
		//
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $zipSize,
				"zipMD5" => $zipHash,
				"zipFilename" => $zipFilename
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$zipHash";
		
		// Upload to S3
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $zipFileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		
		// If-Match with file hash shouldn't match unregistered file
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert412($response);
		
		// If-Match with ZIP hash shouldn't match unregistered file
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $zipHash"
			]
		);
		$this->assert412($response);
		
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		$newVersion = $response->getHeader("Last-Modified-Version");
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$key"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertEquals($charset, $json['charset']);
		
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync"
		);
		$this->assert200($response);
		$this->assertRegExp('/^[0-9]{10}$/', $response->getBody());
		
		// File exists
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime + 1000,
				"filename" => $filename,
				"filesize" => $zipSize,
				"zip" => 1,
				"zipMD5" => $zipHash,
				"zipFilename" => $zipFilename
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey("exists", $json);
		$version = $response->getHeader("Last-Modified-Version");
		$this->assertGreaterThan($newVersion, $version);
		
		// Verify file on S3
		$response = API::userGet(
			self::$config['userID'],
			"items/$key/file"
		);
		$this->assert302($response);
		$location = $response->getHeader("Location");
		
		$response = HTTP::get($location);
		$this->assert200($response);
		// S3 should return ZIP content type
		$this->assertEquals('application/zip', $response->getHeader("Content-Type"));
	}
	
	
	public function test_should_reject_file_in_personal_library_if_it_would_put_user_over_quota() {
		API::userClear(self::$config['userID']);
		
		$key = API::createAttachmentItem("imported_file", [
			'contentType' => 'application/pdf'
		], null, $this, 'key');
		
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => 'd41d8cd98f00b204e9800998ecf8427e',
				"mtime" => $mtime = time() * 1000,
				"filename" => "file.pdf",
				"filesize" => 500 * 1024 * 1024, // 500 MiB
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert413($response, "File would exceed quota (500 &gt; 300)");
		$this->assertEquals(300, $response->getHeader('Zotero-Storage-Quota'));
		$this->assertEquals(self::$config['userID'], $response->getHeader('Zotero-Storage-UserID'));
	}
	
	
	public function test_should_reject_file_in_group_library_if_it_would_put_owner_over_quota() {
		$ownerUserID = self::$config['userID2'];
		$groupID = API::createGroup([
			'owner' => $ownerUserID,
			'type' => 'PublicClosed',
			'name' => \Zotero_Utilities::randomString(14),
			'libraryReading' => 'all',
			'fileEditing' => 'members'
		]);
		$response = API::superPost(
			"groups/$groupID/users",
			'<user id="' . self::$config['userID'] . '" role="member"/>',
			["Content-Type: text/xml"]
		);
		$this->assert200($response);
		$key = API::groupCreateAttachmentItem(
			$groupID,
			"imported_file", [
				'contentType' => 'application/pdf'
			],
			null,
			$this,
			'key'
		);
		$response = API::groupPost(
			$groupID,
			"items/$key/file",
			$this->implodeParams([
				"md5" => 'd41d8cd98f00b204e9800998ecf8427e',
				"mtime" => $mtime = time() * 1000,
				"filename" => "file.pdf",
				"filesize" => 500 * 1024 * 1024, // 500 MiB
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert413($response, "File would exceed quota (500 &gt; 300)");
		$this->assertEquals(300, $response->getHeader('Zotero-Storage-Quota'));
		$this->assertEquals($ownerUserID, $response->getHeader('Zotero-Storage-UserID'));
	}
	
	
	public function test_add_embedded_image_attachment() {
		API::userClear(self::$config['userID']);
		
		$noteKey = API::createNoteItem("", null, $this, 'key');
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		$contentType = "image/png";
		file_put_contents($file, $fileContents);
		$hash = md5($fileContents);
		$filename = "image.png";
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		
		$json = API::createAttachmentItem("embedded_image", [
			'parentItem' => $noteKey,
			'contentType' => $contentType
		], false, $this, 'jsonData');
		$key = $json['key'];
		$originalVersion = $json['version'];
		
		// Get authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$hash";
		
		//
		// Upload to S3
		//
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		$newVersion = $response->getHeader('Last-Modified-Version');
		$this->assertGreaterThan($originalVersion, $newVersion);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$key"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertArrayNotHasKey('charset', $json);
	}
	
	
	public function test_replace_file_with_new_file() {
		API::userClear(self::$config['userID']);
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/html";
		$charset = "utf-8";
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		
		$json = API::createAttachmentItem("imported_file", [
			'contentType' => $contentType,
			'charset' => $charset
		], false, $this, 'jsonData');
		$key = $json['key'];
		$originalVersion = $json['version'];
		
		// Get authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = $hash;
		
		// Upload to S3
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		// Successful registration
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		
		// Verify attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$key"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($hash, $json['md5']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertEquals($charset, $json['charset']);
		
		//
		// Update file
		//
		
		$fileContents = self::getRandomUnicodeString() . self::getRandomUnicodeString();
		file_put_contents($file, $fileContents);
		$newHash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		clearstatcache();
		$size = filesize($file);
		
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $newHash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = $newHash;
		
		// Upload to S3
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		// Successful registration
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: $hash"
			]
		);
		$this->assert204($response);
		
		// Verify new attachment item metadata
		$response = API::userGet(
			self::$config['userID'],
			"items/$key"
		);
		$json = API::getJSONFromResponse($response)['data'];
		$this->assertEquals($newHash, $json['md5']);
		$this->assertEquals($mtime, $json['mtime']);
		$this->assertEquals($filename, $json['filename']);
		$this->assertEquals($contentType, $json['contentType']);
		$this->assertEquals($charset, $json['charset']);
	}
	
	
	public function test_should_include_best_attachment_link_on_parent_for_imported_file() {
		$json = API::createItem("book", false, $this, 'json');
		$this->assertEquals(0, $json['meta']['numChildren']);
		$parentKey = $json['key'];
		
		$json = API::createAttachmentItem("imported_file", [], $parentKey, $this, 'json');
		$attachmentKey = $json['key'];
		$version = $json['version'];
		
		$filename = "test.pdf";
		$mtime = time() * 1000;
		$md5 = "e54589353710950c4b7ff70829a60036";
		$size = filesize("data/test.pdf");
		$fileContents = file_get_contents("data/test.pdf");
		
		// Create attachment item
		$response = API::userPost(
			self::$config['userID'],
			"items",
			json_encode([
				[
					"key" => $attachmentKey,
					"contentType" => "application/pdf",
				]
			]),
			[
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: $version"
			]
		);
		$this->assert200ForObject($response);
		
		// 'attachment' link shouldn't appear if no uploaded file
		$response = API::userGet(
			self::$config['userID'],
			"items/$parentKey"
		);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayNotHasKey('attachment', $json['links']);
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			$this->implodeParams([
				"md5" => $md5,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		// If file doesn't exist on S3, upload
		if (empty($json['exists'])) {
			$response = HTTP::post(
				$json['url'],
				$json['prefix'] . $fileContents . $json['suffix'],
				[
					"Content-Type: {$json['contentType']}"
				]
			);
			$this->assert201($response);
			
			// Post-upload file registration
			$response = API::userPost(
				self::$config['userID'],
				"items/$attachmentKey/file",
				"upload=" . $json['uploadKey'],
				[
					"Content-Type: application/x-www-form-urlencoded",
					"If-None-Match: *"
				]
			);
			$this->assert204($response);
		}
		self::$toDelete[] = "$md5";
		
		// 'attachment' link should now appear
		$response = API::userGet(
			self::$config['userID'],
			"items/$parentKey"
		);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey('attachment', $json['links']);
		$this->assertArrayHasKey('href', $json['links']['attachment']);
		$this->assertEquals('application/json', $json['links']['attachment']['type']);
		$this->assertEquals('application/pdf', $json['links']['attachment']['attachmentType']);
		$this->assertEquals($size, $json['links']['attachment']['attachmentSize']);
	}
	
	
	public function test_should_include_best_attachment_link_on_parent_for_imported_url() {
		$json = API::createItem("book", false, $this, 'json');
		$this->assertEquals(0, $json['meta']['numChildren']);
		$parentKey = $json['key'];
		
		$json = API::createAttachmentItem("imported_url", [], $parentKey, $this, 'json');
		$attachmentKey = $json['key'];
		$version = $json['version'];
		
		$filename = "test.html";
		$mtime = time() * 1000;
		$md5 = "af625b88d74e98e33b78f6cc0ad93ed0";
		$size = filesize("data/test.html.zip");
		$zipMD5 = "f56e3080d7abf39019a9445d7aab6b24";
		$zipFilename = "$attachmentKey.zip";
		$fileContents = file_get_contents("data/test.html.zip");
		
		// Create attachment item
		$response = API::userPost(
			self::$config['userID'],
			"items",
			json_encode([
				[
					"key" => $attachmentKey,
					"contentType" => "text/html",
				]
			]),
			[
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: $version"
			]
		);
		$this->assert200ForObject($response);
		
		// 'attachment' link shouldn't appear if no uploaded file
		$response = API::userGet(
			self::$config['userID'],
			"items/$parentKey"
		);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayNotHasKey('attachment', $json['links']);
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$attachmentKey/file",
			$this->implodeParams([
				"md5" => $md5,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size,
				"zipMD5" => $zipMD5,
				"zipFilename" => $zipFilename,
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		// If file doesn't exist on S3, upload
		if (empty($json['exists'])) {
			$response = HTTP::post(
				$json['url'],
				$json['prefix'] . $fileContents . $json['suffix'],
				[
					"Content-Type: {$json['contentType']}"
				]
			);
			$this->assert201($response);
			
			// Post-upload file registration
			$response = API::userPost(
				self::$config['userID'],
				"items/$attachmentKey/file",
				"upload=" . $json['uploadKey'],
				[
					"Content-Type: application/x-www-form-urlencoded",
					"If-None-Match: *"
				]
			);
			$this->assert204($response);
		}
		self::$toDelete[] = "$md5";
		
		// 'attachment' link should now appear
		$response = API::userGet(
			self::$config['userID'],
			"items/$parentKey"
		);
		$json = API::getJSONFromResponse($response);
		$this->assertArrayHasKey('attachment', $json['links']);
		$this->assertArrayHasKey('href', $json['links']['attachment']);
		$this->assertEquals('application/json', $json['links']['attachment']['type']);
		$this->assertEquals('text/html', $json['links']['attachment']['attachmentType']);
		$this->assertArrayNotHasKey('attachmentSize', $json['links']['attachment']);
	}
	
	
	public function testClientV5ShouldRejectFileSizeMismatch() {
		API::userClear(self::$config['userID']);
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/plain";
		$charset = "utf-8";
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = 0;
		
		$json = API::createAttachmentItem("imported_file", [
			'contentType' => $contentType,
			'charset' => $charset
		], false, $this, 'jsonData');
		$key = $json['key'];
		$originalVersion = $json['version'];
		
		// Get authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$hash";
		
		// Try to upload to S3, which should fail
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert400($response);
		$this->assertStringContainsString(
			"Your proposed upload exceeds the maximum allowed size", $response->getBody()
		);
	}
	
	
	public function testClientV5ShouldReturn404GettingAuthorizationForMissingFile() {
		// Get authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/UP24VFQR/file",
			$this->implodeParams([
				"md5" => md5('qzpqBjLddCc6UhfX'),
				"mtime" => 1477002989206,
				"filename" => 'test.pdf',
				"filesize" => 12345
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert404($response);
	}
	
	
	public function testAddFileLinkedAttachment() {
		$key = API::createAttachmentItem("linked_file", [], false, $this, 'key');
		
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		$contentType = "text/plain";
		$charset = "utf-8";
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file",
			$this->implodeParams(array(
				"md5" => $hash,
				"filename" => $filename,
				"filesize" => $size,
				"mtime" => $mtime,
				"contentType" => $contentType,
				"charset" => $charset
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert400($response);
	}
	
	
	public function test_updating_attachment_hash_should_clear_associated_storage_file() {
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/html";
		$charset = "utf-8";
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		
		$json = API::createAttachmentItem("imported_file", [
			'contentType' => $contentType,
			'charset' => $charset
		], false, $this, 'jsonData');
		$itemKey = $json['key'];
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$itemKey/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$hash";
		
		// Upload to S3
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		// Register upload
		$response = API::userPost(
			self::$config['userID'],
			"items/$itemKey/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		$newVersion = $response->getHeader('Last-Modified-Version');
		
		$filename = "test.pdf";
		$mtime = time();
		$hash = md5(uniqid());
		
		$response = API::userPatch(
			self::$config['userID'],
			"items/$itemKey",
			json_encode([
				"filename" => $filename,
				"mtime" => $mtime,
				"md5" => $hash,
			]),
			[
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: $newVersion"
			]
		);
		$this->assert204($response);
		
		$response = API::userGet(
			self::$config['userID'],
			"items/$itemKey/file"
		);
		$this->assert404($response);
	}
	
	
	public function test_updating_compressed_attachment_hash_should_clear_associated_storage_file() {
		// Create initial file
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/html";
		$charset = "utf-8";
		$filename = "file.html";
		$mtime = time();
		$hash = md5($fileContents);
		
		$json = API::createAttachmentItem("imported_file", [
			'contentType' => $contentType,
			'charset' => $charset
		], false, $this, 'jsonData');
		$itemKey = $json['key'];
		
		// Create initial ZIP file
		$zip = new \ZipArchive();
		$file = "work/$itemKey.zip";
		if ($zip->open($file, \ZIPARCHIVE::CREATE) !== TRUE) {
			throw new Exception("Cannot open ZIP file");
		}
		$zip->addFromString($filename, $fileContents);
		$zip->addFromString("file.css", self::getRandomUnicodeString());
		$zip->close();
		$zipHash = md5_file($file);
		$zipFilename = $itemKey . ".zip";
		$zipSize = filesize($file);
		$zipFileContents = file_get_contents($file);
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$itemKey/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $zipSize,
				"zipMD5" => $zipHash,
				"zipFilename" => $zipFilename
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$zipHash";
		
		// Upload to S3
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $zipFileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		// Register upload
		$response = API::userPost(
			self::$config['userID'],
			"items/$itemKey/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		$newVersion = $response->getHeader('Last-Modified-Version');
		
		// Set new attachment file info
		$hash = md5(uniqid());
		$mtime = time();
		$zipHash = md5(uniqid());
		$zipSize++;
		$response = API::userPatch(
			self::$config['userID'],
			"items/$itemKey",
			json_encode([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename
			]),
			[
				"Content-Type: application/json",
				"If-Unmodified-Since-Version: $newVersion"
			]
		);
		$this->assert204($response);
		
		$response = API::userGet(
			self::$config['userID'],
			"items/$itemKey/file"
		);
		$this->assert404($response);
	}
	
	
	public function test_should_not_allow_anonymous_access_to_file_in_public_closed_group_with_library_reading_for_all() {
		$file = "work/file";
		$fileContents = self::getRandomUnicodeString();
		$contentType = "text/html";
		$charset = "utf-8";
		file_put_contents($file, $fileContents);
		$hash = md5_file($file);
		$filename = "test_" . $fileContents;
		$mtime = filemtime($file) * 1000;
		$size = filesize($file);
		
		$groupID = API::createGroup([
			'owner' => self::$config['userID'],
			'type' => 'PublicClosed',
			'name' => \Zotero_Utilities::randomString(14),
			'libraryReading' => 'all',
			'fileEditing' => 'members'
		]);
		
		$parentKey = API::groupCreateItem($groupID, "book", false, $this, 'key');
		$attachmentKey = API::groupCreateAttachmentItem(
			$groupID,
			"imported_file",
			[
				'contentType' => "text/plain",
				'charset' => "utf-8"
			],
			$parentKey,
			$this,
			'key'
		);
		
		// Get authorization
		$response = API::groupPost(
			$groupID,
			"items/$attachmentKey/file",
			$this->implodeParams([
				"md5" => $hash,
				"mtime" => $mtime,
				"filename" => $filename,
				"filesize" => $size
			]),
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert200($response);
		$json = API::getJSONFromResponse($response);
		
		self::$toDelete[] = "$hash";
		
		//
		// Upload to S3
		//
		$response = HTTP::post(
			$json['url'],
			$json['prefix'] . $fileContents . $json['suffix'],
			[
				"Content-Type: {$json['contentType']}"
			]
		);
		$this->assert201($response);
		
		// Successful registration
		$response = API::groupPost(
			$groupID,
			"items/$attachmentKey/file",
			"upload=" . $json['uploadKey'],
			[
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			]
		);
		$this->assert204($response);
		
		$response = API::get("groups/$groupID/items/$attachmentKey/file");
		$this->assert302($response);
		$response = API::get("groups/$groupID/items/$attachmentKey/file/view");
		$this->assert302($response);
		$response = API::get("groups/$groupID/items/$attachmentKey/file/view/url");
		$this->assert200($response);
		
		API::useAPIKey("");
		$response = API::get("groups/$groupID/items/$attachmentKey/file");
		$this->assert404($response);
		$response = API::get("groups/$groupID/items/$attachmentKey/file/view");
		$this->assert404($response);
		$response = API::get("groups/$groupID/items/$attachmentKey/file/view/url");
		$this->assert404($response);
		
		API::deleteGroup($groupID);
	}
	
	
	// TODO: Reject for keys not owned by user, even if public library
	public function testLastStorageSyncNoAuthorization() {
		API::useAPIKey(false);
		$response = API::userGet(
			self::$config['userID'],
			"laststoragesync"
		);
		$this->assert401($response);
	}
	
	
	private function implodeParams($params, $exclude=array()) {
		$parts = array();
		foreach ($params as $key => $val) {
			if (in_array($key, $exclude)) {
				continue;
			}
			$parts[] = $key . "=" . urlencode($val);
		}
		return implode("&", $parts);
	}
	
	
	private function getRandomUnicodeString() {
		return "Âéìøü 这是一个测试。 "
			// Vary the length
			. \Zotero_Utilities::randomString(rand(10, 20), 'mixed');
	}
}
