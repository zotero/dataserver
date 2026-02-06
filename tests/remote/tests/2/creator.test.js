/**
 * Creator tests for API v2
 * Port of tests/remote/tests/API/2/CreatorTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { xpathSelect } from '../../xpath.js';
import { API } from '../../api2.js';
import {
	assert204
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Creators (API v2)', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testCreatorSummary
	it('should generate creator summary', async function () {
		let xml = await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: 'Test'
				}
			]
		}, 'atom');

		let data = API.parseDataFromAtomEntry(xml);
		let itemKey = data.key;
		let json = JSON.parse(data.content);

		let creatorSummaryNode = xpathSelect(xml, '//atom:entry/zapi:creatorSummary/text()', true);
		assert.equal(creatorSummaryNode.nodeValue, 'Test');

		json.creators.push({
			creatorType: 'author',
			firstName: 'Alice',
			lastName: 'Foo'
		});

		let response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(itemKey);
		creatorSummaryNode = xpathSelect(xml, '//atom:entry/zapi:creatorSummary/text()', true);
		assert.equal(creatorSummaryNode.nodeValue, 'Test and Foo');

		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		json.creators.push({
			creatorType: 'author',
			firstName: 'Bob',
			lastName: 'Bar'
		});

		response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(itemKey);
		creatorSummaryNode = xpathSelect(xml, '//atom:entry/zapi:creatorSummary/text()', true);
		assert.equal(creatorSummaryNode.nodeValue, 'Test et al.');
	});
});
