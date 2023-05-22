const config = require("../config.js");
const API = require('../api2.js');
const API3 = require('../api3.js');

module.exports = {

	API1Setup: async () => {
		const credentials = await API.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API.useAPIVersion(1);
		await API.userClear(config.userID);
	},
	API1WrapUp: async () => {
		await API.userClear(config.userID);
	},

	API2Setup: async () => {
		const credentials = await API.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API.useAPIVersion(2);
		await API.setKeyOption(config.userID, config.apiKey, 'libraryNotes', 1);
		await API.userClear(config.userID);
	},
	API2WrapUp: async () => {
		await API.userClear(config.userID);
	},

	API3Setup: async () => {
		const credentials = await API.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API3.useAPIVersion(3);
		await API3.resetSchemaVersion();
		await API3.setKeyUserPermission(config.apiKey, 'notes', true);
		await API3.setKeyUserPermission(config.apiKey, 'write', true);
		await API.userClear(config.userID);
	},
	API3WrapUp: async () => {
		await API.userClear(config.userID);
	}
};
