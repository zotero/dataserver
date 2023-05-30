const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");
const { S3Client, DeleteObjectsCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const HTTP = require('../../httpHandler.js');
const crypto = require('crypto');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

describe('FileTestTests', function () {
	this.timeout(config.timeout);
	let toDelete = [];
	const s3Client = new S3Client({ region: "us-east-1" });

	before(async function () {
		await API2Setup();
		try {
			fs.mkdirSync("./work");
		}
		catch {}
	});

	after(async function () {
		await API2WrapUp();
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

	const md5 = (str) => {
		return crypto.createHash('md5').update(str).digest('hex');
	};

	const md5File = (fileName) => {
		const data = fs.readFileSync(fileName);
		return crypto.createHash('md5').update(data).digest('hex');
	};

	const testNewEmptyImportedFileAttachmentItem = async () => {
		let xml = await API.createAttachmentItem("imported_file", [], false, this);
		let data = await API.parseDataFromAtomEntry(xml);
		return data;
	};

	const testGetFile = async () => {
		const addFileData = await testAddFileExisting();
		const userGetViewModeResponse = await API.userGet(config.userID, `items/${addFileData.key}/file/view?key=${config.apiKey}`);
		Helpers.assert302(userGetViewModeResponse);
		const location = userGetViewModeResponse.headers.location[0];
		Helpers.assertRegExp(/^https?:\/\/[^/]+\/[a-zA-Z0-9%]+\/[a-f0-9]{64}\/test_/, location);
		const filenameEncoded = encodeURIComponent(addFileData.filename);
		assert.equal(filenameEncoded, location.substring(location.length - filenameEncoded.length));
		const viewModeResponse = await HTTP.get(location);
		Helpers.assert200(viewModeResponse);
		assert.equal(addFileData.md5, md5(viewModeResponse.data));
		const userGetDownloadModeResponse = await API.userGet(config.userID, `items/${addFileData.key}/file?key=${config.apiKey}`);
		Helpers.assert302(userGetDownloadModeResponse);
		const downloadModeLocation = userGetDownloadModeResponse.headers.location[0];
		const s3Response = await HTTP.get(downloadModeLocation);
		Helpers.assert200(s3Response);
		assert.equal(addFileData.md5, md5(s3Response.data));
		return {
			key: addFileData.key,
			response: s3Response
		};
	};

	it('testAddFileLinkedAttachment', async function () {
		let xml = await API.createAttachmentItem("linked_file", [], false, this);
		let data = await API.parseDataFromAtomEntry(xml);

		let file = "./work/file";
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = md5File(file);
		let filename = "test_" + fileContents;
		let mtime = fs.statSync(file).mtimeMs;
		let size = fs.statSync(file).size;
		let contentType = "text/plain";
		let charset = "utf-8";

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams({
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

	// Errors
	it('testAddFileFullParams', async function () {
		let xml = await API.createAttachmentItem("imported_file", [], false, this);

		let data = await API.parseDataFromAtomEntry(xml);
		let serverDateModified = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		await new Promise(r => setTimeout(r, 2000));
		let originalVersion = data.version;
		let file = "./work/file";
		let fileContents = getRandomUnicodeString();
		await fs.promises.writeFile(file, fileContents);
		let hash = md5File(file);
		let filename = "test_" + fileContents;
		let mtime = parseInt((await fs.promises.stat(file)).mtimeMs);
		let size = parseInt((await fs.promises.stat(file)).size);
		let contentType = "text/plain";
		let charset = "utf-8";

		let response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams({
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
		let json = JSON.parse(response.data);
		assert.ok(json);
		toDelete.push(hash);

		let boundary = "---------------------------" + md5(Helpers.uniqueID());
		let prefix = "";
		for (let key in json.params) {
			prefix += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + key + "\"\r\n\r\n" + json.params[key] + "\r\n";
		}
		prefix += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\n";
		let suffix = "\r\n--" + boundary + "--";
		response = await HTTP.post(
			json.url,
			prefix + fileContents + suffix,
			{
				"Content-Type": "multipart/form-data; boundary=" + boundary
			}
		);
		Helpers.assert201(response);
		
		response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			"upload=" + json.uploadKey,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);
		response = await API.userGet(
			config.userID,
			`items/${data.key}?key=${config.apiKey}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		data = await API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(hash, json.md5);
		assert.equal(filename, json.filename);
		assert.equal(mtime, json.mtime);
		assert.equal(contentType, json.contentType);
		assert.equal(charset, json.charset);
		const updated = Helpers.xpathEval(xml, '/atom:entry/atom:updated');
		assert.notEqual(serverDateModified, updated);
		assert.notEqual(originalVersion, data.version);
	});

	const getRandomUnicodeString = function () {
		return "Âéìøü 这是一个测试。 " + Helpers.uniqueID();
	};

	it('testExistingFileWithOldStyleFilename', async function () {
		let fileContents = getRandomUnicodeString();
		let hash = md5(fileContents);
		let filename = 'test.txt';
		let size = fileContents.length;

		let parentKey = await API.createItem("book", false, this, 'key');
		let xml = await API.createAttachmentItem("imported_file", [], parentKey, this);
		let data = await API.parseDataFromAtomEntry(xml);
		let key = data.key;
		let mtime = Date.now();
		let contentType = 'text/plain';
		let charset = 'utf-8';

		let response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams({
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
		let json = JSON.parse(response.data);
		assert.isOk(json);

		toDelete.push(`${hash}/${filename}`);
		toDelete.push(hash);
		const putCommand = new PutObjectCommand({
			Bucket: config.s3Bucket,
			Key: `${hash}/${filename}`,
			Body: fileContents
		});
		await s3Client.send(putCommand);
		response = await API.userPost(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`,
			`upload=${json.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);

		response = await API.userGet(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`
		);
		Helpers.assert302(response);
		let location = response.headers.location[0];
		let matches = location.match(/^https:\/\/(?:[^/]+|.+config.s3Bucket)\/([a-f0-9]{32})\/test.txt\?/);
		Helpers.assertEquals(2, matches.length);
		Helpers.assertEquals(hash, matches[1]);

		parentKey = await API.createItem("book", false, this, 'key');
		xml = await API.createAttachmentItem("imported_file", [], parentKey, this);
		data = await API.parseDataFromAtomEntry(xml);
		key = data.key;
		response = await API.userPost(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`,
			implodeParams({
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

		response = await API.userGet(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`
		);
		Helpers.assert302(response);
		location = response.headers.location[0];
		matches = location.match(/^https:\/\/(?:[^/]+|.+config.s3Bucket)\/([a-f0-9]{32})\/test.txt\?/);
		Helpers.assertEquals(2, matches.length);
		Helpers.assertEquals(hash, matches[1]);

		response = await HTTP.get(location);
		Helpers.assert200(response);
		Helpers.assertEquals(fileContents, response.data);
		Helpers.assertEquals(`${contentType}; charset=${charset}`, response.headers['content-type'][0]);

		parentKey = await API.createItem("book", false, this, 'key');
		xml = await API.createAttachmentItem("imported_file", [], parentKey, this);
		data = await API.parseDataFromAtomEntry(xml);
		key = data.key;
		contentType = 'application/x-custom';
		response = await API.userPost(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`,
			implodeParams({
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

		response = await API.userGet(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`
		);
		Helpers.assert302(response);
		location = response.headers.location[0];
		matches = location.match(/^https:\/\/(?:[^/]+|.+config.s3Bucket)\/([a-f0-9]{32})\?/);
		Helpers.assertEquals(2, matches.length);
		Helpers.assertEquals(hash, matches[1]);

		response = await HTTP.get(location);
		Helpers.assert200(response);
		Helpers.assertEquals(fileContents, response.data);
		Helpers.assertEquals(contentType, response.headers['content-type'][0]);
	});

	const testAddFileFull = async () => {
		let xml = await API.createItem("book", false, this);
		let data = await API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;
		xml = await API.createAttachmentItem("imported_file", [], parentKey, this);
		data = await API.parseDataFromAtomEntry(xml);
		let file = "./work/file";
		let fileContents = getRandomUnicodeString();
		fs.writeFileSync(file, fileContents);
		let hash = md5File(file);
		let filename = "test_" + fileContents;
		let mtime = fs.statSync(file).mtime * 1000;
		let size = fs.statSync(file).size;
		let contentType = "text/plain";
		let charset = "utf-8";

		let response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams({
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
		let json = JSON.parse(response.data);
		assert.isOk(json);
		toDelete.push(`${hash}`);

		response = await HTTP.post(
			json.url,
			json.prefix + fileContents + json.suffix,
			{
				"Content-Type": `${json.contentType}`
			}
		);
		Helpers.assert201(response);

		response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			`upload=${json.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
			}
		);
		Helpers.assert428(response);

		response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			`upload=invalidUploadKey`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert400(response);

		response = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			`upload=${json.uploadKey}`,
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "*"
			}
		);
		Helpers.assert204(response);

		response = await API.userGet(
			config.userID,
			`items/${data.key}?key=${config.apiKey}&content=json`
		);
		xml = await API.getXMLFromResponse(response);
		data = await API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		assert.equal(hash, json.md5);
		assert.equal(filename, json.filename);
		assert.equal(mtime, json.mtime);
		assert.equal(contentType, json.contentType);
		assert.equal(charset, json.charset);

		return {
			key: data.key,
			json: json,
			size: size
		};
	};

	it('testAddFileAuthorizationErrors', async function () {
		const data = await testNewEmptyImportedFileAttachmentItem();
		const fileContents = getRandomUnicodeString();
		const hash = md5(fileContents);
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
				`items/${data.key}/file?key=${config.apiKey}`,
				implodeParams(fileParams, [exclude]),
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
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams(fileParams2),
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
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams(fileParams),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-Match": md5("invalidETag")
			});
		Helpers.assert412(response3);

		// Missing If-None-Match
		const response4 = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams(fileParams),
			{
				"Content-Type": "application/x-www-form-urlencoded"
			});
		Helpers.assert428(response4);

		// Invalid If-None-Match
		const response5 = await API.userPost(
			config.userID,
			`items/${data.key}/file?key=${config.apiKey}`,
			implodeParams(fileParams),
			{
				"Content-Type": "application/x-www-form-urlencoded",
				"If-None-Match": "invalidETag"
			});
		Helpers.assert400(response5);
	});

	const implodeParams = (params, exclude = []) => {
		let parts = [];
		for (const [key, value] of Object.entries(params)) {
			if (!exclude.includes(key)) {
				parts.push(key + "=" + encodeURIComponent(value));
			}
		}
		return parts.join("&");
	};

	it('testAddFilePartial', async function () {
		const getFileData = await testGetFile();
		const response = await API.userGet(
			config.userID,
			`items/${getFileData.key}?key=${config.apiKey}&content=json`
		);
		const xml = await API.getXMLFromResponse(response);

		await new Promise(resolve => setTimeout(resolve, 1000));

		const data = API.parseDataFromAtomEntry(xml);
		const originalVersion = data.version;

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
			fs.writeFileSync(newFilename, getRandomUnicodeString() + Helpers.uniqueID());
			const newHash = md5File(newFilename);
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
				`items/${getFileData.key}/file?key=${config.apiKey}`,
				implodeParams(fileParams),
				{
					"Content-Type": "application/x-www-form-urlencoded",
					"If-Match": md5File(oldFilename),
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

			let response = await API.userPatch(
				config.userID,
				`items/${getFileData.key}/file?key=${config.apiKey}&algorithm=${algo}&upload=${json.uploadKey}`,
				patch,
				{
					"If-Match": md5File(oldFilename),
				}
			);
			Helpers.assert204(response);

			fs.unlinkSync(patchFilename);
			fs.renameSync(newFilename, oldFilename);
			response = await API.userGet(
				config.userID,
				`items/${getFileData.key}?key=${config.apiKey}&content=json`
			);
			const xml = API.getXMLFromResponse(response);
			const data = API.parseDataFromAtomEntry(xml);
			json = JSON.parse(data.content);
			Helpers.assertEquals(fileParams.md5, json.md5);
			Helpers.assertEquals(fileParams.mtime, json.mtime);
			Helpers.assertEquals(fileParams.contentType, json.contentType);
			Helpers.assertEquals(fileParams.charset, json.charset);
			assert.notEqual(originalVersion, data.version);

			const fileResponse = await API.userGet(
				config.userID,
				`items/${getFileData.key}/file?key=${config.apiKey}`
			);
			Helpers.assert302(fileResponse);
			const location = fileResponse.headers.location[0];

			const getFileResponse = await HTTP.get(location);
			Helpers.assert200(getFileResponse);
			Helpers.assertEquals(fileParams.md5, md5(getFileResponse.data));
			Helpers.assertEquals(
				`${fileParams.contentType}${fileParams.contentType && fileParams.charset ? `; charset=${fileParams.charset}` : ""
				}`,
				getFileResponse.headers["content-type"][0]
			);
		}
	});

	const testAddFileExisting = async () => {
		const addFileData = await testAddFileFull();
		const key = addFileData.key;
		const json = addFileData.json;
		const md5 = json.md5;
		const size = addFileData.size;

		// Get upload authorization
		let response = await API.userPost(
			config.userID,
			`items/${key}/file?key=${config.apiKey}`,
			implodeParams({
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
			`items/${key}/file?key=${config.apiKey}`,
			implodeParams({
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
});
