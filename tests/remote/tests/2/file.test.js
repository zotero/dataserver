/**
 * File tests for API v2
 * Port of tests/remote/tests/API/2/FileTest.php
 */

import { assert } from 'chai';
import config from 'config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { API } from '../../api2.js';
import HTTP from '../../http.js';
import {
	assert200,
	assert201,
	assert204,
	assert302,
	assert400,
	assert412,
	assert428,
	assertContentType
} from '../../assertions2.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';
import { getS3Client } from '../../s3-helper.js';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

let toDelete = [];

// Helper function to convert object params to URL-encoded string
function implodeParams(params, exclude = []) {
	let parts = [];
	for (let [key, val] of Object.entries(params)) {
		if (exclude.includes(key)) {
			continue;
		}
		parts.push(`${key}=${encodeURIComponent(val)}`);
	}
	return parts.join('&');
}

// Helper function to generate random unicode string
function getRandomUnicodeString() {
	return "Âéìøü 这是一个测试。 " + crypto.randomUUID().substring(0, 8);
}

describe('Files (API v2)', function() {
	this.timeout(120000);

	let workDir = path.join(process.cwd(), 'work');

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);

		// Create work directory if it doesn't exist
		if (!fs.existsSync(workDir)) {
			fs.mkdirSync(workDir, { recursive: true });
		}

		await API.userClear(config.get('userID'));
	});

	beforeEach(function() {
		// Delete work files
		let deleteFiles = ['file', 'old', 'new', 'patch'];
		for (let file of deleteFiles) {
			let filePath = path.join(workDir, file);
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}
		}
	});

	after(async function() {
		let s3Client = getS3Client();

		if (!s3Client || !config.has('s3Bucket') || toDelete.length === 0) {
			await API.userClear(config.get('userID'));
			return;
		}

		// Delete S3 files
		for (let fileKey of toDelete) {
			try {
				await s3Client.send(new DeleteObjectCommand({
					Bucket: config.get('s3Bucket'),
					Key: fileKey
				}));
			}
			catch (err) {
				if (err.name === 'NoSuchKey') {
					console.log(`\n${fileKey} not found on S3 to delete`);
				}
				else {
					console.log(`\nError deleting ${fileKey} from S3: ${err.message}`);
				}
			}
		}

		await API.userClear(config.get('userID'));
	});

	// PHP: testNewEmptyImportedFileAttachmentItem
	it('should create new empty imported file attachment', async function() {
		let xml = await API.createAttachmentItem('imported_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		assert.ok(data.key);
		assert.ok(data.version);
	});

	// PHP: testAddFileAuthorizationErrors
	it('should return errors for invalid file authorization requests', async function() {
		let xml = await API.createAttachmentItem('imported_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;

		let fileContents = getRandomUnicodeString();
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let mtime = Date.now();
		let size = Buffer.byteLength(fileContents);
		let filename = `test_${fileContents}`;

		let fileParams = {
			md5: hash,
			filename: filename,
			filesize: size,
			mtime: mtime,
			contentType: 'text/plain',
			charset: 'utf-8'
		};

		// Check required params
		for (let exclude of ['md5', 'filename', 'filesize', 'mtime']) {
			let response = await API.userPost(
				config.get('userID'),
				`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
				implodeParams(fileParams, [exclude]),
				[
					'Content-Type: application/x-www-form-urlencoded',
					'If-None-Match: *'
				]
			);
			assert400(response);
		}

		let fileParamsStr = implodeParams(fileParams);

		// Invalid If-Match
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			fileParamsStr,
			[
				'Content-Type: application/x-www-form-urlencoded',
				`If-Match: ${crypto.createHash('md5').update('invalidETag').digest('hex')}`
			]
		);
		assert412(response);

		// Missing If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			fileParamsStr,
			['Content-Type: application/x-www-form-urlencoded']
		);
		assert428(response);

		// Invalid If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			fileParamsStr,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: invalidETag'
			]
		);
		assert400(response);
	});

	// PHP: testAddFileFull
	it('should add file with full S3 upload flow', async function() {
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;

		xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;
		let originalVersion = data.version;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.floor(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json = API.getJSONFromResponse(response);
		assert.ok(json);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			[`Content-Type: ${json.contentType}`]
		);
		assert201(response);

		//
		// Register upload
		//

		// No If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded']
		);
		assert428(response);

		// Invalid upload key
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			'upload=invalidUploadKey',
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert400(response);

		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}?key=${config.get('apiKey')}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		data = API.parseDataFromAtomEntry(xml);
		let itemJson = JSON.parse(data.content);

		assert.equal(itemJson.md5, hash);
		assert.equal(itemJson.filename, filename);
		assert.equal(itemJson.mtime, mtime);
		assert.equal(itemJson.contentType, contentType);
		assert.equal(itemJson.charset, charset);
	});

	// PHP: testAddFileFullParams
	it('should add file with full S3 upload flow using params=1', async function() {
		let xml = await API.createAttachmentItem('imported_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;
		let originalVersion = data.version;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.floor(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization with params=1
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset,
				params: 1
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json = API.getJSONFromResponse(response);
		assert.ok(json);

		toDelete.push(hash);

		// Generate form-data -- taken from S3::getUploadPostData()
		let boundary = '---------------------------' + crypto.createHash('md5').update(Date.now().toString()).digest('hex');
		let prefix = '';
		for (let [key, val] of Object.entries(json.params)) {
			prefix += `--${boundary}\r\n`;
			prefix += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
			prefix += `${val}\r\n`;
		}
		prefix += `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\n`;
		let suffix = `\r\n--${boundary}--`;

		// Upload to S3
		response = await HTTP.post(
			json.url,
			prefix + fileContents + suffix,
			[`Content-Type: multipart/form-data; boundary=${boundary}`]
		);
		assert201(response);

		//
		// Register upload
		//
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}?key=${config.get('apiKey')}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		data = API.parseDataFromAtomEntry(xml);
		let itemJson = JSON.parse(data.content);

		assert.equal(itemJson.md5, hash);
		assert.equal(itemJson.filename, filename);
		assert.equal(itemJson.mtime, mtime);
		assert.equal(itemJson.contentType, contentType);
		assert.equal(itemJson.charset, charset);

		// Make sure version has changed
		assert.notEqual(originalVersion, data.version);
	});

	// PHP: testAddFileExisting
	it('should return exists for existing file', async function() {
		// First create and upload a file
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;

		xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.floor(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			[`Content-Type: ${json.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert204(response);

		// Now try to upload the same file again - should return 'exists'
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				`If-Match: ${hash}`
			]
		);
		assert200(response);
		let postJSON = API.getJSONFromResponse(response);
		assert.ok(postJSON);
		assert.equal(postJSON.exists, 1);

		// Get upload authorization for existing file with different filename (Unicode test)
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename + '等', // Unicode 1.1 character, to test signature generation
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				`If-Match: ${hash}`
			]
		);
		assert200(response);
		postJSON = API.getJSONFromResponse(response);
		assert.ok(postJSON);
		assert.equal(postJSON.exists, 1);
	});

	// PHP: testGetFile
	it('should get file in view and download mode', async function() {
		// First create and upload a file
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;

		xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.floor(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			[`Content-Type: ${json.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert204(response);

		// Update filename with Unicode character for testing
		let updatedFilename = filename + '等';
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: updatedFilename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				`If-Match: ${hash}`
			]
		);
		assert200(response);

		// Get in view mode
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/file/view?key=${config.get('apiKey')}`
		);
		assert302(response);
		let location = response.getHeader('Location');
		assert.match(location, /^https:\/\/[^/]+\/[a-zA-Z0-9%]+\/[a-f0-9]{64}\/test_/);
		let filenameEncoded = encodeURIComponent(updatedFilename);
		assert.equal(filenameEncoded, location.substring(location.length - filenameEncoded.length));

		// Get from view mode
		response = await HTTP.get(location);
		assert200(response);
		assert.equal(hash, crypto.createHash('md5').update(response.getBody()).digest('hex'));

		// Get in download mode
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`
		);
		assert302(response);
		location = response.getHeader('Location');

		// Get from S3
		response = await HTTP.get(location);
		assert200(response);
		assert.equal(hash, crypto.createHash('md5').update(response.getBody()).digest('hex'));
	});

	// PHP: testAddFilePartial
	it('should add file with partial update (binary diff)', async function() {
		let { execSync } = await import('child_process');

		// First create and upload a file
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;

		xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;

		let oldFilename = path.join(workDir, 'old');
		let newFilename = path.join(workDir, 'new');
		let patchFilename = path.join(workDir, 'patch');

		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(oldFilename, fileContents);
		let hash = crypto.createHash('md5').update(fs.readFileSync(oldFilename)).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(oldFilename);
		let mtime = Math.floor(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			[`Content-Type: ${json.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert204(response);

		// Get serverDateModified and version
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}?key=${config.get('apiKey')}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		let updatedNode = xpathSelect(xml, '//atom:entry/atom:updated/text()', true);
		let serverDateModified = updatedNode ? updatedNode.nodeValue : null;
		data = API.parseDataFromAtomEntry(xml);
		let originalVersion = data.version;

		// Sleep to ensure timestamps change
		await new Promise(resolve => setTimeout(resolve, 1000));

		let algorithms = {
			bsdiff: `bsdiff ${oldFilename} ${newFilename} ${patchFilename}`,
			xdelta: `xdelta3 -f -e -9 -S djw -s ${oldFilename} ${newFilename} ${patchFilename}`,
			vcdiff: `vcdiff encode -dictionary ${oldFilename} -target ${newFilename} -delta ${patchFilename}`
		};

		for (let [algo, cmd] of Object.entries(algorithms)) {
			// Create random contents
			let newFileContents = crypto.randomUUID() + getRandomUnicodeString();
			fs.writeFileSync(newFilename, newFileContents);
			let newHash = crypto.createHash('md5').update(fs.readFileSync(newFilename)).digest('hex');
			let newStats = fs.statSync(newFilename);
			let newMtime = Math.floor(newStats.mtimeMs);
			let newSize = newStats.size;

			// Get upload authorization
			let fileParams = {
				md5: newHash,
				filename: `test_${fileContents}`,
				filesize: newSize,
				mtime: newMtime,
				contentType: contentType,
				charset: charset
			};

			let currentOldHash = crypto.createHash('md5').update(fs.readFileSync(oldFilename)).digest('hex');

			response = await API.userPost(
				config.get('userID'),
				`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
				implodeParams(fileParams),
				[
					'Content-Type: application/x-www-form-urlencoded',
					`If-Match: ${currentOldHash}`
				]
			);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.ok(json);

			// Generate patch
			try {
				execSync(cmd);
			}
			catch (e) {
				console.log(`Warning: Error running ${algo} -- skipping file upload test`);
				continue;
			}

			let patch = fs.readFileSync(patchFilename);
			assert.notEqual(patch.length, 0);

			toDelete.push(newHash);

			// Upload patch file
			response = await API.userPatch(
				config.get('userID'),
				`items/${attachmentKey}/file?key=${config.get('apiKey')}&algorithm=${algo}&upload=${json.uploadKey}`,
				patch,
				[`If-Match: ${currentOldHash}`]
			);
			assert204(response);

			fs.unlinkSync(patchFilename);
			fs.renameSync(newFilename, oldFilename);

			// Verify attachment item metadata
			response = await API.userGet(
				config.get('userID'),
				`items/${attachmentKey}?key=${config.get('apiKey')}&content=json`
			);
			xml = API.getXMLFromResponse(response);
			data = API.parseDataFromAtomEntry(xml);
			let itemJson = JSON.parse(data.content);
			assert.equal(itemJson.md5, fileParams.md5);
			assert.equal(itemJson.mtime, fileParams.mtime);
			assert.equal(itemJson.contentType, fileParams.contentType);
			assert.equal(itemJson.charset, fileParams.charset);

			// Make sure version has changed
			assert.notEqual(originalVersion, data.version);

			// Verify file on S3
			response = await API.userGet(
				config.get('userID'),
				`items/${attachmentKey}/file?key=${config.get('apiKey')}`
			);
			assert302(response);
			let location = response.getHeader('Location');

			response = await HTTP.get(location);
			assert200(response);
			assert.equal(fileParams.md5, crypto.createHash('md5').update(response.getBody()).digest('hex'));
			let expectedContentType = `${fileParams.contentType}; charset=${fileParams.charset}`;
			assert.equal(response.getHeader('Content-Type'), expectedContentType);
		}
	});

	// PHP: testExistingFileWithOldStyleFilename
	it('should handle existing file with old-style filename', async function() {
		let s3Client = getS3Client();

		if (!s3Client || !config.has('s3Bucket')) {
			this.skip();
			return;
		}

		let fileContents = getRandomUnicodeString();
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = 'test.txt';
		let size = Buffer.byteLength(fileContents);

		let parentKey = await API.createItem('book', false, 'key');
		let xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;
		let originalVersion = data.version;
		let mtime = Date.now();
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json = API.getJSONFromResponse(response);
		assert.ok(json);

		// Upload to old-style location
		toDelete.push(`${hash}/${filename}`);
		toDelete.push(hash);
		await s3Client.send(new PutObjectCommand({
			Bucket: config.get('s3Bucket'),
			Key: `${hash}/${filename}`,
			Body: fileContents
		}));

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			`upload=${json.uploadKey}`,
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert204(response);

		// The file should be accessible on the item at the old-style location
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`
		);
		assert302(response);
		let location = response.getHeader('Location');
		// Match pattern: bucket.s3.amazonaws.com or s3.amazonaws.com/bucket
		let s3Bucket = config.get('s3Bucket');
		let pattern = new RegExp('^https://(?:[^/]+|.+' + s3Bucket + ')/([a-f0-9]{32})/' + filename + '\\?');
		let matches = location.match(pattern);
		assert.ok(matches, `Location should match old-style pattern: ${location}`);
		assert.equal(matches[1], hash);

		// Get upload authorization for the same file and filename on another item, which should
		// result in 'exists', even though we uploaded to the old-style location
		parentKey = await API.createItem('book', false, 'key');
		xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let key2 = data.key;

		response = await API.userPost(
			config.get('userID'),
			`items/${key2}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		let postJSON = API.getJSONFromResponse(response);
		assert.ok(postJSON);
		assert.equal(postJSON.exists, 1);

		// Get in download mode
		response = await API.userGet(
			config.get('userID'),
			`items/${key2}/file?key=${config.get('apiKey')}`
		);
		assert302(response);
		location = response.getHeader('Location');
		matches = location.match(pattern);
		assert.ok(matches, `Location should match old-style pattern: ${location}`);
		assert.equal(matches[1], hash);

		// Get from S3
		response = await HTTP.get(location);
		assert200(response);
		assert.equal(response.getBody(), fileContents);
		assert.equal(response.getHeader('Content-Type'), `${contentType}; charset=${charset}`);

		// Get upload authorization for the same file and different filename on another item,
		// which should result in 'exists' and a copy of the file to the hash-only location
		parentKey = await API.createItem('book', false, 'key');
		xml = await API.createAttachmentItem('imported_file', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let key3 = data.key;
		// Also use a different content type
		let contentType2 = 'application/x-custom';
		response = await API.userPost(
			config.get('userID'),
			`items/${key3}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: 'test2.txt',
				filesize: size,
				mtime: mtime,
				contentType: contentType2
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert200(response);
		postJSON = API.getJSONFromResponse(response);
		assert.ok(postJSON);
		assert.equal(postJSON.exists, 1);

		// Get in download mode
		response = await API.userGet(
			config.get('userID'),
			`items/${key3}/file?key=${config.get('apiKey')}`
		);
		assert302(response);
		location = response.getHeader('Location');
		// Should now be at hash-only location (no filename)
		let hashOnlyPattern = new RegExp('^https://(?:[^/]+|.+' + s3Bucket + ')/([a-f0-9]{32})\\?');
		matches = location.match(hashOnlyPattern);
		assert.ok(matches, `Location should match hash-only pattern: ${location}`);
		assert.equal(matches[1], hash);

		// Get from S3
		response = await HTTP.get(location);
		assert200(response);
		assert.equal(response.getBody(), fileContents);
		assert.equal(response.getHeader('Content-Type'), contentType2);
	});

	// PHP: testAddFileLinkedAttachment
	it('should reject file upload on linked attachment', async function() {
		let xml = await API.createAttachmentItem('linked_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let attachmentKey = data.key;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.floor(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file?key=${config.get('apiKey')}`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			[
				'Content-Type: application/x-www-form-urlencoded',
				'If-None-Match: *'
			]
		);
		assert400(response);
	});
});
