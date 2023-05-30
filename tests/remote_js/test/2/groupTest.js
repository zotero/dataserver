const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After, resetGroups } = require("../shared.js");
const { JSDOM } = require("jsdom");

describe('GroupTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Before();
		await resetGroups();
	});

	after(async function () {
		await API2After();
	});

	it('testUpdateMetadata', async function () {
		const response = await API.userGet(
			config.userID,
			"groups?fq=GroupType:PublicOpen&content=json&key=" + config.apiKey
		);
		Helpers.assertStatusCode(response, 200);

		// Get group API URI and ETag
		const xml = API.getXMLFromResponse(response);
		const groupID = Helpers.xpathEval(xml, "//atom:entry/zapi:groupID");
		let urlComponent = Helpers.xpathEval(xml, "//atom:entry/atom:link[@rel='self']", true);
		let url = urlComponent.getAttribute("href");
		url = url.replace(config.apiURLPrefix, '');
		const etagComponent = Helpers.xpathEval(xml, "//atom:entry/atom:content", true);
		const etag = etagComponent.getAttribute("etag");

		// Make sure format=etags returns the same ETag
		const response2 = await API.userGet(
			config.userID,
			"groups?format=etags&key=" + config.apiKey
		);
		Helpers.assertStatusCode(response2, 200);
		const json = JSON.parse(response2.data);
		assert.equal(etag, json[groupID]);

		// Update group metadata
		const jsonBody = JSON.parse(Helpers.xpathEval(xml, "//atom:entry/atom:content"));
		const xmlDoc = new JSDOM("<group></group>");
		const groupXML = xmlDoc.window.document.getElementsByTagName("group")[0];
		var name, description, urlField;
		for (const [key, value] of Object.entries(jsonBody)) {
			switch (key) {
				case 'id':
				case 'members':
					continue;

				case 'name': {
					name = "My Test Group " + Math.floor(Math.random() * 10001);
					groupXML.setAttribute("name", name);
					break;
				}


				case 'description': {
					description = "This is a test description " + Math.floor(Math.random() * 10001);
					const newNode = xmlDoc.window.document.createElement(key);
					newNode.innerHTML = description;
					groupXML.appendChild(newNode);
					break;
				}


				case 'url': {
					urlField = "http://example.com/" + Math.floor(Math.random() * 10001);
					const newNode = xmlDoc.window.document.createElement(key);
					newNode.innerHTML = urlField;
					groupXML.appendChild(newNode);
					break;
				}


				default:
					groupXML.setAttributeNS(null, key, value);
			}
		}
		
		const response3 = await API.put(
			url,
			groupXML.outerHTML,
			{ "Content-Type": "text/xml" },
			{
				username: config.rootUsername,
				password: config.rootPassword
			}
		);
		Helpers.assertStatusCode(response3, 200);
		const xml2 = API.getXMLFromResponse(response3);
		const nameFromGroup = xml2.documentElement.getElementsByTagName("title")[0].innerHTML;
		assert.equal(name, nameFromGroup);

		const response4 = await API.userGet(
			config.userID,
			`groups?format=etags&key=${config.apiKey}`
		);
		Helpers.assertStatusCode(response4, 200);
		const json2 = JSON.parse(response4.data);
		const newETag = json2[groupID];
		assert.notEqual(etag, newETag);

		// Check ETag header on individual group request
		const response5 = await API.groupGet(
			groupID,
			"?content=json&key=" + config.apiKey
		);
		Helpers.assertStatusCode(response5, 200);
		assert.equal(newETag, response5.headers.etag[0]);
		const json3 = JSON.parse(API.getContentFromResponse(response5));
		assert.equal(name, json3.name);
		assert.equal(description, json3.description);
		assert.equal(urlField, json3.url);
	});
});
