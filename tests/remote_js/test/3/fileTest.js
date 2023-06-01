const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");
const { S3Client, DeleteObjectsCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const HTTP = require('../../httpHandler.js');
const crypto = require('crypto');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JSZIP = require("jszip");

describe('FileTestTests', function () {
	this.timeout(config.timeout);
	let toDelete = [];
	const s3Client = new S3Client({ region: "us-east-1" });

	before(async function () {
		await API3Before();
		try {
			fs.mkdirSync("./work");
		}
		catch {}
	});

	after(async function () {
		await API3After();
		fs.rm("./work", { recursive: true, force: true }, (e) => {
			if (e) console.log(e);
		});
		if (toDelete.length > 0) {
			const commandInput = {
				Bucket: config.s3Bucket,
				Delete: {
					Objects: toDelete.map((x) => {
						return { Key: x };
					})
				}
			};
			const command = new DeleteObjectsCommand(commandInput);
			await s3Client.send(command);
		}
	});

	beforeEach(async () => {
		API.useAPIKey(config.apiKey);
	});

	const testGetFile = async () => {
		const addFileData = await testAddFileExisting();

		// Get in view mode
		let response = await API.userGet(
			config.userID,
			`items/${addFileData.key}/file/view`
		);
		Helpers.assert302(response);
		const location = response.headers.location[0];
		Helpers.assertRegExp(/^https?:\/\/[^/]+\/[a-zA-Z0-9%]+\/[a-f0-9]{64}\/test_/, location);
		const filenameEncoded = encodeURIComponent(addFileData.filename);
		assert.equal(filenameEncoded, location.substring(location.length - filenameEncoded.length));

		// Get from view mode
		const viewModeResponse = await HTTP.get(location);
		Helpers.assert200(viewModeResponse);
		assert.equal(addFileData.md5, Helpers.md5(viewModeResponse.data));

		// Get in download mode
		response = await API.userGet(
			config.userID,
			`items/${addFileData.key}/file`
		);
		Helpers.assert302(response);

		// Get from S3
		const downloadModeLocation = response.headers.location[0];
		const s3Response = await HTTP.get(downloadModeLocation);
		Helpers.assert200(s3Response);
		assert.equal(addFileData.md5, Helpers.md5(s3Response.data));

		return {
			key: addFileData.key,
			response: s3Response
		};
	};

	it('testAddFileLinkedAttachment', async function () {
		let key = await API.createAttachmentItem("linked_file", [], false, this, 'key');

		let file = "./work/file";
		let fileContents = Helpers.getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = Helpers.md5File(file);
		let filename = "test_" + fileContents;
		let mtime = fs.statSync(file).mtimeMs;
		let size = fs.statSync(file).size;
		let contentType = "text/plain";
		let charset = "utf-8";

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert400(response);
	});

	it('testAddFileFormDataFullParams', async function () {
		let json = await API.createAttachmentItem("imported_file", [], false, this, 'json');
		let attachmentKey = json.key;

		await new Promise(r => setTimeout(r, 2000));

		let originalVersion = json.version;
		let file = "./work/file";
		let fileContents = Helpers.getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = Helpers.md5File(file);
		let filename = "test_" + fileContents;
		let size = parseInt(fs.statSync(file).size);
		let mtime = parseInt(fs.statSync(file).mtimeMs);
		let contentType = "text/plain";
		let charset = "utf-8";

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${attachmentKey}/file`,
			Helpers.implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset,
				params: 1
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		assert.ok(json);
		toDelete.push(hash);

		// Generate form-data -- taken from S3::getUploadPostData()
		let boundary = "---------------------------" + Helpers.md5(Helpers.uniqueID());
		let prefix = "";
		for (let key in json.params) {
			prefix += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + json.params[key] + "\r\n";
		}
		prefix += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\n";
		let suffix = "\r\n--" + boundary + "--";
		// Upload to S3
		response = await HTTP.post(
			json.url,
			prefix + fileContents + suffix,
			{
				"Content-Type": "multipart/form-data; boundary=" + boundary
			}
		);
		Helpers.assert201(response);

		// Register upload
		response = await API.userPost(
			config.userID,
			`items/${attachmentKey}/file`,
			"upload=" + json.uploadKey,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(
			config.userID,
			`items/${attachmentKey}`
		);
		json = API.getJSONFromResponse(response).data;
		assert.equal(hash, json.md5);
		assert.equal(filename, json.filename);
		assert.equal(mtime, json.mtime);
		assert.equal(contentType, json.contentType);
		assert.equal(charset, json.charset);

		// Make sure version has changed
		assert.notEqual(originalVersion, json.version);
	});


	const generateZip = async (file, fileContents, archiveName) => {
		const zip = new JSZIP();

		zip.file(file, fileContents);
		zip.file("file.css", Helpers.getRandomUnicodeString());

		const content = await zip.generateAsync({
			type: "nodebuffer",
			compression: "DEFLATE",
			compressionOptions: { level: 1 }
		});
		fs.writeFileSync(archiveName, content);
	
		// Because when the file is sent, the buffer is stringified, we have to hash the stringified
		// fileContents and get the size of stringified buffer here, otherwise they wont match.
		return {
			hash: Helpers.md5(content.toString()),
			zipSize: Buffer.from(content.toString()).byteLength,
			fileContent: fs.readFileSync(archiveName)
		};
	};

	it('testExistingFileWithOldStyleFilename', async function () {
		let fileContents = Helpers.getRandomUnicodeString();
		let hash = Helpers.md5(fileContents);
		let filename = 'test.txt';
		let size = fileContents.length;

		let parentKey = await API.createItem("book", false, this, 'key');
		let json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'jsonData');
		let key = json.key;
		let mtime = Date.now();
		let contentType = 'text/plain';
		let charset = 'utf-8';

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				filename,
				filesize: size,
				mtime,
				contentType,
				charset
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		assert.isOk(json);

		// Upload to old-style location
		toDelete.push(`${hash}/${filename}`);
		toDelete.push(hash);
		const putCommand = new PutObjectCommand({
			Bucket: config.s3Bucket,
			Key: `${hash}/${filename}`,
			Body: fileContents
		});
		await s3Client.send(putCommand);

		// Register upload
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${json.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);

		// The file should be accessible on the item at the old-style location
		response = await API.userGet(
			config.userID,
			`items/${key}/file`
		);
		Helpers.assert302(response);
		let location = response.headers.location[0];
		let matches = location.match(/^https:\/\/(?:[^/]+|.+config.s3Bucket)\/([a-f0-9]{32})\/test.txt\?/);
		Helpers.assertEquals(2, matches.length);
		Helpers.assertEquals(hash, matches[1]);

		// Get upload authorization for the same file and filename on another item, which should
		// result in 'exists', even though we uploaded to the old-style location
		parentKey = await API.createItem("book", false, this, 'key');
		json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'jsonData');

		key = json.key;
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				filename,
				filesize: size,
				mtime,
				contentType,
				charset
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		let postJSON = JSON.parse(response.data);
		assert.isOk(postJSON);
		Helpers.assertEquals(1, postJSON.exists);

		// Get in download mode
		response = await API.userGet(
			config.userID,
			`items/${key}/file`
		);
		Helpers.assert302(response);
		location = response.headers.location[0];
		matches = location.match(/^https:\/\/(?:[^/]+|.+config.s3Bucket)\/([a-f0-9]{32})\/test.txt\?/);
		Helpers.assertEquals(2, matches.length);
		Helpers.assertEquals(hash, matches[1]);

		// Get from S3
		response = await HTTP.get(location);
		Helpers.assert200(response);
		Helpers.assertEquals(fileContents, response.data);
		Helpers.assertEquals(`${contentType}; charset=${charset}`, response.headers['content-type'][0]);

		// Get upload authorization for the same file and different filename on another item,
		// which should result in 'exists' and a copy of the file to the hash-only location
		parentKey = await API.createItem("book", false, this, 'key');
		json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'jsonData');

		key = json.key;
		// Also use a different content type
		contentType = 'application/x-custom';
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				filename: "test2.txt",
				filesize: size,
				mtime,
				contentType
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		postJSON = JSON.parse(response.data);
		assert.isOk(postJSON);
		Helpers.assertEquals(1, postJSON.exists);

		// Get in download mode
		response = await API.userGet(
			config.userID,
			`items/${key}/file`
		);
		Helpers.assert302(response);
		location = response.headers.location[0];
		matches = location.match(/^https:\/\/(?:[^/]+|.+config.s3Bucket)\/([a-f0-9]{32})\?/);
		Helpers.assertEquals(2, matches.length);
		Helpers.assertEquals(hash, matches[1]);

		// Get from S3
		response = await HTTP.get(location);
		Helpers.assert200(response);
		Helpers.assertEquals(fileContents, response.data);
		Helpers.assertEquals(contentType, response.headers['content-type'][0]);
	});

	const testAddFileFormDataFull = async () => {
		let parentKey = await API.createItem("book", false, this, 'key');
		let json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'json');
		let attachmentKey = json.key;

		let file = "./work/file";
		let fileContents = Helpers.getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = Helpers.md5File(file);
		let filename = "test_" + fileContents;
		let mtime = fs.statSync(file).mtime * 1000;
		let size = fs.statSync(file).size;
		let contentType = "text/plain";
		let charset = "utf-8";

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${attachmentKey}/file`,
			Helpers.implodeParams({
				md5: hash,
				filename: filename,
				filesize: size,
				mtime: mtime,
				contentType: contentType,
				charset: charset
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		assert.isOk(json);
		toDelete.push(`${hash}`);

		// Upload wrong contents to S3
		const wrongContent = fileContents.split('').reverse().join("");
		response = await HTTP.post(
			json.url,
			json.prefix + wrongContent + json.suffix,
			{
				"Content-Type": `${json.contentType}`
			}
		);
		Helpers.assert400(response);
		assert.include(response.data, "The Content-MD5 you specified did not match what we received.");

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			{
				"Content-Type": `${json.contentType}`
			}
		);
		Helpers.assert201(response);

		// Register upload

		// No If-None-Match
		response = await API.userPost(
			config.userID,
			`items/${attachmentKey}/file`,
			`upload=${json.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
			}
		);
		Helpers.assert428(response);

		// Invalid upload key
		response = await API.userPost(
			config.userID,
			`items/${attachmentKey}/file`,
			`upload=invalidUploadKey`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert400(response);

		response = await API.userPost(
			config.userID,
			`items/${attachmentKey}/file`,
			`upload=${json.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(
			config.userID,
			`items/${attachmentKey}`
		);
		json = API.getJSONFromResponse(response).data;

		assert.equal(hash, json.md5);
		assert.equal(filename, json.filename);
		assert.equal(mtime, json.mtime);
		assert.equal(contentType, json.contentType);
		assert.equal(charset, json.charset);

		return {
			key: attachmentKey,
			json: json,
			size: size
		};
	};

	it('testAddFileFormDataAuthorizationErrors', async function () {
		const parentKey = await API.createAttachmentItem("imported_file", [], false, this, 'key');
		const fileContents = Helpers.getRandomUnicodeString();
		const hash = Helpers.md5(fileContents);
		const mtime = Date.now();
		const size = fileContents.length;
		const filename = `test_${fileContents}`;

		const fileParams = {
			md5: hash,
			filename,
			filesize: size,
			mtime,
			contentType: "text/plain",
			charset: "utf-8"
		};

		// Check required params
		const requiredParams = ["md5", "filename", "filesize", "mtime"];
		for (let i = 0; i < requiredParams.length; i++) {
			const exclude = requiredParams[i];
			const response = await API.userPost(
				config.userID,
				`items/${parentKey}/file`,
				Helpers.implodeParams(fileParams, [exclude]),
				{
					"Content-Type": "application/x-www-form-urlencoded",
					"If-None-Match": "*"
				});
			Helpers.assert400(response);
		}

		// Seconds-based mtime
		const fileParams2 = { ...fileParams, mtime: Math.round(mtime / 1000) };
		const _ = await API.userPost(
			config.userID,
			`items/${parentKey}/file`,
			Helpers.implodeParams(fileParams2),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			});
		// TODO: Enable this test when the dataserver enforces it
		//Helpers.assert400(response2);
		//assert.equal('mtime must be specified in milliseconds', response2.data);

		// Invalid If-Match
		const response3 = await API.userPost(
			config.userID,
			`items/${parentKey}/file`,
			Helpers.implodeParams(fileParams),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": Helpers.md5("invalidETag")
			});
		Helpers.assert412(response3);

		// Missing If-None-Match
		const response4 = await API.userPost(
			config.userID,
			`items/${parentKey}/file`,
			Helpers.implodeParams(fileParams),
			{
				"Content-Type": "application/x-www-form-urlencoded"
			});
		Helpers.assert428(response4);

		// Invalid If-None-Match
		const response5 = await API.userPost(
			config.userID,
			`items/${parentKey}/file}`,
			Helpers.implodeParams(fileParams),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "invalidETag"
			});
		Helpers.assert400(response5);
	});


	it('testAddFilePartial', async function () {
		const getFileData = await testGetFile();
		const response = await API.userGet(
			config.userID,
			`items/${getFileData.key}`
		);
		let json = API.getJSONFromResponse(response).data;

		await new Promise(resolve => setTimeout(resolve, 1000));

		const originalVersion = json.version;

		const oldFilename = "./work/old";
		const fileContents = getFileData.response.data;
		fs.writeFileSync(oldFilename, fileContents);

		const newFilename = "./work/new";
		const patchFilename = "./work/patch";

		const algorithms = {
			bsdiff: `bsdiff ${oldFilename} ${newFilename} ${patchFilename}`,
			xdelta: `xdelta -f -e -9 -S djw -s ${oldFilename} ${newFilename} ${patchFilename}`,
			vcdiff: `vcdiff encode -dictionary ${oldFilename}  -target ${newFilename}  -delta ${patchFilename}`,
		};

		for (let [algo, cmd] of Object.entries(algorithms)) {
			// Create random contents
			fs.writeFileSync(newFilename, Helpers.getRandomUnicodeString() + Helpers.uniqueID());
			const newHash = Helpers.md5File(newFilename);

			// Get upload authorization
			const fileParams = {
				md5: newHash,
				filename: `test_${fileContents}`,
				filesize: fs.statSync(newFilename).size,
				mtime: parseInt(fs.statSync(newFilename).mtimeMs),
				contentType: "text/plain",
				charset: "utf-8",
			};

			const postResponse = await API.userPost(
				config.userID,
				`items/${getFileData.key}/file`,
				Helpers.implodeParams(fileParams),
				{
					"Content-Type": "application/x-www-form-urlencoded",
					"If-Match": Helpers.md5File(oldFilename),
				}
			);
			Helpers.assert200(postResponse);
			let json = JSON.parse(postResponse.data);
			assert.isOk(json);
			try {
				await exec(cmd);
			}
			catch {
				console.log("Warning: Could not run " + algo);
				continue;
			}

			const patch = fs.readFileSync(patchFilename);
			assert.notEqual("", patch.toString());

			toDelete.push(newHash);

			// Upload patch file
			let response = await API.userPatch(
				config.userID,
				`items/${getFileData.key}/file?algorithm=${algo}&upload=${json.uploadKey}`,
				patch,
				{
					"If-Match": Helpers.md5File(oldFilename),
				}
			);
			Helpers.assert204(response);

			fs.rmSync(patchFilename);
			fs.renameSync(newFilename, oldFilename);
			// Verify attachment item metadata
			response = await API.userGet(
				config.userID,
				`items/${getFileData.key}`
			);
			json = API.getJSONFromResponse(response).data;

			Helpers.assertEquals(fileParams.md5, json.md5);
			Helpers.assertEquals(fileParams.mtime, json.mtime);
			Helpers.assertEquals(fileParams.contentType, json.contentType);
			Helpers.assertEquals(fileParams.charset, json.charset);

			// Make sure version has changed
			assert.notEqual(originalVersion, json.version);

			// Verify file on S3
			const fileResponse = await API.userGet(
				config.userID,
				`items/${getFileData.key}/file`
			);
			Helpers.assert302(fileResponse);
			const location = fileResponse.headers.location[0];

			const getFileResponse = await HTTP.get(location);
			Helpers.assert200(getFileResponse);
			Helpers.assertEquals(fileParams.md5, Helpers.md5(getFileResponse.data));
			Helpers.assertEquals(
				`${fileParams.contentType}${fileParams.contentType && fileParams.charset ? `; charset=${fileParams.charset}` : ""
				}`,
				getFileResponse.headers["content-type"][0]
			);
		}
	});

	const testAddFileExisting = async () => {
		const addFileData = await testAddFileFormDataFull();
		const key = addFileData.key;
		const json = addFileData.json;
		const md5 = json.md5;
		const size = addFileData.size;

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: json.md5,
				filename: json.filename,
				filesize: size,
				mtime: json.mtime,
				contentType: json.contentType,
				charset: json.charset
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": json.md5
			}
		);
		Helpers.assert200(response);
		let postJSON = JSON.parse(response.data);
		assert.isOk(postJSON);
		assert.equal(1, postJSON.exists);

		// Get upload authorization for existing file with different filename
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: json.md5,
				filename: json.filename + "等", // Unicode 1.1 character, to test signature generation
				filesize: size,
				mtime: json.mtime,
				contentType: json.contentType,
				charset: json.charset
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": json.md5
			}
		);
		Helpers.assert200(response);
		postJSON = JSON.parse(response.data);
		assert.isOk(postJSON);
		assert.equal(1, postJSON.exists);

		const testResult = {
			key: key,
			md5: md5,
			filename: json.filename + "等"
		};
		return testResult;
	};


	it('testAddFileClientV4Zip', async function () {
		await API.userClear(config.userID);

		const auth = {
			username: config.username,
			password: config.password,
		};

		// Get last storage sync
		const response1 = await API.userGet(
			config.userID,
			'laststoragesync?auth=1',
			{},
			auth
		);
		Helpers.assert404(response1);

		const json1 = await API.createItem('book', false, this, 'jsonData');
		let key = json1.key;

		const fileContentType = 'text/html';
		const fileCharset = 'UTF-8';
		const fileFilename = 'file.html';
		const fileModtime = Date.now();

		const json2 = await API.createAttachmentItem('imported_url', [], key, this, 'jsonData');
		key = json2.key;
		json2.contentType = fileContentType;
		json2.charset = fileCharset;
		json2.filename = fileFilename;

		const response2 = await API.userPut(
			config.userID,
			`items/${key}`,
			JSON.stringify(json2),
			{
				'Content-Type': 'application/json',
			}
		);
		Helpers.assert204(response2);
		const originalVersion = response2.headers['last-modified-version'][0];

		// Get file info
		const response3 = await API.userGet(
			config.userID,
			`items/${json2.key}/file?auth=1&iskey=1&version=1&info=1`,
			{},
			auth
		);
		Helpers.assert404(response3);


		const { hash, zipSize, fileContent } = await generateZip(fileFilename, Helpers.getRandomUnicodeString(), `work/${key}.zip`);

		const filename = `${key}.zip`;

		// Get upload authorization
		const response4 = await API.userPost(
			config.userID,
			`items/${json2.key}/file?auth=1&iskey=1&version=1`,
			Helpers.implodeParams({
				md5: hash,
				filename: filename,
				filesize: zipSize,
				mtime: fileModtime,
				zip: 1,
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert200(response4);
		Helpers.assertContentType(response4, 'application/xml');
		const xml = API.getXMLFromResponse(response4);
		toDelete.push(`${hash}`);
		const xmlParams = xml.getElementsByTagName('params')[0];
		const urlComponent = xml.getElementsByTagName('url')[0];
		const keyComponent = xml.getElementsByTagName('key')[0];
		let url = urlComponent.innerHTML;
		const boundary = `---------------------------${Helpers.uniqueID()}`;
		let postData = '';
			
		for (let child of xmlParams.children) {
			const key = child.tagName;
			const val = child.innerHTML;
			postData += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
		}
		postData += `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\n${fileContent}\r\n`;
		postData += `--${boundary}--`;

		// Upload to S3
		const response5 = await HTTP.post(`${url}`, postData, {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
		});
		Helpers.assert201(response5);

		// Register upload
		const response6 = await API.userPost(
			config.userID,
			`items/${json2.key}/file?auth=1&iskey=1&version=1`,
			`update=${keyComponent.innerHTML}&mtime=${fileModtime}`,
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert204(response6);

		// Verify attachment item metadata
		const response7 = await API.userGet(config.userID, `items/${json2.key}`);
		const json3 = API.getJSONFromResponse(response7).data;
		// Make sure attachment item version hasn't changed (or else the client
		// will get a conflict when it tries to update the metadata)
		Helpers.assertEquals(originalVersion, json3.version);
		Helpers.assertEquals(hash, json3.md5);
		Helpers.assertEquals(fileFilename, json3.filename);
		Helpers.assertEquals(fileModtime, json3.mtime);

		const response8 = await API.userGet(
			config.userID,
			'laststoragesync?auth=1',
			{},
			{
				username: config.username,
				password: config.password,
			}
		);
		Helpers.assert200(response8);
		const mtime = response8.data;
		Helpers.assertRegExp(/^[0-9]{10}$/, mtime);

		// File exists
		const response9 = await API.userPost(
			config.userID,
			`items/${json2.key}/file?auth=1&iskey=1&version=1`,
			Helpers.implodeParams({
				md5: hash,
				filename,
				filesize: zipSize,
				mtime: fileModtime + 1000,
				zip: 1,
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert200(response9);
		Helpers.assertContentType(response9, 'application/xml');
		Helpers.assertEquals('<exists/>', response9.data);

		// Make sure attachment version still hasn't changed
		const response10 = await API.userGet(config.userID, `items/${json2.key}`);
		const json4 = API.getJSONFromResponse(response10).data;
		Helpers.assertEquals(originalVersion, json4.version);
	});

	it('test_should_not_allow_anonymous_access_to_file_in_public_closed_group_with_library_reading_for_all', async function () {
		let file = "work/file";
		let fileContents = Helpers.getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = Helpers.md5File(file);
		let filename = `test_${fileContents}`;
		let mtime = parseInt(fs.statSync(file).mtimeMs);
		let size = fs.statSync(file).size;

		let groupID = await API.createGroup({
			owner: config.userID,
			type: "PublicClosed",
			name: Helpers.uniqueID(14),
			libraryReading: "all",
			fileEditing: "members",
		});

		let parentKey = await API.groupCreateItem(groupID, "book", false, this, "key");
		let attachmentKey = await API.groupCreateAttachmentItem(
			groupID,
			"imported_file",
			{
				contentType: "text/plain",
				charset: "utf-8",
			},
			parentKey,
			this,
			"key"
		);

		// Get authorization
		let response = await API.groupPost(
			groupID,
			`items/${attachmentKey}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime,
				filename,
				filesize: size,
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*",
			},

		);
		Helpers.assert200(response);
		let json = API.getJSONFromResponse(response);

		toDelete.push(hash);

		//
		// Upload to S3
		//
		response = await HTTP.post(json.url, `${json.prefix}${fileContents}${json.suffix}`, {

			"Content-Type": `${json.contentType}`,
		},
		);
		Helpers.assert201(response);

		// Successful registration
		response = await API.groupPost(
			groupID,
			`items/${attachmentKey}/file`,
			`upload=${json.uploadKey}`,
			{

				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*",
			},

		);
		Helpers.assert204(response);

		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file`);
		Helpers.assert302(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view`);
		Helpers.assert302(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view/url`);
		Helpers.assert200(response);

		API.useAPIKey("");
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file`);
		Helpers.assert404(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view`);
		Helpers.assert404(response);
		response = await API.get(`groups/${groupID}/items/${attachmentKey}/file/view/url`);
		Helpers.assert404(response);

		await API.deleteGroup(groupID);
	});

	//TODO: this fails
	it('test_should_include_best_attachment_link_on_parent_for_imported_url', async function () {
		let json = await API.createItem("book", false, this, 'json');
		assert.equal(0, json.meta.numChildren);
		let parentKey = json.key;

		json = await API.createAttachmentItem("imported_url", [], parentKey, this, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = "test.html";
		let mtime = Date.now();
		//let size = fs.statSync("data/test.html.zip").size;
		let md5 = "af625b88d74e98e33b78f6cc0ad93ed0";
		//let zipMD5 = "f56e3080d7abf39019a9445d7aab6b24";

		let fileContents = fs.readFileSync("data/test.html.zip");
		let zipMD5 = Helpers.md5File("data/test.html.zip");
		let zipFilename = attachmentKey + ".zip";
		let size = Buffer.from(fileContents.toString()).byteLength;

		// Create attachment item
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([
				{
					key: attachmentKey,
					contentType: "text/html"
				}
			]),
			{

				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}

		);
		Helpers.assert200ForObject(response);

		// 'attachment' link shouldn't appear if no uploaded file
		response = await API.userGet(
			config.userID,
			"items/" + parentKey
		);
		json = API.getJSONFromResponse(response);
		assert.notProperty(json.links, 'attachment');

		// Get upload authorization
		response = await API.userPost(
			config.userID,
			"items/" + attachmentKey + "/file",
			Helpers.implodeParams({
				md5: md5,
				mtime: mtime,
				filename: filename,
				filesize: size,
				zipMD5: zipMD5,
				zipFilename: zipFilename
			}),
			{

				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": '*'
			}

		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);

		// If file doesn't exist on S3, upload
		if (!json.exists) {
			response = await HTTP.post(
				json.url,
				json.prefix + fileContents + json.suffix,
				{ "Content-Type": json.contentType }
			);
			Helpers.assert201(response);

			// Post-upload file registration
			response = await API.userPost(
				config.userID,
				"items/" + attachmentKey + "/file",
				"upload=" + json.uploadKey,
				{

					"Content-Type": "application/x-www-form-urlencoded",
					"If-None-Match": "*"
				}

			);
			Helpers.assert204(response);
		}
		toDelete.push(zipMD5);

		// 'attachment' link should now appear
		response = await API.userGet(
			config.userID,
			"items/" + parentKey
		);
		json = API.getJSONFromResponse(response);
		assert.property(json.links, 'attachment');
		assert.property(json.links.attachment, 'href');
		assert.equal('application/json', json.links.attachment.type);
		assert.equal('text/html', json.links.attachment.attachmentType);
		assert.notProperty(json.links.attachment, 'attachmentSize');
	});

	it('testClientV5ShouldRejectFileSizeMismatch', async function () {
		await API.userClear(config.userID);

		const file = 'work/file';
		const fileContents = Helpers.getRandomUnicodeString();
		const contentType = 'text/plain';
		const charset = 'utf-8';
		fs.writeFileSync(file, fileContents);
		const hash = Helpers.md5File(file);
		const filename = `test_${fileContents}`;
		const mtime = fs.statSync(file).mtimeMs;
		let size = 0;

		const json = await API.createAttachmentItem('imported_file', {
			contentType,
			charset
		}, false, this, 'jsonData');
		const key = json.key;

		// Get authorization
		const response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime,
				filename,
				filesize: size
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
				'If-None-Match': '*'
			}
		);
		Helpers.assert200(response);
		const jsonObj = API.getJSONFromResponse(response);

		// Try to upload to S3, which should fail
		const s3Response = await HTTP.post(
			jsonObj.url,
			jsonObj.prefix + fileContents + jsonObj.suffix,
			{
				'Content-Type': jsonObj.contentType
			}
		);
		Helpers.assert400(s3Response);
		assert.include(
			s3Response.data,
			'Your proposed upload exceeds the maximum allowed size'
		);
	});

	it('test_updating_attachment_hash_should_clear_associated_storage_file', async function () {
		let file = "work/file";
		let fileContents = Helpers.getRandomUnicodeString();
		let contentType = "text/html";
		let charset = "utf-8";

		fs.writeFileSync(file, fileContents);

		let hash = Helpers.md5File(file);
		let filename = "test_" + fileContents;
		let mtime = parseInt(fs.statSync(file).mtime * 1000);
		let size = parseInt(fs.statSync(file).size);
		

		let json = await API.createAttachmentItem("imported_file", {
			contentType: contentType,
			charset: charset
		}, false, this, 'jsonData');
		let itemKey = json.key;

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			"items/" + itemKey + "/file",
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);

		json = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			{
				"Content-Type": json.contentType
			}
		);
		Helpers.assert201(response);

		// Register upload
		response = await API.userPost(
			config.userID,
			"items/" + itemKey + "/file",
			"upload=" + json.uploadKey,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);
		let newVersion = response.headers['last-modified-version'][0];

		filename = "test.pdf";
		mtime = Date.now();
		hash = Helpers.md5(Helpers.uniqueID());

		response = await API.userPatch(
			config.userID,
			"items/" + itemKey,
			JSON.stringify({
				filename: filename,
				mtime: mtime,
				md5: hash,
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": newVersion
			}
		);
		Helpers.assert204(response);

		response = await API.userGet(
			config.userID,
			"items/" + itemKey + "/file"
		);
		Helpers.assert404(response);
	});

	it('test_add_embedded_image_attachment', async function () {
		await API.userClear(config.userID);

		const noteKey = await API.createNoteItem("", null, this, 'key');

		const file = "work/file";
		const fileContents = Helpers.getRandomUnicodeString();
		const contentType = "image/png";
		fs.writeFileSync(file, fileContents);
		const hash = Helpers.md5(fileContents);
		const filename = "image.png";
		const mtime = fs.statSync(file).mtime * 1000;
		const size = fs.statSync(file).size;

		let json = await API.createAttachmentItem("embedded_image", {
			parentItem: noteKey,
			contentType: contentType
		}, false, this, 'jsonData');

		const key = json.key;
		const originalVersion = json.version;

		// Get authorization
		let response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{

				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}

		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			`${json.prefix}${fileContents}${json.suffix}`,
			{

				"Content-Type": `${json.contentType}`
			}

		);
		Helpers.assert201(response);

		// Register upload
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${json.uploadKey}`,
			{

				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"

			}
		);
		Helpers.assert204(response);
		const newVersion = response.headers['last-modified-version'];
		assert.isAbove(parseInt(newVersion), parseInt(originalVersion));

		// Verify attachment item metadata
		response = await API.userGet(
			config.userID,
			`items/${key}`
		);
		json = API.getJSONFromResponse(response).data;
		assert.equal(hash, json.md5);
		assert.equal(mtime, json.mtime);
		assert.equal(filename, json.filename);
		assert.equal(contentType, json.contentType);
		assert.notProperty(json, 'charset');
	});

	it('testAddFileClientV5Zip', async function () {
		await API.userClear(config.userID);

		const fileContents = Helpers.getRandomUnicodeString();
		const contentType = "text/html";
		const charset = "utf-8";
		const filename = "file.html";
		const mtime = Date.now() / 1000 | 0;
		const hash = Helpers.md5(fileContents);

		// Get last storage sync
		let response = await API.userGet(config.userID, "laststoragesync");
		Helpers.assert404(response);

		let json = await API.createItem("book", false, this, 'jsonData');
		let key = json.key;

		json = await API.createAttachmentItem("imported_url", {
			contentType,
			charset
		}, key, this, 'jsonData');
		key = json.key;

		const zipData = await generateZip(filename, Helpers.getRandomUnicodeString(), `work/${key}.zip`);

		const zipFilename = `${key}.zip`;


		//
		// Get upload authorization
		//
		response = await API.userPost(config.userID, `items/${key}/file`, Helpers.implodeParams({
			md5: hash,
			mtime: mtime,
			filename: filename,
			filesize: zipData.zipSize,
			zipMD5: zipData.hash,
			zipFilename: zipFilename
		}), {

			"Content-Type": "application/x-www-form-urlencoded",
			"If-None-Match": "*"
		}
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);

		toDelete.push(zipData.hash);

		// Upload to S3
		response = await HTTP.post(json.url, json.prefix + zipData.fileContent + json.suffix, {

			"Content-Type": json.contentType

		});
		Helpers.assert201(response);

		//
		// Register upload
		//

		// If-Match with file hash shouldn't match unregistered file
		response = await API.userPost(config.userID, `items/${key}/file`, `upload=${json.uploadKey}`, {

			"Content-Type": "application/x-www-form-urlencoded",
			"If-Match": hash

		});
		Helpers.assert412(response);

		// If-Match with ZIP hash shouldn't match unregistered file
		response = await API.userPost(config.userID, `items/${key}/file`, `upload=${json.uploadKey}`, {

			"Content-Type": "application/x-www-form-urlencoded",
			"If-Match": zipData.hash
		}
		);
		Helpers.assert412(response);

		response = await API.userPost(config.userID, `items/${key}/file`, `upload=${json.uploadKey}`, {

			"Content-Type": "application/x-www-form-urlencoded",
			"If-None-Match": "*"
		}
		);
		Helpers.assert204(response);
		const newVersion = response.headers["last-modified-version"];

		// Verify attachment item metadata
		response = await API.userGet(config.userID, `items/${key}`);
		json = API.getJSONFromResponse(response).data;
		assert.equal(hash, json.md5);
		assert.equal(mtime, json.mtime);
		assert.equal(filename, json.filename);
		assert.equal(contentType, json.contentType);
		assert.equal(charset, json.charset);

		response = await API.userGet(config.userID, "laststoragesync");
		Helpers.assert200(response);
		Helpers.assertRegExp(/^[0-9]{10}$/, response.data);

		// File exists
		response = await API.userPost(config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename,
				filesize: zipData.zipSize,
				zip: 1,
				zipMD5: zipData.hash,
				zipFilename: zipFilename
			}), {

				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": hash
			}
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);
		assert.property(json, "exists");
		const version = response.headers["last-modified-version"];
		assert.isAbove(parseInt(version), parseInt(newVersion));
	});

	it('test_updating_compressed_attachment_hash_should_clear_associated_storage_file', async function () {
		// Create initial file
		let fileContents = Helpers.getRandomUnicodeString();
		let contentType = "text/html";
		let charset = "utf-8";
		let filename = "file.html";
		let mtime = Math.floor(Date.now() / 1000);
		let hash = Helpers.md5(fileContents);

		let json = await API.createAttachmentItem("imported_file", {
			contentType: contentType,
			charset: charset
		}, false, this, 'jsonData');
		let itemKey = json.key;

		let file = "work/" + itemKey + ".zip";
		let zipFilename = "work/" + itemKey + ".zip";

		// Create initial ZIP file
		const zipData = await generateZip(file, fileContents, zipFilename);
		let zipHash = zipData.hash;
		let zipSize = zipData.zipSize;
		let zipFileContents = zipData.fileContent;

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			"items/" + itemKey + "/file",
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: zipSize,
				zipMD5: zipHash,
				zipFilename: zipFilename
			}),
			{

				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}

		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);

		toDelete.push(zipHash);

		// Upload to S3
		response = await HTTP.post(
			json.url,
			json.prefix + zipFileContents + json.suffix,
			{

				"Content-Type": json.contentType
			}

		);
		Helpers.assert201(response);

		// Register upload
		response = await API.userPost(
			config.userID,
			"items/" + itemKey + "/file",
			"upload=" + json.uploadKey,
			{

				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}

		);
		Helpers.assert204(response);
		let newVersion = response.headers['last-modified-version'];

		// Set new attachment file info
		hash = Helpers.md5(Helpers.uniqueID());
		mtime = Date.now();
		zipHash = Helpers.md5(Helpers.uniqueID());
		zipSize += 1;
		response = await API.userPatch(
			config.userID,
			"items/" + itemKey,
			JSON.stringify({
				md5: hash,
				mtime: mtime,
				filename: filename
			}),
			{

				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": newVersion
			}

		);
		Helpers.assert204(response);

		response = await API.userGet(
			config.userID,
			"items/" + itemKey + "/file"
		);
		Helpers.assert404(response);
	});

	it('test_replace_file_with_new_file', async function () {
		await API.userClear(config.userID);

		const file = "work/file";
		const fileContents = Helpers.getRandomUnicodeString();
		const contentType = "text/html";
		const charset = "utf-8";
		fs.writeFileSync(file, fileContents);
		const hash = Helpers.md5File(file);
		const filename = "test_" + fileContents;
		const mtime = fs.statSync(file).mtime * 1000;
		const size = fs.statSync(file).size;

		const json = await API.createAttachmentItem("imported_file", {
			contentType: contentType,
			charset: charset
		}, false, this, 'jsonData');
		const key = json.key;

		// Get authorization
		const response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		const data = JSON.parse(response.data);

		toDelete.push(hash);

		const s3FilePath
			= data.prefix + fileContents + data.suffix;
		// Upload to S3
		const s3response = await HTTP.post(
			data.url,
			s3FilePath,
			{
				"Content-Type": data.contentType
			}
		);
		Helpers.assert201(s3response);

		// Successful registration
		const success = await API.userPost(
			config.userID,
			`items/${key}/file`,
			"upload=" + data.uploadKey,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(success);

		// Verify attachment item metadata
		const metaDataResponse = await API.userGet(
			config.userID,
			`items/${key}`
		);
		const metaDataJson = API.getJSONFromResponse(metaDataResponse);
		Helpers.assertEquals(hash, metaDataJson.data.md5);
		Helpers.assertEquals(mtime, metaDataJson.data.mtime);
		Helpers.assertEquals(filename, metaDataJson.data.filename);
		Helpers.assertEquals(contentType, metaDataJson.data.contentType);
		Helpers.assertEquals(charset, metaDataJson.data.charset);
		
		const newFileContents
			= Helpers.getRandomUnicodeString() + Helpers.getRandomUnicodeString();
		fs.writeFileSync(file, newFileContents);
		const newHash = Helpers.md5File(file);
		const newFilename = "test_" + newFileContents;
		const newMtime = fs.statSync(file).mtime * 1000;
		const newSize = fs.statSync(file).size;

		// Update file
		const updateResponse
			= await API.userPost(
				config.userID,
				`items/${key}/file`,
				Helpers.implodeParams({
					md5: newHash,
					mtime: newMtime,
					filename: newFilename,
					filesize: newSize
				}),
				{
					"Content-Type": "application/x-www-form-urlencoded",
					"If-Match": hash
				}
			);
		Helpers.assert200(updateResponse);
		const updateData = JSON.parse(updateResponse.data);

		toDelete.push(newHash);
		// Upload to S3
		const updateS3response = await HTTP.post(
			updateData.url,
			`${updateData.prefix}${newFileContents}${updateData.suffix}`,
			{
				"Content-Type": updateData.contentType
			}
		);
		Helpers.assert201(updateS3response);

		// Successful registration
		const succeeded = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${updateData.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": hash
			}
		);
		Helpers.assert204(succeeded);

		// Verify new attachment item metadata
		const updatedMetaDataResponse = await API.userGet(
			config.userID,
			`items/${key}`
		);
		const updatedMetaDataJson = API.getJSONFromResponse(updatedMetaDataResponse);
		Helpers.assertEquals(newHash, updatedMetaDataJson.data.md5);
		Helpers.assertEquals(newMtime, updatedMetaDataJson.data.mtime);
		Helpers.assertEquals(newFilename, updatedMetaDataJson.data.filename);
		Helpers.assertEquals(
			contentType,
			updatedMetaDataJson.data.contentType
		);
		Helpers.assertEquals(charset, updatedMetaDataJson.data.charset);
	});

	it('testClientV5ShouldReturn404GettingAuthorizationForMissingFile', async function () {
		let params = {
			md5: Helpers.md5('qzpqBjLddCc6UhfX'),
			mtime: 1477002989206,
			filename: 'test.pdf',
			filesize: 12345,
		};
		let headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'If-None-Match': '*',
		};
		let response = await API.userPost(
			config.userID,
			'items/UP24VFQR/file',
			Helpers.implodeParams(params),
			headers
		);
		Helpers.assert404(response);
	});

	// TODO: Reject for keys not owned by user, even if public library
	it('testLastStorageSyncNoAuthorization', async function () {
		API.useAPIKey(false);
		let response = await API.userGet(
			config.userID,
			"laststoragesync",
			{ "Content-Type": "application/json" }
		);
		Helpers.assert401(response);
	});

	it('testAddFileClientV5', async function () {
		await API.userClear(config.userID);

		const file = "work/file";
		const fileContents = Helpers.getRandomUnicodeString();
		const contentType = "text/html";
		const charset = "utf-8";
		fs.writeFileSync(file, fileContents);
		const hash = crypto.createHash('md5').update(fileContents).digest("hex");
		const filename = "test_" + fileContents;
		const mtime = fs.statSync(file).mtime * 1000;
		const size = fs.statSync(file).size;

		// Get last storage sync
		let response = await API.userGet(
			config.userID,
			"laststoragesync"
		);
		Helpers.assert404(response);

		const json = await API.createAttachmentItem("imported_file", {
			contentType: contentType,
			charset: charset
		}, false, this, 'jsonData');
		const key = json.key;
		const originalVersion = json.version;

		// File shouldn't exist
		response = await API.userGet(
			config.userID,
			`items/${key}/file`
		);
		Helpers.assert404(response);

		//
		// Get upload authorization
		//

		// Require If-Match/If-None-Match
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded"
			}
		);
		Helpers.assert428(response, "If-Match/If-None-Match header not provided");

		// Get authorization
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		const uploadJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		//
		// Upload to S3
		//
		let s3Headers = {
			"Content-Type": uploadJSON.contentType
		};
		response = await HTTP.post(
			uploadJSON.url,
			uploadJSON.prefix + fileContents + uploadJSON.suffix,
			s3Headers
		);
		Helpers.assert201(response);

		//
		// Register upload
		//

		// Require If-Match/If-None-Match
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${uploadJSON.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded"
			}
		);
		Helpers.assert428(response, "If-Match/If-None-Match header not provided");

		// Invalid upload key
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			"upload=invalidUploadKey",
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert400(response);

		// If-Match shouldn't match unregistered file
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${uploadJSON.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": hash
			}
		);
		Helpers.assert412(response);
		assert.notOk(response.headers['last-modified-version']);

		// Successful registration
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${uploadJSON.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);
		const newVersion = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(newVersion), parseInt(originalVersion));

		// Verify attachment item metadata
		response = await API.userGet(
			config.userID,
			`items/${key}`
		);
		const jsonResp = API.getJSONFromResponse(response).data;
		assert.equal(hash, jsonResp.md5);
		assert.equal(mtime, jsonResp.mtime);
		assert.equal(filename, jsonResp.filename);
		assert.equal(contentType, jsonResp.contentType);
		assert.equal(charset, jsonResp.charset);

		response = await API.userGet(
			config.userID,
			"laststoragesync"
		);
		Helpers.assert200(response);
		Helpers.assertRegExp(/^[0-9]{10}$/, response.data);

		//
		// Update file
		//

		// Conflict for If-None-Match when file exists
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert412(response, "If-None-Match: * set but file exists");
		assert.notEqual(response.headers['last-modified-version'][0], null);

		// Conflict for If-Match when existing file differs
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": Helpers.md5("invalid")
			}
		);
		Helpers.assert412(response, "ETag does not match current version of file");
		assert.notEqual(response.headers['last-modified-version'][0], null);

		// Error if wrong file size given for existing file
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename,
				filesize: size - 1
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": hash
			}
		);
		Helpers.assert400(response, "Specified file size incorrect for known file");

		// File exists
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": hash
			}
		);
		Helpers.assert200(response);
		let existsJSON = API.getJSONFromResponse(response);
		assert.property(existsJSON, "exists");
		let version = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(version), parseInt(newVersion));

		// File exists with different filename
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime + 1000,
				filename: filename + '等',
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": hash
			}
		);
		Helpers.assert200(response);
		existsJSON = API.getJSONFromResponse(response);
		assert.property(existsJSON, "exists");
		version = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(version), parseInt(newVersion));
	});

	it('test_should_include_best_attachment_link_on_parent_for_imported_file', async function () {
		let json = await API.createItem("book", false, this, 'json');
		assert.equal(0, json.meta.numChildren);
		let parentKey = json.key;

		json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = "test.pdf";
		let mtime = Date.now();
		let md5 = "e54589353710950c4b7ff70829a60036";
		let size = fs.statSync("data/test.pdf").size;
		let fileContents = fs.readFileSync("data/test.pdf");

		// Create attachment item
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([
				{
					key: attachmentKey,
					contentType: "application/pdf",
				}
			]),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);
		Helpers.assert200ForObject(response);

		// 'attachment' link shouldn't appear if no uploaded file
		response = await API.userGet(
			config.userID,
			"items/" + parentKey
		);
		json = API.getJSONFromResponse(response);
		assert.notProperty(json.links, 'attachment');

		// Get upload authorization
		response = await API.userPost(
			config.userID,
			"items/" + attachmentKey + "/file",
			Helpers.implodeParams({
				md5: md5,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);

		// If file doesn't exist on S3, upload
		if (!json.exists) {
			response = await HTTP.post(
				json.url,
				json.prefix + fileContents + json.suffix,
				{
					"Content-Type": json.contentType
				}
			);
			Helpers.assert201(response);

			// Post-upload file registration
			response = await API.userPost(
				config.userID,
				"items/" + attachmentKey + "/file",
				"upload=" + json.uploadKey,
				{
					"Content-Type": "application/x-www-form-urlencoded",
					"If-None-Match": "*"
				}
			);
			Helpers.assert204(response);
		}
		toDelete.push(md5);

		// 'attachment' link should now appear
		response = await API.userGet(
			config.userID,
			"items/" + parentKey
		);
		json = API.getJSONFromResponse(response);
		assert.property(json.links, 'attachment');
		assert.property(json.links.attachment, 'href');
		assert.equal('application/json', json.links.attachment.type);
		assert.equal('application/pdf', json.links.attachment.attachmentType);
		assert.equal(size, json.links.attachment.attachmentSize);
	});

	it('testAddFileClientV4', async function () {
		await API.userClear(config.userID);

		const fileContentType = 'text/html';
		const fileCharset = 'utf-8';

		const auth = {
			username: config.username,
			password: config.password,
		};

		// Get last storage sync
		let response = await API.userGet(
			config.userID,
			'laststoragesync?auth=1',
			{},
			auth
		);
		Helpers.assert404(response);

		const json = await API.createAttachmentItem(
			'imported_file',
			[],
			false,
			this,
			'jsonData'
		);
		let originalVersion = json.version;
		json.contentType = fileContentType;
		json.charset = fileCharset;

		response = await API.userPut(
			config.userID,
			`items/${json.key}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert204(response);
		originalVersion = response.headers['last-modified-version'][0];

		// Get file info
		response = await API.userGet(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1&info=1`,
			{},
			auth
		);
		Helpers.assert404(response);

		const file = 'work/file';
		const fileContents = Helpers.getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		const hash = crypto.createHash('md5').update(fileContents).digest('hex');
		const filename = `test_${fileContents}`;
		const mtime = parseInt(fs.statSync(file).mtimeMs);
		const size = parseInt(fs.statSync(file).size);

		// Get upload authorization
		response = await API.userPost(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1`,
			Helpers.implodeParams({
				md5: hash,
				filename,
				filesize: size,
				mtime,
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, 'application/xml');
		const xml = API.getXMLFromResponse(response);
		const xmlParams = xml.getElementsByTagName('params')[0];
		const urlComponent = xml.getElementsByTagName('url')[0];
		const keyComponent = xml.getElementsByTagName('key')[0];
		toDelete.push(hash);

		const boundary = `---------------------------${Helpers.uniqueID()}`;
		let postData = '';
		for (let child of xmlParams.children) {
			const key = child.tagName;
			const val = child.innerHTML;
			postData += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
		}
		postData += `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\n${fileContents}\r\n`;
		postData += `--${boundary}--`;

		// Upload to S3
		response = await HTTP.post(urlComponent.innerHTML, postData, {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
		});
		Helpers.assert201(response);

		//
		// Register upload
		//

		// Invalid upload key
		response = await API.userPost(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1`,
			`update=invalidUploadKey&mtime=${mtime}`,
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert400(response);

		// No mtime
		response = await API.userPost(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1`,
			`update=${xml.key}`,
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert500(response);

		response = await API.userPost(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1`,
			`update=${keyComponent.innerHTML}&mtime=${mtime}`,
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert204(response);

		// Verify attachment item metadata
		response = await API.userGet(config.userID, `items/${json.key}`);
		const { data } = API.getJSONFromResponse(response);
		// Make sure attachment item version hasn't changed (or else the client
		// will get a conflict when it tries to update the metadata)
		assert.equal(originalVersion, data.version);
		assert.equal(hash, data.md5);
		assert.equal(filename, data.filename);
		assert.equal(mtime, data.mtime);

		response = await API.userGet(
			config.userID,
			'laststoragesync?auth=1',
			{},
			{
				username: config.username,
				password: config.password,
			}
		);
		Helpers.assert200(response);
		const newMtime = response.data;
		assert.match(newMtime, /^[0-9]{10}$/);

		// File exists
		response = await API.userPost(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1`,
			Helpers.implodeParams({
				md5: hash,
				filename,
				filesize: size,
				mtime: newMtime + 1000,
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, 'application/xml');
		assert.equal('<exists/>', response.data);

		// File exists with different filename
		response = await API.userPost(
			config.userID,
			`items/${json.key}/file?auth=1&iskey=1&version=1`,
			Helpers.implodeParams({
				md5: hash,
				filename: `${filename}等`, // Unicode 1.1 character, to test signature generation
				filesize: size,
				mtime: newMtime + 1000,
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			auth
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, 'application/xml');
		assert.equal('<exists/>', response.data);

		// Make sure attachment version still hasn't changed
		response = await API.userGet(config.userID, `items/${json.key}`);
		const { version } = API.getJSONFromResponse(response).data;
		assert.equal(originalVersion, version);
	});
});
