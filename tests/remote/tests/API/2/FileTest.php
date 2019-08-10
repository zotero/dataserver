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

namespace APIv2;
use API2 as API, \HTTP, \SimpleXMLElement, \Z_Tests, \ZipArchive;
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
		$xml = API::createAttachmentItem("imported_file", [], false, $this);
		return API::parseDataFromAtomEntry($xml);
	}
	
	
	/**
	 * @depends testNewEmptyImportedFileAttachmentItem
	 */
	public function testAddFileAuthorizationErrors($data) {
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
				"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
			$fileParams,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			)
		);
		$this->assert428($response);
		
		// Invalid If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
			$fileParams,
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: invalidETag"
			)
		);
		$this->assert400($response);
	}
	
	
	public function testAddFileFull() {
		$xml = API::createItem("book", false, $this);
		$data = API::parseDataFromAtomEntry($xml);
		$parentKey = $data['key'];
		
		$xml = API::createAttachmentItem("imported_file", [], $parentKey, $this);
		$data = API::parseDataFromAtomEntry($xml);
		$originalVersion = $data['version'];
		
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
		
		// Upload to S3
		$response = HTTP::post(
			$json->url,
			$json->prefix . $fileContents . $json->suffix,
			array(
				"Content-Type: " . $json->contentType
			)
		);
		$this->assert201($response);
		
		//
		// Register upload
		//
		
		// No If-None-Match
		$response = API::userPost(
			self::$config['userID'],
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
			"upload=" . $json->uploadKey,
			array(
				"Content-Type: application/x-www-form-urlencoded"
			)
		);
		$this->assert428($response);
		
		// Invalid upload key
		$response = API::userPost(
			self::$config['userID'],
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
			"upload=invalidUploadKey",
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-None-Match: *"
			)
		);
		$this->assert400($response);
		
		$response = API::userPost(
			self::$config['userID'],
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/{$data['key']}?key=" . self::$config['apiKey'] . "&content=json"
		);
		$xml = API::getXMLFromResponse($response);
		$data = API::parseDataFromAtomEntry($xml);
		$json = json_decode($data['content']);
		
		$this->assertEquals($hash, $json->md5);
		$this->assertEquals($filename, $json->filename);
		$this->assertEquals($mtime, $json->mtime);
		$this->assertEquals($contentType, $json->contentType);
		$this->assertEquals($charset, $json->charset);
		
		return array(
			"key" => $data['key'],
			"json" => $json,
			"size" => $size
		);
	}
	
	public function testAddFileFullParams() {
		$xml = API::createAttachmentItem("imported_file", [], false, $this);
		$data = API::parseDataFromAtomEntry($xml);
		
		// Get serverDateModified
		$serverDateModified = array_get_first($xml->xpath('/atom:entry/atom:updated'));
		sleep(1);
		
		$originalVersion = $data['version'];
		
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/{$data['key']}?key=" . self::$config['apiKey'] . "&content=json"
		);
		$xml = API::getXMLFromResponse($response);
		$data = API::parseDataFromAtomEntry($xml);
		$json = json_decode($data['content']);
		
		$this->assertEquals($hash, $json->md5);
		$this->assertEquals($filename, $json->filename);
		$this->assertEquals($mtime, $json->mtime);
		$this->assertEquals($contentType, $json->contentType);
		$this->assertEquals($charset, $json->charset);
		
		// Make sure serverDateModified has changed
		$this->assertNotEquals($serverDateModified, array_get_first($xml->xpath('/atom:entry/atom:updated')));
		
		// Make sure version has changed
		$this->assertNotEquals($originalVersion, $data['version']);
	}
	
	
	/**
	 * @depends testAddFileFull
	 */
	public function testAddFileExisting($addFileData) {
		$key = $addFileData['key'];
		$json = $addFileData['json'];
		$md5 = $json->md5;
		$size = $addFileData['size'];
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file?key=" . self::$config['apiKey'],
			$this->implodeParams(array(
				"md5" => $json->md5,
				"filename" => $json->filename,
				"filesize" => $size,
				"mtime" => $json->mtime,
				"contentType" => $json->contentType,
				"charset" => $json->charset
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: " . $json->md5
			)
		);
		$this->assert200($response);
		$postJSON = json_decode($response->getBody());
		$this->assertNotNull($postJSON);
		$this->assertEquals(1, $postJSON->exists);
		
		// Get upload authorization for existing file with different filename
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file?key=" . self::$config['apiKey'],
			$this->implodeParams(array(
				"md5" => $json->md5,
				"filename" => $json->filename . '等', // Unicode 1.1 character, to test signature generation
				"filesize" => $size,
				"mtime" => $json->mtime,
				"contentType" => $json->contentType,
				"charset" => $json->charset
			)),
			array(
				"Content-Type: application/x-www-form-urlencoded",
				"If-Match: " . $json->md5
			)
		);
		$this->assert200($response);
		$postJSON = json_decode($response->getBody());
		$this->assertNotNull($postJSON);
		$this->assertEquals(1, $postJSON->exists);
		
		return array(
			"key" => $key,
			"md5" => $md5,
			"filename" => $json->filename . '等'
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
			"items/$key/file/view?key=" . self::$config['apiKey']
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
			"items/$key/file?key=" . self::$config['apiKey']
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
			"items/{$getFileData['key']}?key=" . self::$config['apiKey'] . "&content=json"
		);
		$xml = API::getXMLFromResponse($response);
		$serverDateModified = (string) array_get_first($xml->xpath('/atom:entry/atom:updated'));
		sleep(1);
		
		$data = API::parseDataFromAtomEntry($xml);
		$originalVersion = $data['version'];
		
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
				"items/{$getFileData['key']}/file?key=" . self::$config['apiKey'],
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
				"items/{$getFileData['key']}/file?key=" . self::$config['apiKey']
					. "&algorithm=$algo&upload=" . $json->uploadKey,
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
				"items/{$getFileData['key']}?key=" . self::$config['apiKey'] . "&content=json"
			);
			$xml = API::getXMLFromResponse($response);
			$data = API::parseDataFromAtomEntry($xml);
			$json = json_decode($data['content']);
			$this->assertEquals($fileParams['md5'], $json->md5);
			$this->assertEquals($fileParams['mtime'], $json->mtime);
			$this->assertEquals($fileParams['contentType'], $json->contentType);
			$this->assertEquals($fileParams['charset'], $json->charset);
			
			// Make sure version has changed
			$this->assertNotEquals($originalVersion, $data['version']);
			
			// Verify file on S3
			$response = API::userGet(
				self::$config['userID'],
				"items/{$getFileData['key']}/file?key=" . self::$config['apiKey']
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
		$xml = API::createAttachmentItem("imported_file", [], $parentKey, $this);
		$data = API::parseDataFromAtomEntry($xml);
		$key = $data['key'];
		$originalVersion = $data['version'];
		$mtime = time() * 1000;
		$contentType = 'text/plain';
		$charset = 'utf-8';
		
		// Get upload authorization
		$response = API::userPost(
			self::$config['userID'],
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
			"items/$key/file?key=" . self::$config['apiKey'],
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
			"items/$key/file?key=" . self::$config['apiKey']
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
		$xml = API::createAttachmentItem("imported_file", [], $parentKey, $this);
		$data = API::parseDataFromAtomEntry($xml);
		$key = $data['key'];
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file?key=" . self::$config['apiKey'],
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
			"items/$key/file?key=" . self::$config['apiKey']
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
		$xml = API::createAttachmentItem("imported_file", [], $parentKey, $this);
		$data = API::parseDataFromAtomEntry($xml);
		$key = $data['key'];
		// Also use a different content type
		$contentType = 'application/x-custom';
		$response = API::userPost(
			self::$config['userID'],
			"items/$key/file?key=" . self::$config['apiKey'],
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
			"items/$key/file?key=" . self::$config['apiKey']
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
	
	
	public function testAddFileLinkedAttachment() {
		$xml = API::createAttachmentItem("linked_file", [], false, $this);
		$data = API::parseDataFromAtomEntry($xml);
		
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
			"items/{$data['key']}/file?key=" . self::$config['apiKey'],
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
		return "Âéìøü 这是一个测试。 " . uniqid();
	}
}
