const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('CreatorTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
	});

	it('testCreatorSummary', async function () {
		const xml = await API.createItem('book',
			{
				creators: [
					{
						creatorType: 'author',
						name: 'Test'
					}
				]
			}, true);

		const data = API.parseDataFromAtomEntry(xml);
		const itemKey = data.key;
		const json = JSON.parse(data.content);

		const creatorSummary = Helpers.xpathEval(xml, '//atom:entry/zapi:creatorSummary');
		assert.equal('Test', creatorSummary);

		json.creators.push({
			creatorType: 'author',
			firstName: 'Alice',
			lastName: 'Foo'
		});

		const response = await API.userPut(config.userID, `items/${itemKey}?key=${config.apiKey}`, JSON.stringify(json));
		Helpers.assertStatusCode(response, 204);

		const updatedXml = await API.getItemXML(itemKey);
		const updatedCreatorSummary = Helpers.xpathEval(updatedXml, '//atom:entry/zapi:creatorSummary');
		assert.equal('Test and Foo', updatedCreatorSummary);

		const updatedData = API.parseDataFromAtomEntry(updatedXml);
		const updatedJson = JSON.parse(updatedData.content);

		updatedJson.creators.push({
			creatorType: 'author',
			firstName: 'Bob',
			lastName: 'Bar'
		});

		const response2 = await API.userPut(config.userID, `items/${itemKey}?key=${config.apiKey}`, JSON.stringify(updatedJson));
		Helpers.assertStatusCode(response2, 204);

		const finalXml = await API.getItemXML(itemKey);
		const finalCreatorSummary = Helpers.xpathEval(finalXml, '//atom:entry/zapi:creatorSummary');
		assert.equal('Test et al.', finalCreatorSummary);
	});
});
