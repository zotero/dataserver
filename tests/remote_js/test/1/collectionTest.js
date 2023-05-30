const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API1Setup, API1WrapUp } = require("../shared.js");

describe('CollectionTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API1Setup();
	});

	after(async function () {
		await API1WrapUp();
	});

	const testNewSingleCollection = async () => {
		const collectionName = "Test Collection";
		const json = { name: "Test Collection", parent: false };

		const response = await API.userPost(
			config.userID,
			`collections?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);

		const xml = await API.getXMLFromResponse(response);
		Helpers.assertStatusCode(response, 200);
		const totalResults = Helpers.xpathEval(xml, '//feed/zapi:totalResults');
		const numCollections = Helpers.xpathEval(xml, '//feed//entry/zapi:numCollections');
		assert.equal(parseInt(totalResults), 1);
		assert.equal(parseInt(numCollections), 0);
		const data = await API.parseDataFromAtomEntry(xml);
		const jsonResponse = JSON.parse(data.content);
		assert.equal(jsonResponse.name, collectionName);
		return jsonResponse;
	};

	it('testNewSingleSubcollection', async function () {
		let parent = await testNewSingleCollection();
		parent = parent.collectionKey;
		const name = "Test Subcollection";
		const json = { name: name, parent: parent };
		
		let response = await API.userPost(
			config.userID,
			`collections?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
		let xml = API.getXMLFromResponse(response);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//feed/zapi:totalResults')), 1);
		
		const dataSub = API.parseDataFromAtomEntry(xml);

		const jsonResponse = JSON.parse(dataSub.content);
		assert.equal(jsonResponse.name, name);
		assert.equal(jsonResponse.parent, parent);
		response = await API.userGet(
			config.userID,
			`collections/${parent}?key=${config.apiKey}`
		);
		Helpers.assertStatusCode(response, 200);
		xml = await API.getXMLFromResponse(response);
		assert.equal(parseInt(Helpers.xpathEval(xml, '/atom:entry/zapi:numCollections')), 1);
	});

	it('testNewSingleCollectionWithoutParentProperty', async function () {
		const name = "Test Collection";
		const json = { name: name };

		const response = await API.userPost(
			config.userID,
			`collections?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
		const xml = await API.getXMLFromResponse(response);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//feed/zapi:totalResults')), 1);
		const data = await API.parseDataFromAtomEntry(xml);
		const jsonResponse = JSON.parse(data.content);
		assert.equal(jsonResponse.name, name);
	});

	it('testEditSingleCollection', async function () {
		API.useAPIVersion(2);
		const xml = await API.createCollection("Test", false);
		const data = await API.parseDataFromAtomEntry(xml);
		const key = data.key;
		API.useAPIVersion(1);

		const xmlCollection = await API.getCollectionXML(data.key);
		const contentElement = Helpers.xpathEval(xmlCollection, '//atom:entry/atom:content', true);
		const etag = contentElement.getAttribute("etag");
		assert.isString(etag);
		const newName = "Test 2";
		const json = { name: newName, parent: false };

		const response = await API.userPut(
			config.userID,
			`collections/${key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Match": etag
			}
		);
		Helpers.assertStatusCode(response, 200);
		const xmlResponse = await API.getXMLFromResponse(response);
		const dataResponse = await API.parseDataFromAtomEntry(xmlResponse);
		const jsonResponse = JSON.parse(dataResponse.content);
		assert.equal(jsonResponse.name, newName);
	});
});
