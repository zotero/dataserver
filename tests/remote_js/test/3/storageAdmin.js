const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('StorageAdminTests', function () {
	this.timeout(config.timeout);
	const DEFAULT_QUOTA = 300;

	before(async function () {
		await API3Setup();
		await setQuota(0, 0, DEFAULT_QUOTA);
	});

	after(async function () {
		await API3WrapUp();
	});

	const setQuota = async (quota, expiration, expectedQuota) => {
		let response = await API.post('users/' + config.userID + '/storageadmin',
			`quota=${quota}&expiration=${expiration}`,
			{ "content-type": 'application/x-www-form-urlencoded' },
			{
				username: config.rootUsername,
				password: config.rootPassword
			});
		Helpers.assertStatusCode(response, 200);
		let xml = API.getXMLFromResponse(response);
		let xmlQuota = xml.getElementsByTagName("quota")[0].innerHTML;
		assert.equal(xmlQuota, expectedQuota);
		if (expiration != 0) {
			const xmlExpiration = xml.getElementsByTagName("expiration")[0].innerHTML;
			assert.equal(xmlExpiration, expiration);
		}
	};
	it('test2GB', async function () {
		const quota = 2000;
		const expiration = Math.floor(Date.now() / 1000) + (86400 * 365);
		await setQuota(quota, expiration, quota);
	});

	it('testUnlimited', async function () {
		const quota = 'unlimited';
		const expiration = Math.floor(Date.now() / 1000) + (86400 * 365);
		await setQuota(quota, expiration, quota);
	});
});
