/**
 * Creator API tests
 * Port of tests/remote/tests/API/3/CreatorTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert204
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Creators', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: test_should_add_creator_with_correct_case
	it('should add creator with correct case', async function () {
		// Create two items with lowercase
		let data = {
			creators: [
				{
					creatorType: 'author',
					name: 'test'
				}
			]
		};
		await API.createItem('book', data);
		await API.createItem('book', data);

		// Create capitalized
		let json = await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: 'Test'
				}
			]
		}, 'json');
		let _itemKey = json.key;

		assert.equal(json.data.creators[0].name, 'Test');
	});

	// PHP: testCreatorSummaryJSON
	it('should create correct creator summary in JSON', async function () {
		let json = await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: 'Test'
				}
			]
		}, 'json');
		let itemKey = json.key;

		assert.equal(json.meta.creatorSummary, 'Test');

		json = json.data;
		json.creators.push({
			creatorType: 'author',
			firstName: 'Alice',
			lastName: 'Foo'
		});

		let response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		json = await API.getItem(itemKey, 'json');
		assert.equal(json.meta.creatorSummary, 'Test and Foo');

		json = json.data;
		json.creators.push({
			creatorType: 'author',
			firstName: 'Bob',
			lastName: 'Bar'
		});

		response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		json = await API.getItem(itemKey, 'json');
		assert.equal(json.meta.creatorSummary, 'Test et al.');
	});

	// PHP: testCreatorSummaryAtom
	it('should create correct creator summary in Atom', async function () {
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
		let creatorSummary = creatorSummaryNode ? creatorSummaryNode.nodeValue : '';
		assert.equal(creatorSummary, 'Test');

		json.creators.push({
			creatorType: 'author',
			firstName: 'Alice',
			lastName: 'Foo'
		});

		let response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(itemKey);
		creatorSummaryNode = xpathSelect(xml, '//atom:entry/zapi:creatorSummary/text()', true);
		creatorSummary = creatorSummaryNode ? creatorSummaryNode.nodeValue : '';
		assert.equal(creatorSummary, 'Test and Foo');

		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		json.creators.push({
			creatorType: 'author',
			firstName: 'Bob',
			lastName: 'Bar'
		});

		response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(itemKey);
		creatorSummaryNode = xpathSelect(xml, '//atom:entry/zapi:creatorSummary/text()', true);
		creatorSummary = creatorSummaryNode ? creatorSummaryNode.nodeValue : '';
		assert.equal(creatorSummary, 'Test et al.');
	});

	// PHP: testEmptyCreator
	it('should handle empty creator', async function () {
		// UTF-8 BOM character
		let json = await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: '\uFEFF'
				}
			]
		}, 'json');
		assert.notProperty(json.meta, 'creatorSummary');
	});

	// PHP: testCreatorCaseSensitivity
	it('should handle creator case sensitivity', async function () {
		await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: 'SMITH'
				}
			]
		}, 'json');
		let json = await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: 'Smith'
				}
			]
		}, 'json');
		assert.equal(json.data.creators[0].name, 'Smith');
	});

	// PHP: test_should_allow_emoji_in_creator_name
	it('should allow emoji in creator name', async function () {
		let char = '🐻'; // 4-byte character
		let json = await API.createItem('book', {
			creators: [
				{
					creatorType: 'author',
					name: char
				}
			]
		}, 'json');
		assert.equal(json.data.creators[0].name, char);
	});
});
