const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { JSDOM } = require('jsdom');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('CollectionTests', function () {
	this.timeout(config.timeout);
	let keyObj = {};
	before(async function () {
		await API2Setup();
		const item1 = {
			title: 'Title',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last',
				},
			],
		};
	
		const key1 = await API.createItem('book', item1, null, 'key');
		const itemXml1
			= '<content xmlns:zapi="http://zotero.org/ns/api" type="application/xml">'
			+ '<zapi:subcontent zapi:type="bib">'
			+ '<div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;">'
			+ '<div class="csl-entry">Last, First. <i>Title</i>, n.d.</div>'
			+ '</div></zapi:subcontent><zapi:subcontent zapi:type="json">'
			+ '{"itemKey":"","itemVersion":0,"itemType":"book","title":"Title","creators":[{"creatorType":"author","firstName":"First","lastName":"Last"}],"abstractNote":"","series":"","seriesNumber":"","volume":"","numberOfVolumes":"","edition":"","place":"","publisher":"","date":"","numPages":"","language":"","ISBN":"","shortTitle":"","url":"","accessDate":"","archive":"","archiveLocation":"","libraryCatalog":"","callNumber":"","rights":"","extra":"","tags":[],"collections":[],"relations":{}}'
			+ '</zapi:subcontent></content>';
		keyObj[key1] = itemXml1;
	
		const item2 = {
			title: 'Title 2',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last',
				},
				{
					creatorType: 'editor',
					firstName: 'Ed',
					lastName: 'McEditor',
				},
			],
		};
	
		const key2 = await API.createItem('book', item2, null, 'key');
		const itemXml2
			= '<content xmlns:zapi="http://zotero.org/ns/api" type="application/xml">'
			+ '<zapi:subcontent zapi:type="bib">'
			+ '<div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;">'
			+ '<div class="csl-entry">Last, First. <i>Title 2</i>. Edited by Ed McEditor, n.d.</div>'
			+ '</div></zapi:subcontent><zapi:subcontent zapi:type="json">'
			+ '{"itemKey":"","itemVersion":0,"itemType":"book","title":"Title 2","creators":[{"creatorType":"author","firstName":"First","lastName":"Last"},{"creatorType":"editor","firstName":"Ed","lastName":"McEditor"}],"abstractNote":"","series":"","seriesNumber":"","volume":"","numberOfVolumes":"","edition":"","place":"","publisher":"","date":"","numPages":"","language":"","ISBN":"","shortTitle":"","url":"","accessDate":"","archive":"","archiveLocation":"","libraryCatalog":"","callNumber":"","rights":"","extra":"","tags":[],"collections":[],"relations":{}}'
			+ '</zapi:subcontent></content>';
		keyObj[key2] = itemXml2;
	});

	after(async function () {
		await API2WrapUp();
	});

	it('testFeedURIs', async function () {
		const userID = config.userID;
		
		const response = await API.userGet(
			userID,
			"items?key=" + config.apiKey
		);
		Helpers.assertStatusCode(response, 200);
		const xml = await API.getXMLFromResponse(response);
		const links = Helpers.xpathEval(xml, '/atom:feed/atom:link', true, true);
		assert.equal(config.apiURLPrefix + "users/" + userID + "/items", links[0].getAttribute('href'));
	
		// 'order'/'sort' should stay as-is, not turn into 'sort'/'direction'
		const response2 = await API.userGet(
			userID,
			"items?key=" + config.apiKey + "&order=dateModified&sort=asc"
		);
		Helpers.assertStatusCode(response2, 200);
		const xml2 = await API.getXMLFromResponse(response2);
		const links2 = Helpers.xpathEval(xml2, '/atom:feed/atom:link', true, true);
		assert.equal(config.apiURLPrefix + "users/" + userID + "/items?order=dateModified&sort=asc", links2[0].getAttribute('href'));
	});


	//Requires citation server to run
	it('testMultiContent', async function () {
		const keys = Object.keys(keyObj);
		const keyStr = keys.join(',');
	
		const response = await API.userGet(
			config.userID,
			`items?key=${config.apiKey}&itemKey=${keyStr}&content=bib,json`,
		);
		Helpers.assertStatusCode(response, 200);
		const xml = await API.getXMLFromResponse(response);
		assert.equal(Helpers.xpathEval(xml, '/atom:feed/zapi:totalResults'), keys.length);
	
		const entries = Helpers.xpathEval(xml, '//atom:entry', true, true);
		for (const entry of entries) {
			const key = entry.getElementsByTagName("zapi:key")[0].innerHTML;
			let content = entry.getElementsByTagName("content")[0].outerHTML;

			content = content.replace(
				'<content ',
				'<content xmlns:zapi="http://zotero.org/ns/api" ',
			);
			content = content.replace(
				/"itemKey": "[A-Z0-9]{8}",(\s+)"itemVersion": [0-9]+/,
				'"itemKey": "",$1"itemVersion": 0',
			);
			const contentDom = new JSDOM(content);
			const expectedDom = new JSDOM(keyObj[key]);
			assert.equal(contentDom.window.document.innerHTML, expectedDom.window.document.innerHTML);
		}
	});
});
