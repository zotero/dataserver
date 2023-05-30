const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('Tests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});
	beforeEach(async function () {
		await API.userClear(config.userID);
	});

	afterEach(async function () {
		await API.userClear(config.userID);
	});
});
