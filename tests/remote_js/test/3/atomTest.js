const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('AtomTests', function () {
	this.timeout(config.timeout);
	let items = [];

	before(async function () {
		await API3Setup();
		Helpers.useV3();
		let key = await API.createItem("book", {
			title: "Title",
			creators: [{
				creatorType: "author",
				firstName: "First",
				lastName: "Last"
			}]
		}, false, "key");
		items[key] = '<content xmlns:zapi="http://zotero.org/ns/api" type="application/xml"><zapi:subcontent zapi:type="bib"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, First. <i>Title</i>, n.d.</div></div></zapi:subcontent><zapi:subcontent zapi:type="json">'
			+ '{"key":"","version":0,"itemType":"book","title":"Title","creators":[{"creatorType":"author","firstName":"First","lastName":"Last"}],"abstractNote":"","series":"","seriesNumber":"","volume":"","numberOfVolumes":"","edition":"","place":"","publisher":"","date":"","numPages":"","language":"","ISBN":"","shortTitle":"","url":"","accessDate":"","archive":"","archiveLocation":"","libraryCatalog":"","callNumber":"","rights":"","extra":"","tags":[],"collections":[],"relations":{},"dateAdded":"","dateModified":""}'
			+ '</zapi:subcontent></content>';
		key = await API.createItem("book", {
			title: "Title 2",
			creators: [
				{
					creatorType: "author",
					firstName: "First",
					lastName: "Last"
				},
				{
					creatorType: "editor",
					firstName: "Ed",
					lastName: "McEditor"
				}
			]
		}, false, "key");
		items[key] = '<content xmlns:zapi="http://zotero.org/ns/api" type="application/xml"><zapi:subcontent zapi:type="bib"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, First. <i>Title 2</i>. Edited by Ed McEditor, n.d.</div></div></zapi:subcontent><zapi:subcontent zapi:type="json">'
			+ '{"key":"","version":0,"itemType":"book","title":"Title 2","creators":[{"creatorType":"author","firstName":"First","lastName":"Last"},{"creatorType":"editor","firstName":"Ed","lastName":"McEditor"}],"abstractNote":"","series":"","seriesNumber":"","volume":"","numberOfVolumes":"","edition":"","place":"","publisher":"","date":"","numPages":"","language":"","ISBN":"","shortTitle":"","url":"","accessDate":"","archive":"","archiveLocation":"","libraryCatalog":"","callNumber":"","rights":"","extra":"","tags":[],"collections":[],"relations":{},"dateAdded":"","dateModified":""}'
			+ '</zapi:subcontent></content>';
	});

	after(async function () {
		await API3WrapUp();
	});


	it('testFeedURIs', async function () {
		let userID = config.userID;

		let response = await API.userGet(userID, "items?format=atom");
		Helpers.assert200(response);
		let xml = await API.getXMLFromResponse(response);
		let links = Helpers.xpathEval(xml, "//atom:feed/atom:link", true, true);
		Helpers.assertEquals(
			config.apiURLPrefix + "users/" + userID + "/items?format=atom",
			links[0].getAttribute("href")
		);

		response = await API.userGet(userID, "items?format=atom&order=dateModified&sort=asc");
		Helpers.assert200(response);
		xml = await API.getXMLFromResponse(response);
		links = Helpers.xpathEval(xml, "//atom:feed/atom:link", true, true);
		Helpers.assertEquals(
			config.apiURLPrefix + "users/" + userID + "/items?direction=asc&format=atom&sort=dateModified",
			links[0].getAttribute("href")
		);
	});

	//Requires citation server to run
	it('testMultiContent', async function () {
		this.skip();
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		let response = await API.userGet(
			config.userID,
			{ params: { itemKey: keyStr, content: 'bib,json' } }
		);
		Helpers.assert200(response);
		let xml = await API.getXMLFromResponse(response);
		Helpers.assertTotalResults(response, keys.length);

		let entries = xml.xpath('//atom:entry');
		for (let i = 0; i < entries.length; i++) {
			let entry = entries[i];
			let key = entry.children("http://zotero.org/ns/api").key.toString();
			let content = entry.content.asXML();

			// Add namespace prefix (from <entry>)
			content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
			// Strip variable key and version
			content = content.replace(
				/"key": "[A-Z0-9]{8}",(\s+)"version": [0-9]+/,
				'"key": "",$1"version": 0'
			);

			// Strip dateAdded/dateModified
			let iso8601Pattern = '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z';
			content = content.replace(
				/"dateAdded": "' + iso8601Pattern + '",(\s+)"dateModified": "' + iso8601Pattern + '"/,
				'"dateAdded": "",$1"dateModified": ""'
			);

			assert.equal(items[key], content);
		}
	});

	it('testTotalResults', async function () {
		let response = await API.userHead(
			config.userID,
			"items?format=atom"
		);
		Helpers.assert200(response);
		Helpers.assertTotalResults(response, Object.keys(items).length);

		response = await API.userGet(
			config.userID,
			"items?format=atom"
		);
		Helpers.assert200(response);
		const xml = await API.getXMLFromResponse(response);
		Helpers.assertTotalResults(response, Object.keys(items).length);
		// Make sure there's no totalResults tag
		assert.lengthOf(Helpers.xpathEval(xml, '//atom:feed/zapi:totalResults', false, true), 0);
	});

	it('testAcceptHeader', async function () {
		let response = await API.userGet(
			config.userID,
			"items",
			{ Accept: "application/atom+xml,application/rdf+xml,application/rss+xml,application/xml,text/xml,*/*" }
		);
		Helpers.assertContentType(response, 'application/atom+xml');

		// But format= should still override
		response = await API.userGet(
			config.userID,
			"items?format=json",
			{ Accept: "application/atom+xml,application/rdf+xml,application/rss+xml,application/xml,text/xml,*/*" }
		);
		Helpers.assertContentType(response, 'application/json');
	});
});
