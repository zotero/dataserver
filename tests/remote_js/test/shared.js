var config = require('config');
const API = require('../api2.js');
const API3 = require('../api3.js');
const { resetGroups } = require("../groupsSetup.js");

module.exports = {

	resetGroups: async () => {
		await resetGroups();
	},
	

	API1Before: async () => {
		const credentials = await API.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API.useAPIVersion(1);
		await API.userClear(config.userID);
	},
	API1After: async () => {
		await API.userClear(config.userID);
	},

	API2Before: async () => {
		const credentials = await API.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API.useAPIVersion(2);
		await API.setKeyOption(config.userID, config.apiKey, 'libraryNotes', 1);
		await API.userClear(config.userID);
	},
	API2After: async () => {
		await API.userClear(config.userID);
	},

	API3Before: async () => {
		const credentials = await API3.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API3.useAPIVersion(3);
		await API3.useAPIKey(config.apiKey);
		await API3.resetSchemaVersion();
		await API3.setKeyUserPermission(config.apiKey, 'notes', true);
		await API3.setKeyUserPermission(config.apiKey, 'write', true);
		await API3.userClear(config.userID);
	},
	API3After: async () => {
		await API3.useAPIKey(config.apiKey);
		await API3.userClear(config.userID);
	}
};
