import chai from 'chai';
const assert = chai.assert;
import config from 'config';
import API from '../../api3.js';
import Helpers from '../../helpers3.js';
import shared from "../shared.js";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { SQSClient, PurgeQueueCommand } from "@aws-sdk/client-sqs";
import fs from 'fs';
import HTTP from '../../httpHandler.js';
import { localInvoke } from '../../full-text-extractor/src/local_invoke.mjs';


describe('PDFTextExtractionTests', function () {
	this.timeout(0);
	let toDelete = [];
	const s3Client = new S3Client({ region: "us-east-1" });
	const sqsClient = new SQSClient();

	before(async function () {
		this.skip();
		await shared.API3Before();
		// Clean up test queue.
		// Calling PurgeQueue many times in a row throws an error so sometimes we have to wait.
		try {
			await sqsClient.send(new PurgeQueueCommand({ QueueUrl: config.fullTextExtractorSQSUrl }));
		}
		catch (e) {
			await new Promise(r => setTimeout(r, 5000));
			await sqsClient.send(new PurgeQueueCommand({ QueueUrl: config.fullTextExtractorSQSUrl }));
		}
		
		try {
			fs.mkdirSync("./work");
		}
		catch {}
	});

	after(async function () {
		await shared.API3After();
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

	it('should_extract_pdf_text', async function () {
		let json = await API.createItem("book", false, this, 'json');
		assert.equal(0, json.meta.numChildren);
		let parentKey = json.key;

		json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = "dummy.pdf";
		let mtime = Date.now();
		const pdfText = makeRandomPDF();

		let fileContents = fs.readFileSync("./work/dummy.pdf");
		let size = Buffer.from(fileContents.toString()).byteLength;
		let md5 = Helpers.md5(fileContents.toString());

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

		// Upload
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
		
		toDelete.push(md5);

		// Local invoke full-text-extractor if it's a local test run
		if (config.isLocalRun) {
			await new Promise(r => setTimeout(r, 5000));
			const processedCount = await localInvoke();
			assert.equal(processedCount, 1);
		}
		else {
			// If it's a run on AWS, just wait for lambda to finish
			await new Promise(r => setTimeout(r, 10000));
		}

		// Get full text to ensure full-text-extractor worked
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
		);
		Helpers.assert200(response);
		const data = JSON.parse(response.data);
		assert.property(data, 'content');
		assert.equal(data.content.trim(), pdfText);
	});

	it('should_not_add_non_pdf_to_queue', async function () {
		let json = await API.createItem("book", false, this, 'json');
		assert.equal(0, json.meta.numChildren);
		let parentKey = json.key;

		json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = "dummy.txt";
		let mtime = Date.now();

		let fileContents = Helpers.getRandomUnicodeString();
		let size = Buffer.from(fileContents).byteLength;
		let md5 = Helpers.md5(fileContents);

		// Create attachment item
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([
				{
					key: attachmentKey,
					contentType: "text/plain",
				}
			]),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);
		Helpers.assert200ForObject(response);

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

		// Upload
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
		
		toDelete.push(md5);

		// Local invoke full-text-extractor if it's a local test run
		if (config.isLocalRun) {
			// Wait for SQS to make the message available
			await new Promise(r => setTimeout(r, 5000));
			const processedCount = await localInvoke();
			assert.equal(processedCount, 0);
		}
		else {
			// If it's a run on AWS, just wait for lambda to finish
			await new Promise(r => setTimeout(r, 10000));
		}


		// Get full text to ensure full-text-extractor was not triggered
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
		);
		Helpers.assert404(response);
	});

	it('should_not_add_pdf_from_desktop_client_to_queue', async function () {
		let json = await API.createItem("book", false, this, 'json');
		assert.equal(0, json.meta.numChildren);
		let parentKey = json.key;

		json = await API.createAttachmentItem("imported_file", [], parentKey, this, 'json');
		let attachmentKey = json.key;
		let version = json.version;

		let filename = "dummy.pdf";
		let mtime = Date.now();
		makeRandomPDF();

		let fileContents = fs.readFileSync("./work/dummy.pdf");
		let size = Buffer.from(fileContents.toString()).byteLength;
		let md5 = Helpers.md5(fileContents.toString());

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

		// Upload
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
				"If-None-Match": "*",
				"X-Zotero-Version": "6.0.0"
			}
		);
		Helpers.assert204(response);
		
		toDelete.push(md5);

		// Local invoke full-text-extractor if it's a local test run
		if (config.isLocalRun) {
			await new Promise(r => setTimeout(r, 5000));
			const processedCount = await localInvoke();
			assert.equal(processedCount, 0);
		}
		else {
			// If it's a run on AWS, just wait for lambda to finish
			await new Promise(r => setTimeout(r, 10000));
		}

		// Get full text to ensure full-text-extractor was not called
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
		);
		Helpers.assert404(response);
	});

	it('should_extract_pdf_text_group', async function () {
		let filename = "dummy.pdf";
		let mtime = Date.now();
		const pdfText = makeRandomPDF();

		let fileContents = fs.readFileSync("./work/dummy.pdf");
		let size = Buffer.from(fileContents.toString()).byteLength;
		let hash = Helpers.md5(fileContents.toString());

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
				mtime: mtime,
				filename: filename,
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
		toDelete.push(hash);

		// Local invoke full-text-extractor if it's a local test run
		if (config.isLocalRun) {
			await new Promise(r => setTimeout(r, 5000));
			const processedCount = await localInvoke();
			assert.equal(processedCount, 1);
		}
		else {
			// If it's a run on AWS, just wait for lambda to finish
			await new Promise(r => setTimeout(r, 10000));
		}
		
		// Get full text to ensure full-text-extractor worked
		response = await API.groupGet(
			groupID,
			"items/" + attachmentKey + "/fulltext",
		);
		Helpers.assert200(response);
		const data = JSON.parse(response.data);
		assert.property(data, 'content');
		assert.equal(data.content.trim(), pdfText);
		await API.deleteGroup(groupID);
	});
	

	const makeRandomPDF = () => {
		const randomText = Helpers.uniqueToken();
		const pdfData = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>>
endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>>
endobj
3 0 obj<</Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 500 800] /Contents 6 0 R>>
endobj
4 0 obj<</Font <</F1 5 0 R>>>>
endobj
5 0 obj<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>
endobj
6 0 obj
<</Length 44>>
stream
BT /F1 24 Tf 175 720 Td (${randomText})Tj ET
endstream
endobj
xref
0 7
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000111 00000 n
0000000212 00000 n
0000000250 00000 n
0000000317 00000 n
trailer <</Size 7/Root 1 0 R>>
startxref
406
%%EOF`;
		fs.writeFileSync(`./work/dummy.pdf`, pdfData);
		return randomText;
	};
});


