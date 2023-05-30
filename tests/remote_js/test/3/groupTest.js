const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { JSDOM } = require('jsdom');
const { API3Before, API3After } = require("../shared.js");

describe('Tests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});


	it('testDeleteGroup', async function () {
		let groupID = await API.createGroup({
			owner: config.userID,
			type: 'Private',
			libraryReading: 'all',
		});
		await API.groupCreateItem(groupID, 'book', false, this, 'key');
		await API.groupCreateItem(groupID, 'book', false, this, 'key');
		await API.groupCreateItem(groupID, 'book', false, this, 'key');
		await API.deleteGroup(groupID);

		const response = await API.groupGet(groupID, '');
		Helpers.assert404(response);
	});

	it('testUpdateMemberJSON', async function () {
		let groupID = await API.createGroup({
			owner: config.userID,
			type: 'Private',
			libraryReading: 'all'
		});

		let response = await API.userGet(config.userID, `groups?format=versions&key=${config.apiKey}`);
		Helpers.assert200(response);
		let version = JSON.parse(response.data)[groupID];

		response = await API.superPost(`groups/${groupID}/users`, '<user id="' + config.userID2 + '" role="member"/>', { 'Content-Type': 'text/xml' });
		Helpers.assert200(response);

		response = await API.userGet(config.userID, `groups?format=versions&key=${config.apiKey}`);
		Helpers.assert200(response);
		let json = JSON.parse(response.data);
		let newVersion = json[groupID];
		assert.notEqual(version, newVersion);
	
		response = await API.groupGet(groupID, '');
		Helpers.assert200(response);
		Helpers.assertEquals(newVersion, response.headers['last-modified-version'][0]);

		await API.deleteGroup(groupID);
	});

	it('testUpdateMetadataAtom', async function () {
		let response = await API.userGet(
			config.userID,
			`groups?fq=GroupType:PublicOpen&content=json&key=${config.apiKey}`
		);
		Helpers.assert200(response);

		// Get group API URI and version
		let xml = API.getXMLFromResponse(response);

		let groupID = await Helpers.xpathEval(xml, '//atom:entry/zapi:groupID');
		let urlComponent = await Helpers.xpathEval(xml, "//atom:entry/atom:link[@rel='self']", true, false);
		let url = urlComponent.getAttribute('href');
		url = url.replace(config.apiURLPrefix, '');
		let version = JSON.parse(API.parseDataFromAtomEntry(xml).content).version;

		// Make sure format=versions returns the same version
		response = await API.userGet(
			config.userID,
			`groups?format=versions&key=${config.apiKey}`
		);
		Helpers.assert200(response);
		let json = JSON.parse(response.data);
		assert.equal(version, json[groupID]);

		// Update group metadata
		json = JSON.parse(await Helpers.xpathEval(xml, "//atom:entry/atom:content"));

		const xmlDoc = new JSDOM("<group></group>");
		const groupXML = xmlDoc.window.document.getElementsByTagName("group")[0];
		let name, description, urlField, newNode;
		for (let [key, val] of Object.entries(json)) {
			switch (key) {
				case 'id':
				case 'members':
					continue;

				case 'name':
					name = "My Test Group " + Math.random();
					groupXML.setAttribute('name', name);
					break;

				case 'description':
					description = "This is a test description " + Math.random();
					newNode = xmlDoc.window.document.createElement(key);
					newNode.innerHTML = description;
					groupXML.appendChild(newNode);
					break;

				case 'url':
					urlField = "http://example.com/" + Math.random();
					newNode = xmlDoc.window.document.createElement(key);
					newNode.innerHTML = urlField;
					groupXML.appendChild(newNode);
					break;

				default:
					groupXML.setAttributeNS(null, key, val);
			}
		}
		const payload = groupXML.outerHTML;
		response = await API.put(
			url,
			payload,
			{ "Content-Type": "text/xml" },
			{
				username: config.rootUsername,
				password: config.rootPassword
			}
		);
		Helpers.assert200(response);
		xml = API.getXMLFromResponse(response);
		let group = await Helpers.xpathEval(xml, '//atom:entry/atom:content/zxfer:group', true, true);
		Helpers.assertCount(1, group);
		assert.equal(name, group[0].getAttribute('name'));

		response = await API.userGet(
			config.userID,
			`groups?format=versions&key=${config.apiKey}`
		);
		Helpers.assert200(response);
		json = JSON.parse(response.data);
		let newVersion = json[groupID];
		assert.notEqual(version, newVersion);

		// Check version header on individual group request
		response = await API.groupGet(
			groupID,
			`?content=json&key=${config.apiKey}`
		);
		Helpers.assert200(response);
		assert.equal(newVersion, response.headers['last-modified-version'][0]);
		json = JSON.parse(API.getContentFromResponse(response));
		assert.equal(name, json.name);
		assert.equal(description, json.description);
		assert.equal(urlField, json.url);
	});

	it('testUpdateMetadataJSON', async function () {
		const response = await API.userGet(
			config.userID,
			"groups?fq=GroupType:PublicOpen"
		);

		Helpers.assert200(response);

		const json = API.getJSONFromResponse(response)[0];
		const groupID = json.id;
		let url = json.links.self.href;
		url = url.replace(config.apiURLPrefix, '');
		const version = json.version;

		const response2 = await API.userGet(
			config.userID,
			"groups?format=versions&key=" + config.apiKey
		);

		Helpers.assert200(response2);

		Helpers.assertEquals(version, JSON.parse(response2.data)[groupID]);

		const xmlDoc = new JSDOM("<group></group>");
		const groupXML = xmlDoc.window.document.getElementsByTagName("group")[0];
		let name, description, urlField, newNode;
		for (const [key, val] of Object.entries(json.data)) {
			switch (key) {
				case 'id':
				case 'version':
				case 'members':
					continue;
				case 'name': {
					name = "My Test Group " + Helpers.uniqueID();
					groupXML.setAttributeNS(null, key, name);
					break;
				}
				case 'description': {
					description = "This is a test description " + Helpers.uniqueID();
					newNode = xmlDoc.window.document.createElement(key);
					newNode.innerHTML = description;
					groupXML.appendChild(newNode);
					break;
				}
				case 'url': {
					urlField = "http://example.com/" + Helpers.uniqueID();
					newNode = xmlDoc.window.document.createElement(key);
					newNode.innerHTML = urlField;
					groupXML.appendChild(newNode);
					break;
				}
				default:
					groupXML.setAttributeNS(null, key, val);
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

		Helpers.assert200(response3);

		const xmlResponse = API.getXMLFromResponse(response3);
		const group = Helpers.xpathEval(xmlResponse, '//atom:entry/atom:content/zxfer:group', true, true);

		Helpers.assertCount(1, group);
		Helpers.assertEquals(name, group[0].getAttribute('name'));

		const response4 = await API.userGet(
			config.userID,
			"groups?format=versions&key=" + config.apiKey
		);

		Helpers.assert200(response4);

		const json2 = JSON.parse(response4.data);
		const newVersion = json2[groupID];

		assert.notEqual(version, newVersion);

		const response5 = await API.groupGet(
			groupID,
			""
		);

		Helpers.assert200(response5);
		Helpers.assertEquals(newVersion, response5.headers['last-modified-version'][0]);
		const json3 = API.getJSONFromResponse(response5).data;

		Helpers.assertEquals(name, json3.name);
		Helpers.assertEquals(description, json3.description);
		Helpers.assertEquals(urlField, json3.url);
	});

	it('test_group_should_not_appear_in_search_until_first_populated', async function () {
		const name = Helpers.uniqueID(14);
		const groupID = await API.createGroup({
			owner: config.userID,
			type: 'PublicClosed',
			name,
			libraryReading: 'all'
		});

		let response = await API.superGet(`groups?q=${name}`);
		Helpers.assertNumResults(response, 0);

		await API.groupCreateItem(groupID, 'book', false, this);

		response = await API.superGet(`groups?q=${name}`);
		Helpers.assertNumResults(response, 1);

		await API.deleteGroup(groupID);
	});
});
