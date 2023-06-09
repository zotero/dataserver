import chai from 'chai';
const assert = chai.assert;
import config from 'config';
import API from '../../api3.js';
import Helpers from '../../helpers3.js';
import shared from "../shared.js";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import HTTP from '../../httpHandler.js';
import { localInvoke } from '../../full-text-extractor/src/local_invoke.mjs';


describe('FileTestTests', function () {
	this.timeout(0);
	let toDelete = [];
	const s3Client = new S3Client({ region: "us-east-1" });

	before(async function () {
		await shared.API3Before();
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

		// Local invoke full-text-extractor
		await localInvoke();

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


