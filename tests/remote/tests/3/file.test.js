import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import HTTP from '../../http.js';
import {
	assert200, assert201, assert204, assert302, assert400, assert401, assert403, assert404,
	assert412, assert413, assert428, assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { getS3Client } from '../../s3-helper.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
let dataDir = path.join(__dirname, '..', '..', 'data');

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
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let length = 10 + Math.floor(Math.random() * 11); // 10-20 chars
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return "Âéìøü 这是一个测试。 " + result;
}

// Helper function to generate random string
function randomString(length, type = 'mixed') {
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

describe('File', function() {
	this.timeout(240000); // File operations and S3 uploads can be slow

	let workDir = path.join(process.cwd(), 'work');

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);

		// Create work directory if it doesn't exist
		if (!fs.existsSync(workDir)) {
			fs.mkdirSync(workDir, { recursive: true });
		}

		// Clear user data
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
			return;
		}

		// Delete S3 files
		for (let fileKey of toDelete) {
			try {
				await s3Client.send(new DeleteObjectCommand({
					Bucket: config.get('s3Bucket'),
					Key: fileKey
				}));
			} catch (err) {
				if (err.name === 'NoSuchKey') {
					console.log(`\n${fileKey} not found on S3 to delete`);
				} else {
					console.log(`\nError deleting ${fileKey} from S3: ${err.message}`);
				}
			}
		}
	});

	// PHP: testNewEmptyImportedFileAttachmentItem
	it('should create new empty imported file attachment item', async function() {
		let key = await API.createAttachmentItem('imported_file', [], false, 'key');
		assert.ok(key);

		// Store for next test
		this.parentKey = key;
	});

	// PHP: testAddFileFormDataAuthorizationErrors
	it('should validate file upload authorization parameters', async function() {
		// Create attachment item first
		let parentKey = await API.createAttachmentItem('imported_file', [], false, 'key');

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
				`items/${parentKey}/file`,
				implodeParams(fileParams, [exclude]),
				['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
			);
			assert400(response);
		}

		// Seconds-based mtime (currently not enforced, but commented test in PHP)
		// let fileParams2 = { ...fileParams, mtime: Math.round(mtime / 1000) };

		let fileParamsStr = implodeParams(fileParams);

		// Invalid If-Match
		let response = await API.userPost(
			config.get('userID'),
			`items/${parentKey}/file`,
			fileParamsStr,
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${crypto.createHash('md5').update('invalidETag').digest('hex')}`]
		);
		assert412(response);

		// Missing If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${parentKey}/file`,
			fileParamsStr,
			['Content-Type: application/x-www-form-urlencoded']
		);
		assert428(response);

		// Invalid If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${parentKey}/file`,
			fileParamsStr,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: invalidETag']
		);
		assert400(response);
	});

	// PHP: testAddFileFormDataFull
	it('should add file with form data full flow', async function() {
		let parentKey = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('imported_file', [], parentKey, 'json');
		let attachmentKey = json.key;
		let originalVersion = json.version;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let authJSON = API.getJSONFromResponse(response);
		assert.ok(authJSON);

		toDelete.push(hash);

		// Upload wrong contents to S3 (should fail MD5 check)
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents.split('').reverse().join('') + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert400(response);
		assert.ok(response.getBody().includes('The Content-MD5 you specified did not match what we received'));

		// Upload correct contents to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload - No If-None-Match (should fail)
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded']
		);
		assert428(response);

		// Register upload - Invalid upload key
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			'upload=invalidUploadKey',
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert400(response);

		// Register upload - Success
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}`
		);
		let updatedJSON = API.getJSONFromResponse(response).data;

		assert.equal(updatedJSON.md5, hash);
		assert.equal(updatedJSON.filename, filename);
		assert.equal(updatedJSON.mtime, mtime);
		assert.equal(updatedJSON.contentType, contentType);
		assert.equal(updatedJSON.charset, charset);
	});

	// PHP: testAddFileFormDataFullParams
	it('should add file with form data and params', async function() {
		let json = await API.createAttachmentItem('imported_file', [], false, 'jsonData');
		let attachmentKey = json.key;
		let serverDateModified = json.dateAdded;

		// Sleep to ensure serverDateModified changes
		await new Promise(resolve => setTimeout(resolve, 1000));

		let originalVersion = json.version;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization with params=1
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset,
				params: 1
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let authJSON = API.getJSONFromResponse(response);
		assert.ok(authJSON);

		toDelete.push(hash);

		// Generate form-data multipart body
		let boundary = '---------------------------' + crypto.createHash('md5').update(Date.now().toString()).digest('hex');
		let prefix = '';
		for (let [key, val] of Object.entries(authJSON.params)) {
			prefix += `--${boundary}\r\n`;
			prefix += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
			prefix += `${val}\r\n`;
		}
		prefix += `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\n`;
		let suffix = `\r\n--${boundary}--`;

		// Upload to S3 with multipart form data
		response = await HTTP.post(
			authJSON.url,
			prefix + fileContents + suffix,
			[`Content-Type: multipart/form-data; boundary=${boundary}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}`
		);
		let updatedJSON = API.getJSONFromResponse(response).data;

		assert.equal(updatedJSON.md5, hash);
		assert.equal(updatedJSON.filename, filename);
		assert.equal(updatedJSON.mtime, mtime);
		assert.equal(updatedJSON.contentType, contentType);
		assert.equal(updatedJSON.charset, charset);

		// Make sure version has changed
		assert.notEqual(updatedJSON.version, originalVersion);
	});

	// PHP: testAddFileExisting
	it('should return `exists` for existing file upload', async function() {
		// Create and upload a file first
		let parentKey = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('imported_file', [], parentKey, 'json');
		let attachmentKey = json.key;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Initial upload
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Get the updated item data
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}`
		);
		let updatedJSON = API.getJSONFromResponse(response).data;

		// Now try to upload the same file again - should return 'exists'
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: updatedJSON.md5,
				filename: updatedJSON.filename,
				filesize: size,
				mtime: updatedJSON.mtime,
				contentType: updatedJSON.contentType,
				charset: updatedJSON.charset
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-Match: ' + updatedJSON.md5]
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let existsJSON = API.getJSONFromResponse(response);

		// Should return 'exists'
		assert.equal(existsJSON.exists, 1);
	});

	// PHP: testGetFile
	it('should get file in view and download mode', async function() {
		// Create and upload a file first
		let parentKey = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('imported_file', [], parentKey, 'json');
		let attachmentKey = json.key;

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Upload file
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Get in view mode
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/file/view`
		);
		assert302(response);
		let location = response.getHeader('Location');
		assert.ok(location);
		assert.match(location, /^https:\/\/[^/]+\/[a-zA-Z0-9%]+\/[a-f0-9]{64}\/test_/);
		let filenameEncoded = encodeURIComponent(filename);
		assert.ok(location.endsWith(filenameEncoded));

		// Get from view mode URL
		response = await HTTP.get(location);
		assert200(response);
		let downloadedContent = response.getBody();
		assert.equal(crypto.createHash('md5').update(downloadedContent).digest('hex'), hash);

		// Get in download mode
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/file`
		);
		assert302(response);
		location = response.getHeader('Location');

		// Get from S3
		response = await HTTP.get(location);
		assert200(response);
		assert.equal(crypto.createHash('md5').update(response.getBody()).digest('hex'), hash);
	});

	// PHP: testAddFilePartial
	it('should add file with partial update', async function() {
		let { execSync } = await import('child_process');

		// Create and upload initial file
		let parentKey = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('imported_file', [], parentKey, 'json');
		let attachmentKey = json.key;

		let oldFilename = path.join(workDir, 'old');
		let newFilename = path.join(workDir, 'new');
		let patchFilename = path.join(workDir, 'patch');

		let oldFileContents = getRandomUnicodeString();
		fs.writeFileSync(oldFilename, oldFileContents);

		let oldHash = crypto.createHash('md5').update(oldFileContents).digest('hex');
		let oldStats = fs.statSync(oldFilename);
		let oldMtime = Math.round(oldStats.mtimeMs);
		let oldSize = oldStats.size;

		// Upload initial file
		let response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: oldHash,
				filename: `test_${oldFileContents}`,
				filesize: oldSize,
				mtime: oldMtime,
				contentType: 'text/plain',
				charset: 'utf-8'
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(oldHash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + oldFileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Get original version
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}`
		);
		let itemJSON = API.getJSONFromResponse(response).data;
		let originalVersion = itemJSON.version;

		// Wait a bit to ensure different timestamp
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Define diff algorithms and their commands
		let algorithms = {
			bsdiff: `bsdiff ${oldFilename} ${newFilename} ${patchFilename}`,
			xdelta: `xdelta3 -f -e -9 -S djw -s ${oldFilename} ${newFilename} ${patchFilename}`,
			vcdiff: `vcdiff encode -dictionary ${oldFilename} -target ${newFilename} -delta ${patchFilename}`
		};

		for (let [algo, cmd] of Object.entries(algorithms)) {
			// Create new file with different contents
			let newFileContents = crypto.randomUUID() + getRandomUnicodeString();
			fs.writeFileSync(newFilename, newFileContents);

			let newHash = crypto.createHash('md5').update(newFileContents).digest('hex');
			let newStats = fs.statSync(newFilename);
			let newMtime = Math.round(newStats.mtimeMs);
			let newSize = newStats.size;

			// Get current old file hash
			let currentOldHash = crypto.createHash('md5').update(fs.readFileSync(oldFilename)).digest('hex');

			// Get upload authorization for partial update
			let fileParams = {
				md5: newHash,
				filename: `test_${oldFileContents}`,
				filesize: newSize,
				mtime: newMtime,
				contentType: 'text/plain',
				charset: 'utf-8'
			};
			response = await API.userPost(
				config.get('userID'),
				`items/${attachmentKey}/file`,
				implodeParams(fileParams),
				['Content-Type: application/x-www-form-urlencoded', `If-Match: ${currentOldHash}`]
			);
			assert200(response);
			authJSON = API.getJSONFromResponse(response);

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
				`items/${attachmentKey}/file?algorithm=${algo}&upload=${authJSON.uploadKey}`,
				patch,
				[`If-Match: ${currentOldHash}`]
			);
			assert204(response);

			// Clean up patch file and rename new to old for next iteration
			fs.unlinkSync(patchFilename);
			fs.renameSync(newFilename, oldFilename);

			// Verify attachment item metadata
			response = await API.userGet(
				config.get('userID'),
				`items/${attachmentKey}`
			);
			itemJSON = API.getJSONFromResponse(response).data;
			assert.equal(itemJSON.md5, fileParams.md5);
			assert.equal(itemJSON.mtime, fileParams.mtime);
			assert.equal(itemJSON.contentType, fileParams.contentType);
			assert.equal(itemJSON.charset, fileParams.charset);

			// Make sure version has changed
			assert.notEqual(itemJSON.version, originalVersion);
			originalVersion = itemJSON.version;

			// Verify file on S3
			response = await API.userGet(
				config.get('userID'),
				`items/${attachmentKey}/file`
			);
			assert302(response);
			let location = response.getHeader('Location');

			response = await HTTP.get(location);
			assert200(response);
			assert.equal(crypto.createHash('md5').update(response.getBody()).digest('hex'), fileParams.md5);
			let expectedContentType = `${fileParams.contentType}; charset=${fileParams.charset}`;
			assert.equal(response.getHeader('Content-Type'), expectedContentType);
		}
	});

	// PHP: testExistingFileWithOldStyleFilename
	it('should handle existing file with old-style filename', async function() {
		let s3Client = getS3Client();

		if (!s3Client || !config.has('s3Bucket')) {
			throw new Error('S3 configuration is required for this test');
		}

		let fileContents = getRandomUnicodeString();
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = 'test.txt';
		let size = Buffer.byteLength(fileContents);

		let parentKey = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('imported_file', {}, parentKey, 'jsonData');
		let key = json.key;
		let originalVersion = json.version;
		let mtime = Date.now();
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let authJSON = API.getJSONFromResponse(response);
		assert.ok(authJSON);

		// Upload to old-style location (hash/filename instead of just hash)
		toDelete.push(`${hash}/${filename}`);
		toDelete.push(hash);

		let { PutObjectCommand } = await import('@aws-sdk/client-s3');
		await s3Client.send(new PutObjectCommand({
			Bucket: config.get('s3Bucket'),
			Key: `${hash}/${filename}`,
			Body: fileContents
		}));

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// The file should be accessible at the old-style location
		response = await API.userGet(
			config.get('userID'),
			`items/${key}/file`
		);
		assert302(response);
		let location = response.getHeader('Location');
		assert.match(location, new RegExp(`^https://[^/]+/${hash}/${filename}\\?`));

		// Get upload authorization for the same file on another item - should return 'exists'
		let parentKey2 = await API.createItem('book', false, 'key');
		json = await API.createAttachmentItem('imported_file', {}, parentKey2, 'jsonData');
		let key2 = json.key;

		response = await API.userPost(
			config.get('userID'),
			`items/${key2}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let existsJSON = API.getJSONFromResponse(response);
		assert.equal(existsJSON.exists, 1);

		// File should be accessible
		response = await API.userGet(
			config.get('userID'),
			`items/${key2}/file`
		);
		assert302(response);
		location = response.getHeader('Location');
		assert.match(location, new RegExp(`^https://[^/]+/${hash}/${filename}\\?`));

		// Download from S3 and verify
		response = await HTTP.get(location);
		assert200(response);
		assert.equal(response.getBody(), fileContents);
		assert.equal(response.getHeader('Content-Type'), `${contentType}; charset=${charset}`);
	});

	// PHP: testAddFileClientV5
	it('should add file with client v5 flow', async function() {
		await API.userClear(config.get('userID'));

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;

		// Get last storage sync - should be 404
		let response = await API.userGet(
			config.get('userID'),
			'laststoragesync'
		);
		assert404(response);

		let json = await API.createAttachmentItem('imported_file', {
			contentType: contentType,
			charset: charset
		}, false, 'jsonData');
		let key = json.key;
		let originalVersion = json.version;

		// File shouldn't exist yet
		response = await API.userGet(
			config.get('userID'),
			`items/${key}/file`
		);
		assert404(response);

		// Get upload authorization - require If-Match/If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded']
		);
		assert428(response);

		// Get authorization with If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload - require If-Match/If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded']
		);
		assert428(response);

		// Register upload - invalid upload key
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			'upload=invalidUploadKey',
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert400(response);

		// If-Match shouldn't match unregistered file
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${hash}`]
		);
		assert412(response);
		assert.isNull(response.getHeader('Last-Modified-Version'));

		// Successful registration
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);
		let newVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newVersion, originalVersion);

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let itemJSON = API.getJSONFromResponse(response).data;
		assert.equal(itemJSON.md5, hash);
		assert.equal(itemJSON.mtime, mtime);
		assert.equal(itemJSON.filename, filename);
		assert.equal(itemJSON.contentType, contentType);
		assert.equal(itemJSON.charset, charset);
	});

	// PHP: testAddFileClientV5Zip
	it('should add file with client v5 ZIP flow', async function() {
		await API.userClear(config.get('userID'));

		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		let filename = 'file.html';
		let mtime = Math.floor(Date.now() / 1000); // seconds
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');

		// Get last storage sync - should be 404
		let response = await API.userGet(
			config.get('userID'),
			'laststoragesync'
		);
		assert404(response);

		// Create parent item and attachment
		let json = await API.createItem('book', false, 'jsonData');
		let parentKey = json.key;

		json = await API.createAttachmentItem('imported_url', {
			contentType: contentType,
			charset: charset
		}, parentKey, 'jsonData');
		let key = json.key;
		let originalVersion = json.version;

		// Create ZIP file
		let zip = new AdmZip();
		zip.addFile(filename, Buffer.from(fileContents, 'utf8'));
		zip.addFile('file.css', Buffer.from(getRandomUnicodeString(), 'utf8'));

		let zipFilePath = path.join(workDir, `${key}.zip`);
		zip.writeZip(zipFilePath);

		let zipFileContents = fs.readFileSync(zipFilePath);
		let zipHash = crypto.createHash('md5').update(zipFileContents).digest('hex');
		let zipFilename = `${key}.zip`;
		let zipSize = zipFileContents.length;

		// Get upload authorization
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: zipSize,
				zipMD5: zipHash,
				zipFilename: zipFilename
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(zipHash);

		// Upload ZIP to S3
		// Note: For ZIP files, we need to use Buffer.concat to properly combine binary data
		let uploadBody = Buffer.concat([
			Buffer.from(authJSON.prefix),
			zipFileContents,
			Buffer.from(authJSON.suffix)
		]);
		response = await HTTP.post(
			authJSON.url,
			uploadBody,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload - If-Match with file hash shouldn't work
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${hash}`]
		);
		assert412(response);

		// If-Match with ZIP hash shouldn't work either
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${zipHash}`]
		);
		assert412(response);

		// Successful registration with If-None-Match
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);
		let newVersion = parseInt(response.getHeader('Last-Modified-Version'));

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		json = API.getJSONFromResponse(response).data;
		assert.equal(json.md5, hash);
		assert.equal(json.mtime, mtime);
		assert.equal(json.filename, filename);
		assert.equal(json.contentType, contentType);
		assert.equal(json.charset, charset);

		// Check laststoragesync
		response = await API.userGet(
			config.get('userID'),
			'laststoragesync'
		);
		assert200(response);
		assert.match(response.getBody(), /^[0-9]{10}$/);

		// File exists check
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename,
				filesize: zipSize,
				zip: 1,
				zipMD5: zipHash,
				zipFilename: zipFilename
			}),
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${hash}`]
		);
		assert200(response);
		let existsJSON = API.getJSONFromResponse(response);
		assert.property(existsJSON, 'exists');
		let version = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(version, newVersion);

		// Verify file on S3
		response = await API.userGet(
			config.get('userID'),
			`items/${key}/file`
		);
		assert302(response);
		let location = response.getHeader('Location');

		response = await HTTP.get(location);
		assert200(response);
		// S3 should return ZIP content type
		assert.equal(response.getHeader('Content-Type'), 'application/zip');
	});

	// PHP: test_should_reject_file_in_personal_library_if_it_would_put_user_over_quota
	it('should reject file that would put user over quota', async function() {
		// Clear user data to reset storage usage
		await API.userClear(config.get('userID'));

		let json = await API.createAttachmentItem('imported_file', {
			contentType: 'application/pdf'
		}, false, 'jsonData');
		let key = json.key;

		// Try to upload a 500 MiB file (should exceed default 300 MiB quota)
		let hash = 'd41d8cd98f00b204e9800998ecf8427e';
		let filename = 'file.pdf';
		let mtime = Date.now();
		let size = 500 * 1024 * 1024; // 500 MiB

		// Try to get upload authorization - should fail due to quota
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert413(response);
		assert.ok(response.getBody().includes('File would exceed quota'));
		assert.equal(response.getHeader('Zotero-Storage-Quota'), '300');
		assert.equal(response.getHeader('Zotero-Storage-UserID'), config.get('userID').toString());
	});

	// PHP: test_should_reject_file_in_group_library_if_it_would_put_owner_over_quota
	it('should reject file in group library that would put owner over quota', async function() {
		let ownerUserID = config.get('userID2');
		let groupID = await API.createGroup({
			owner: ownerUserID,
			type: 'PublicClosed',
			name: 'Test Group ' + Date.now(),
			libraryReading: 'all',
			fileEditing: 'members'
		});

		// Add current user as member
		let response = await API.superPost(
			`groups/${groupID}/users`,
			`<user id="${config.get('userID')}" role="member"/>`,
			['Content-Type: text/xml']
		);
		assert200(response);

		// Create attachment in group
		let key = await API.groupCreateAttachmentItem(
			groupID,
			'imported_file',
			{ contentType: 'application/pdf' },
			null,
			'key'
		);

		// Try to upload large file that would exceed owner's quota
		response = await API.groupPost(
			groupID,
			`items/${key}/file`,
			implodeParams({
				md5: 'd41d8cd98f00b204e9800998ecf8427e',
				mtime: Date.now(),
				filename: 'file.pdf',
				filesize: 500 * 1024 * 1024 // 500 MiB
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert413(response);
		assert.ok(response.getBody().includes('File would exceed quota'));
		assert.equal(response.getHeader('Zotero-Storage-Quota'), '300');
		assert.equal(response.getHeader('Zotero-Storage-UserID'), ownerUserID.toString());

		await API.deleteGroup(groupID);
	});

	// PHP: test_add_embedded_image_attachment
	it('should add embedded image attachment', async function() {
		await API.userClear(config.get('userID'));

		let noteKey = await API.createNoteItem('', null, 'key');

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'image/png';
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = 'image.png';
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;

		let json = await API.createAttachmentItem('embedded_image', {
			parentItem: noteKey,
			contentType: contentType
		}, false, 'jsonData');
		let key = json.key;
		let originalVersion = json.version;

		// Get authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);
		let newVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newVersion, originalVersion);

		// Verify attachment item metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let itemJSON = API.getJSONFromResponse(response).data;
		assert.equal(itemJSON.md5, hash);
		assert.equal(itemJSON.mtime, mtime);
		assert.equal(itemJSON.filename, filename);
		assert.equal(itemJSON.contentType, contentType);
		assert.notProperty(itemJSON, 'charset');
	});

	// PHP: test_replace_file_with_new_file
	it('should replace file with new file', async function() {
		await API.userClear(config.get('userID'));

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = stats.size;

		let json = await API.createAttachmentItem('imported_file', {
			contentType: contentType,
			charset: charset
		}, false, 'jsonData');
		let key = json.key;
		let originalVersion = json.version;

		// Get authorization for initial file
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload initial file to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register initial upload
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Verify initial file metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let itemJSON = API.getJSONFromResponse(response).data;
		assert.equal(itemJSON.md5, hash);
		assert.equal(itemJSON.mtime, mtime);
		assert.equal(itemJSON.filename, filename);
		assert.equal(itemJSON.contentType, contentType);
		assert.equal(itemJSON.charset, charset);

		// Update file with new content
		fileContents = getRandomUnicodeString() + getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let newHash = crypto.createHash('md5').update(fileContents).digest('hex');
		filename = `test_${fileContents}`;
		stats = fs.statSync(file);
		mtime = Math.round(stats.mtimeMs);
		size = stats.size;

		// Get authorization for new file
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: newHash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${hash}`]
		);
		assert200(response);
		authJSON = API.getJSONFromResponse(response);

		toDelete.push(newHash);

		// Upload new file to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register new upload
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', `If-Match: ${hash}`]
		);
		assert204(response);

		// Verify new file metadata
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		itemJSON = API.getJSONFromResponse(response).data;
		assert.equal(itemJSON.md5, newHash);
		assert.equal(itemJSON.mtime, mtime);
		assert.equal(itemJSON.filename, filename);
		assert.equal(itemJSON.contentType, contentType);
		assert.equal(itemJSON.charset, charset);
	});

	// PHP: test_should_include_best_attachment_link_on_parent_for_imported_file
	it('should include best attachment link on parent for imported file', async function() {
		let json = await API.createItem('book', false, 'json');
		assert.equal(json.meta.numChildren, 0);
		let parentKey = json.key;

		json = await API.createAttachmentItem('imported_file', {}, parentKey, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = 'test.pdf';
		let mtime = Date.now();
		let fileContents = fs.readFileSync(path.join(dataDir, 'test.pdf'));
		let md5 = crypto.createHash('md5').update(fileContents).digest('hex');
		let size = fileContents.length;

		// Update attachment item with contentType
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([{
				key: attachmentKey,
				contentType: 'application/pdf'
			}]),
			['Content-Type: application/json', `If-Unmodified-Since-Version: ${version}`]
		);
		assert200(response);

		// 'attachment' link shouldn't appear if no uploaded file
		response = await API.userGet(
			config.get('userID'),
			`items/${parentKey}`
		);
		json = API.getJSONFromResponse(response);
		assert.notProperty(json.links, 'attachment');

		// Get upload authorization
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: md5,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		// If file doesn't exist on S3, upload
		if (!authJSON.exists) {
			response = await HTTP.post(
				authJSON.url,
				authJSON.prefix + fileContents + authJSON.suffix,
				[`Content-Type: ${authJSON.contentType}`]
			);
			assert201(response);

			// Register upload
			response = await API.userPost(
				config.get('userID'),
				`items/${attachmentKey}/file`,
				`upload=${authJSON.uploadKey}`,
				['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
			);
			assert204(response);
		}
		toDelete.push(md5);

		// 'attachment' link should now appear
		response = await API.userGet(
			config.get('userID'),
			`items/${parentKey}`
		);
		json = API.getJSONFromResponse(response);
		assert.property(json.links, 'attachment');
		assert.property(json.links.attachment, 'href');
		assert.equal(json.links.attachment.type, 'application/json');
		assert.equal(json.links.attachment.attachmentType, 'application/pdf');
		assert.equal(json.links.attachment.attachmentSize, size);
	});

	// PHP: test_should_include_best_attachment_link_on_parent_for_imported_url
	it('should include best attachment link on parent for imported url', async function() {
		let json = await API.createItem('book', false, 'json');
		assert.equal(json.meta.numChildren, 0);
		let parentKey = json.key;

		json = await API.createAttachmentItem('imported_url', {}, parentKey, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = 'test.html';
		let mtime = Date.now();
		let md5 = 'af625b88d74e98e33b78f6cc0ad93ed0';
		let fileContents = fs.readFileSync(path.join(dataDir, 'test.html.zip'));
		let size = fileContents.length;
		let zipMD5 = crypto.createHash('md5').update(fileContents).digest('hex');
		let zipFilename = `${attachmentKey}.zip`;

		// Update attachment item with contentType
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([{
				key: attachmentKey,
				contentType: 'text/html'
			}]),
			['Content-Type: application/json', `If-Unmodified-Since-Version: ${version}`]
		);
		assert200(response);

		// 'attachment' link shouldn't appear if no uploaded file
		response = await API.userGet(
			config.get('userID'),
			`items/${parentKey}`
		);
		json = API.getJSONFromResponse(response);
		assert.notProperty(json.links, 'attachment');

		// Get upload authorization
		response = await API.userPost(
			config.get('userID'),
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: md5,
				mtime: mtime,
				filename: filename,
				filesize: size,
				zipMD5: zipMD5,
				zipFilename: zipFilename
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		// If file doesn't exist on S3, upload
		if (!authJSON.exists) {
			response = await HTTP.post(
				authJSON.url,
				Buffer.concat([
					Buffer.from(authJSON.prefix),
					fileContents,
					Buffer.from(authJSON.suffix)
				]),
				[`Content-Type: ${authJSON.contentType}`]
			);
			assert201(response);

			// Register upload
			response = await API.userPost(
				config.get('userID'),
				`items/${attachmentKey}/file`,
				`upload=${authJSON.uploadKey}`,
				['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
			);
			assert204(response);
		}
		toDelete.push(zipMD5);

		// 'attachment' link should now appear
		response = await API.userGet(
			config.get('userID'),
			`items/${parentKey}`
		);
		json = API.getJSONFromResponse(response);
		assert.property(json.links, 'attachment');
		assert.property(json.links.attachment, 'href');
		assert.equal(json.links.attachment.type, 'application/json');
		assert.equal(json.links.attachment.attachmentType, 'text/html');
		assert.notProperty(json.links.attachment, 'attachmentSize');
	});

	// PHP: testClientV5ShouldRejectFileSizeMismatch
	it('should reject file size mismatch for client v5', async function() {
		await API.userClear(config.get('userID'));

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/plain';
		let charset = 'utf-8';
		fs.writeFileSync(file, fileContents);

		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = 0; // Wrong size!

		let json = await API.createAttachmentItem('imported_file', {
			contentType: contentType,
			charset: charset
		}, false, 'jsonData');
		let key = json.key;

		// Get authorization with wrong size
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Try to upload to S3 - should fail due to size mismatch
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert400(response);
		assert.ok(response.getBody().includes('Your proposed upload exceeds the maximum allowed size'));
	});

	// PHP: testClientV5ShouldReturn404GettingAuthorizationForMissingFile
	it('should return 404 getting authorization for missing file', async function() {
		// Try to get authorization for non-existent item
		let response = await API.userPost(
			config.get('userID'),
			'items/UP24VFQR/file',
			implodeParams({
				md5: crypto.createHash('md5').update('qzpqBjLddCc6UhfX').digest('hex'),
				mtime: 1477002989206,
				filename: 'test.pdf',
				filesize: 12345
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert404(response);
	});

	// PHP: testAddFileLinkedAttachment
	it('should handle linked attachment', async function() {
		let json = await API.createAttachmentItem('linked_file', [], false, 'jsonData');
		let key = json.key;

		let fileContents = 'Test file';
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = 'test.txt';
		let mtime = Date.now();
		let size = Buffer.byteLength(fileContents);

		// Try to upload file for linked attachment - should fail
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert400(response);
	});

	// PHP: test_updating_attachment_hash_should_clear_associated_storage_file
	it('should clear storage file when updating attachment hash', async function() {
		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = Buffer.byteLength(fileContents);

		let json = await API.createAttachmentItem('imported_file', {
			contentType: contentType,
			charset: charset
		}, false, 'jsonData');
		let itemKey = json.key;

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${itemKey}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${itemKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);
		let newVersion = response.getHeader('Last-Modified-Version');

		// Update attachment with new hash
		let newFilename = 'test.pdf';
		let newMtime = Math.floor(Date.now() / 1000);
		let newHash = crypto.createHash('md5').update(crypto.randomBytes(16).toString('hex')).digest('hex');

		response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify({
				filename: newFilename,
				mtime: newMtime,
				md5: newHash
			}),
			['Content-Type: application/json', `If-Unmodified-Since-Version: ${newVersion}`]
		);
		assert204(response);

		// File should now return 404 since hash changed
		response = await API.userGet(
			config.get('userID'),
			`items/${itemKey}/file`
		);
		assert404(response);
	});

	// PHP: test_updating_compressed_attachment_hash_should_clear_associated_storage_file
	it('should clear storage file when updating compressed attachment hash', async function() {
		// Create initial file
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		let filename = 'file.html';
		let mtime = Math.floor(Date.now() / 1000);
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');

		let json = await API.createAttachmentItem('imported_file', {
			contentType: contentType,
			charset: charset
		}, false, 'jsonData');
		let itemKey = json.key;

		// Create initial ZIP file
		let zip = new AdmZip();
		let zipPath = path.join(workDir, `${itemKey}.zip`);
		zip.addFile(filename, Buffer.from(fileContents, 'utf-8'));
		zip.addFile('file.css', Buffer.from(getRandomUnicodeString(), 'utf-8'));
		zip.writeZip(zipPath);

		let zipHash = crypto.createHash('md5').update(fs.readFileSync(zipPath)).digest('hex');
		let zipFilename = `${itemKey}.zip`;
		let zipSize = fs.statSync(zipPath).size;
		let zipFileContents = fs.readFileSync(zipPath);

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${itemKey}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: zipSize,
				zipMD5: zipHash,
				zipFilename: zipFilename
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(zipHash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			Buffer.concat([
				Buffer.from(authJSON.prefix, 'utf-8'),
				zipFileContents,
				Buffer.from(authJSON.suffix, 'utf-8')
			]),
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${itemKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);
		let newVersion = response.getHeader('Last-Modified-Version');

		// Set new attachment file info
		let newHash = crypto.createHash('md5').update(crypto.randomBytes(16).toString('hex')).digest('hex');
		let newMtime = Math.floor(Date.now() / 1000);
		response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify({
				md5: newHash,
				mtime: newMtime,
				filename: filename
			}),
			['Content-Type: application/json', `If-Unmodified-Since-Version: ${newVersion}`]
		);
		assert204(response);

		// File should now return 404 since hash changed
		response = await API.userGet(
			config.get('userID'),
			`items/${itemKey}/file`
		);
		assert404(response);
	});

	// PHP: test_should_not_allow_anonymous_access_to_file_in_public_closed_group_with_library_reading_for_all
	it('should not allow anonymous access to file in public closed group with library reading for all', async function() {
		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = Buffer.byteLength(fileContents);

		let groupID = await API.createGroup({
			owner: config.get('userID'),
			type: 'PublicClosed',
			name: randomString(14),
			libraryReading: 'all',
			fileEditing: 'members'
		});

		let parentKey = await API.groupCreateItem(groupID, 'book', false, 'key');
		let attachmentKey = await API.groupCreateAttachmentItem(
			groupID,
			'imported_file',
			{
				contentType: 'text/plain',
				charset: 'utf-8'
			},
			parentKey,
			'key'
		);

		// Get authorization
		let response = await API.groupPost(
			groupID,
			`items/${attachmentKey}/file`,
			implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.groupPost(
			groupID,
			`items/${attachmentKey}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);

		// Authenticated access should work
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file`);
		assert302(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view`);
		assert302(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view/url`);
		assert200(response);

		// Anonymous access should not work
		API.useAPIKey('');
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file`);
		assert404(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view`);
		assert404(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view/url`);
		assert404(response);

		await API.deleteGroup(groupID);
	});

	// PHP: testLastStorageSyncNoAuthorization
	it('should require authorization for last storage sync', async function() {
		API.useAPIKey(false);
		let response = await API.userGet(
			config.get('userID'),
			'laststoragesync'
		);
		assert401(response);
	});
});
